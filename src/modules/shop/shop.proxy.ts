// Express's `Response` collides with the global `fetch` Response type
// we use for upstream responses. Alias the Express one to keep both
// names available without ambiguity.
import { Router, type Request, type Response as ExpressResponse } from "express";
import { authGuard } from "../../middleware/auth-guard";
import { asyncHandler } from "../../middleware/async-handler";
import { getLogger } from "../../infra/logger";
import { getRequestId } from "../../infra/request-context";
import { ERROR_CODES, type ErrorResponse } from "../../http/openapi-shared";
import type { MedusaClient } from "./shop.client";
import type { ShopConfig } from "./shop.config";
import type { ShopProvisioner } from "./shop.provision";
import { shopRepository } from "./shop.repository";

/**
 * /api/shop/* → Medusa proxy.
 *
 * Design intent:
 *   - The browser uses Medusa's Store API directly (via this proxy)
 *     instead of every endpoint being remodelled in Express. New
 *     commerce features ship without a single line of new code here.
 *   - The browser NEVER sees a Medusa token. The proxy injects
 *     `x-publishable-api-key` server-side so it stays out of the
 *     browser's reach.
 *   - The browser NEVER sees a customer id either. Cart-customer
 *     attachment happens server-side in the cart-create interceptor
 *     immediately after Medusa creates an anonymous cart.
 *   - Errors from Medusa are rewritten into the same `ErrorResponse`
 *     envelope every other endpoint in the API uses, so the frontend
 *     handles ONE error shape across all of /api/*.
 *
 * What gets proxied:
 *   - GET  /api/shop/store/*   → GET  {medusa}/store/*
 *   - POST /api/shop/store/*   → POST {medusa}/store/*  (etc.)
 *   - The /admin namespace is intentionally NOT proxied. Admin-only
 *     operations belong on a separate ops surface, not behind a
 *     storefront session.
 *
 * Special cases:
 *   - `POST /api/shop/store/carts` → after Medusa returns the new
 *     cart, the proxy looks up the user's customer id and calls
 *     `POST /store/carts/:id/customer` server-side, then returns the
 *     attached cart to the browser. This is the linchpin of the
 *     whole integration — without it, orders are guest orders.
 */

export interface CreateShopProxyDeps {
  config: ShopConfig;
  client: MedusaClient;
  provisioner: ShopProvisioner;
}

// Headers we strip when forwarding browser → Medusa. Hop-by-hop headers
// (RFC 7230 §6.1) plus our own auth cookie which Medusa would only get
// confused by, plus the publishable key in case the browser tries to
// supply its own (we override it).
const STRIP_REQUEST_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "te",
  "trailer",
  "proxy-authorization",
  "proxy-authenticate",
  "cookie",
  "authorization",
  "content-length",
  "x-publishable-api-key",
]);

// Headers we strip when piping Medusa → browser. Hop-by-hop again,
// plus content-length (we re-encode) and any auth-set-cookie that
// Medusa might emit (we don't want Medusa setting cookies on our
// domain — there's exactly one cookie source and it's Better Auth).
const STRIP_RESPONSE_HEADERS = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "te",
  "trailer",
  "proxy-authenticate",
  "set-cookie",
  "content-length",
  "content-encoding",
]);

export function createShopProxyRouter(deps: CreateShopProxyDeps): Router {
  const router = Router();

  // Every shop route requires an authenticated user. The browser's
  // only credential is the Better Auth session cookie this guard
  // validates — there is no separate "shop login".
  router.use(authGuard);

  // Catch-all proxy. Express's `*` matches everything after the mount
  // path; req.params[0] is the suffix we forward to Medusa.
  router.all(
    "/store/*splat",
    asyncHandler(async (req: Request, res: ExpressResponse): Promise<void> => {
      // Best-effort lazy provisioning. If the user signed up before
      // shop was enabled, this is the first time we'll create their
      // Medusa customer. Failures are logged + 503'd via the central
      // error handler — same code path as every other domain error.
      await deps.provisioner.ensureCustomerForUser({
        id: req.user!.id,
        email: req.user!.email,
        name: req.user!.name,
      });

      // Build the upstream URL. `originalUrl` includes the query
      // string; `req.url` after the mount is the suffix we want, but
      // we use a manual reconstruction to keep the path explicit.
      const suffix = req.originalUrl.slice("/api/shop".length);
      const upstreamUrl = `${deps.config.medusaUrl}${suffix}`;

      // Forward request bytes verbatim. We DON'T re-stringify JSON —
      // express.json() already parsed it for us, so we re-encode it
      // here. For non-JSON payloads (none today, but file uploads
      // tomorrow) the cleanest fix would be to bypass express.json()
      // for /api/shop/* via a route-specific raw-body parser. Cross
      // that bridge when we get there.
      const headers = forwardRequestHeaders(req.headers, deps.config.publishableKey);
      const init: RequestInit = {
        method: req.method,
        headers,
        signal: AbortSignal.timeout(deps.config.httpTimeoutMs),
      };
      if (req.method !== "GET" && req.method !== "HEAD" && req.body !== undefined) {
        init.body = JSON.stringify(req.body);
      }

      let upstream: Response;
      try {
        upstream = await fetch(upstreamUrl, init);
      } catch (err) {
        // Network failure / timeout. AbortError + TimeoutError get
        // mapped to 504 by the central error handler; everything else
        // becomes a 502 we serialize ourselves so the envelope still
        // matches.
        if (isAbortOrTimeout(err)) throw err;
        getLogger().error({ err, upstreamUrl }, "Shop proxy upstream unreachable");
        sendUpstreamError(res, 502, "Shop upstream unreachable.");
        return;
      }

      // Forward the response. If Medusa returned an error, rewrite
      // the body into our ErrorResponse envelope so the frontend sees
      // a single shape across the whole API.
      if (!upstream.ok) {
        await forwardErrorResponse(upstream, res);
        return;
      }

      // Buffer the upstream body ONCE — Response.text() is one-shot.
      // Medusa's commerce payloads are small (product pages capped at
      // limit=100, single carts) so buffering is fine.
      let upstreamBody = await upstream.text();

      // Special case: cart create. Attach the customer server-side
      // before returning the response to the browser. The attach call
      // returns the updated cart, which we substitute for the
      // original (unattached) body so the browser sees customer_id
      // populated immediately. Failure to attach is logged but not
      // fatal — the original cart still goes back, and the next
      // /carts/:id GET will show the unattached state for support to
      // investigate.
      const isCartCreate =
        req.method === "POST" &&
        // Match exactly /api/shop/store/carts (no trailing path), so
        // we don't accidentally re-attach on /carts/:id/line-items.
        suffix.replace(/\?.*$/, "") === "/store/carts";

      if (isCartCreate) {
        const updated = await attachCustomerOnCartCreate(
          upstreamBody,
          req.user!.id,
          req.user!.email,
          deps,
        ).catch((err: unknown) => {
          getLogger().error({ err, userId: req.user!.id }, "Cart customer attach failed");
          return undefined;
        });
        if (updated) upstreamBody = updated;
      }

      forwardResponseHeaders(upstream.headers, res);
      res.status(upstream.status);
      res.send(upstreamBody);
    }),
  );

  return router;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function forwardRequestHeaders(
  reqHeaders: Request["headers"],
  publishableKey: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(reqHeaders)) {
    if (v === undefined) continue;
    if (STRIP_REQUEST_HEADERS.has(k.toLowerCase())) continue;
    out[k] = Array.isArray(v) ? v.join(",") : v;
  }
  // Inject the only credential Medusa needs to recognise the request
  // as coming from our sales channel.
  out["x-publishable-api-key"] = publishableKey;
  out["content-type"] = "application/json";
  return out;
}

function forwardResponseHeaders(upstream: Response["headers"], res: ExpressResponse): void {
  upstream.forEach((value: string, key: string) => {
    if (STRIP_RESPONSE_HEADERS.has(key.toLowerCase())) return;
    res.setHeader(key, value);
  });
}

/**
 * Cart-create interceptor.
 *
 * Takes the buffered upstream body (the response from Medusa's
 * `POST /store/carts`), extracts the new cart id, and calls
 * `POST /store/carts/:id` with the user's email. Medusa v2
 * auto-links a cart to the customer record matching that email
 * (verified empirically against 2.13.6) so we never need to send
 * a customer JWT or a customer_id from outside.
 *
 * Returns the updated cart body so the proxy can substitute it for
 * the original (unattached) response. Returns `undefined` on any
 * soft failure — the proxy falls back to forwarding the original.
 *
 * The mapping table lookup at the bottom is intentional: we don't
 * trust `req.user.email` alone for the link if the user has never
 * been provisioned (because Medusa might not yet have a customer
 * with that email). The mapping table check is the source of truth
 * for "this user has been provisioned in Medusa".
 */
async function attachCustomerOnCartCreate(
  upstreamBody: string,
  userId: string,
  userEmail: string,
  deps: CreateShopProxyDeps,
): Promise<string | undefined> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(upstreamBody);
  } catch {
    return undefined;
  }
  const cartId = extractCartId(parsed);
  if (!cartId) return undefined;

  const profile = await shopRepository.findByUserId(userId);
  if (!profile) {
    // Provisioning ran upstream (lazy retry in the proxy entry
    // point); if we STILL have no mapping it's because Medusa was
    // down for both the signup hook AND the lazy retry. The cart
    // exists but is unattached — log so support can reconcile, and
    // let the original body go out unchanged.
    getLogger().warn({ userId, cartId }, "Cart created without customer mapping");
    return undefined;
  }

  // Use the customer's email to attach. Medusa v2 auto-resolves the
  // customer record on the email match, populating cart.customer_id
  // server-side without any JWT or admin auth.
  return deps.client.attachCustomerToCart(cartId, userEmail);
}

async function forwardErrorResponse(upstream: Response, res: ExpressResponse): Promise<void> {
  const text = await upstream.text().catch(() => "");
  let upstreamMessage = text.slice(0, 500);
  try {
    const parsed: unknown = JSON.parse(text);
    const message = extractMessage(parsed);
    if (message) upstreamMessage = message;
  } catch {
    // Non-JSON upstream error; keep the raw text.
  }

  // Map upstream HTTP status to our ErrorCode set. Anything ≥ 500
  // collapses to SERVICE_UNAVAILABLE since it's not the client's fault.
  const status = upstream.status;
  const code =
    status === 400 || status === 422
      ? ERROR_CODES.BAD_REQUEST
      : status === 401 || status === 403
        ? ERROR_CODES.FORBIDDEN
        : status === 404
          ? ERROR_CODES.NOT_FOUND
          : status === 409
            ? ERROR_CODES.CONFLICT
            : ERROR_CODES.SERVICE_UNAVAILABLE;

  sendUpstreamError(res, status, upstreamMessage, code);
}

function sendUpstreamError(
  res: ExpressResponse,
  status: number,
  message: string,
  code: (typeof ERROR_CODES)[keyof typeof ERROR_CODES] = ERROR_CODES.SERVICE_UNAVAILABLE,
): void {
  const body: ErrorResponse = {
    status,
    code,
    message,
    requestId: getRequestId(),
  };
  res.status(status).json(body);
}

function isAbortOrTimeout(err: unknown): boolean {
  return err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
}

/**
 * Pull `cart.id` out of an unknown parsed JSON value. Returns
 * undefined if the shape doesn't match — used by the cart-create
 * interceptor which already has a fallback path.
 */
function extractCartId(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const cart = (value as { cart?: unknown }).cart;
  if (typeof cart !== "object" || cart === null) return undefined;
  const id = (cart as { id?: unknown }).id;
  return typeof id === "string" ? id : undefined;
}

/**
 * Pull `message` out of an unknown parsed JSON value (Medusa error
 * envelopes are `{ type, message }`). Returns undefined if the shape
 * doesn't match.
 */
function extractMessage(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const msg = (value as { message?: unknown }).message;
  return typeof msg === "string" ? msg : undefined;
}
