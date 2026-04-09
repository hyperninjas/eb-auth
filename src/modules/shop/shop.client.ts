import { getLogger } from "../../infra/logger";
import type { ShopConfig } from "./shop.config";

/**
 * Tiny Medusa client — only the calls the shop module makes ITSELF.
 *
 * The proxy ([shop.proxy.ts]) handles every other Medusa endpoint by
 * forwarding the browser's request bytes verbatim, so it doesn't go
 * through this client. The two methods here cover the two operations
 * the proxy CAN'T do because they're triggered by something other than
 * the browser:
 *
 *   1. createCustomer  — called by the Better Auth post-signup hook
 *      to provision a Medusa customer record bound to our user.id.
 *      Uses the admin API (no AuthIdentity is created — Better Auth
 *      remains the sole credential authority).
 *
 *   2. attachCustomerToCart — called by the proxy's cart-create
 *      interceptor immediately after `POST /store/carts` succeeds, so
 *      orders end up owned by the right customer.
 *
 * Both calls go through `medusaFetch()` which centralises timeout
 * handling, header injection, and error logging. Returning errors as
 * thrown exceptions (not Result types) keeps the call sites short.
 */

export interface MedusaCustomer {
  id: string;
  email: string;
  metadata?: Record<string, unknown> | null;
}

export interface MedusaClient {
  /** Create a customer record bound to our user via metadata.external_user_id. */
  createCustomer: (input: {
    email: string;
    firstName?: string;
    lastName?: string;
    externalUserId: string;
  }) => Promise<MedusaCustomer>;

  /**
   * Look up an existing customer by exact email match. Returns the
   * first match (Medusa enforces email uniqueness on create) or
   * undefined if no customer with that email exists.
   *
   * Used by the provisioning fallback chain: when our mapping table
   * doesn't know about a user but Medusa MIGHT have an orphaned
   * customer record for them (e.g. signup-time hook half-completed,
   * or our DB was restored from a backup older than Medusa's),
   * this is how we recover the link without creating a duplicate.
   */
  findCustomerByEmail: (email: string) => Promise<MedusaCustomer | undefined>;

  /**
   * Attach a customer to an existing anonymous cart by setting the
   * cart's email field. Medusa v2 auto-links a cart to the customer
   * record matching the email — verified empirically against 2.13.6:
   * `POST /store/carts/:id` with `{ email }` populates `customer_id`
   * server-side without any customer auth, just the publishable key.
   *
   * Why not `POST /store/carts/:id/customer`: that endpoint requires
   * a customer-authenticated session token (Bearer JWT), which is
   * exactly what we don't want — Better Auth owns identity and the
   * browser never sees a Medusa token.
   *
   * Returns the raw upstream JSON body (unparsed string) so the
   * proxy can forward it to the browser unchanged.
   */
  attachCustomerToCart: (cartId: string, customerEmail: string) => Promise<string>;
}

export function createMedusaClient(config: ShopConfig): MedusaClient {
  // Medusa v2 secret API keys authenticate via HTTP Basic auth: the
  // key is the username, the password is empty. This is non-obvious
  // (the docs imply Bearer in places) — the Bearer form returns 401
  // on /admin/* with no useful error. Verified empirically against
  // Medusa 2.13.6: `curl --user sk_xxx: ...` works, Bearer doesn't.
  const adminAuthHeader = "Basic " + Buffer.from(`${config.adminToken}:`).toString("base64");

  return {
    createCustomer: async ({ email, firstName, lastName, externalUserId }) => {
      // No `password` field — that's deliberate. Without a password,
      // Medusa does NOT create an AuthIdentity, which is exactly what
      // we want. Better Auth owns identity; Medusa owns commerce.
      const body = {
        email,
        first_name: firstName ?? "",
        last_name: lastName ?? "",
        metadata: { external_user_id: externalUserId },
      };
      const data = await medusaFetch<{ customer: MedusaCustomer }>(
        config,
        "POST",
        "/admin/customers",
        { Authorization: adminAuthHeader },
        body,
      );
      return data.customer;
    },

    findCustomerByEmail: async (email) => {
      // Filter on exact email match. Medusa's admin API supports
      // both `email=` (exact) and `q=` (full-text) — we want exact
      // because the recovery path MUST not match a substring or
      // similar email and silently link the wrong customer.
      // Limit=2 (not 1) so we can detect the impossible-but-paranoid
      // case where Medusa has more than one record for the same
      // email (would indicate a constraint violation upstream).
      const params = new URLSearchParams({ email, limit: "2" });
      const data = await medusaFetch<{ customers: MedusaCustomer[]; count: number }>(
        config,
        "GET",
        `/admin/customers?${params.toString()}`,
        { Authorization: adminAuthHeader },
      );
      if (data.count === 0) return undefined;
      if (data.count > 1) {
        // Should be impossible — Medusa enforces email uniqueness on
        // create. Log so we notice if it ever happens, but pick the
        // first one (likely the oldest / canonical record) to keep
        // provisioning unblocked.
        getLogger().warn(
          { email, count: data.count, ids: data.customers.map((c) => c.id) },
          "Multiple Medusa customers found for the same email",
        );
      }
      return data.customers[0];
    },

    attachCustomerToCart: async (cartId, customerEmail) => {
      // POST /store/carts/:id with the customer's email. Medusa
      // auto-links a cart to a customer record with the same email,
      // which is exactly the linkage we want without ever needing
      // a customer JWT. The publishable key is the only credential.
      //
      // Returns the raw response text so the proxy can forward it
      // to the browser unchanged. The body contains the updated
      // cart with `customer_id` populated.
      return medusaFetchRaw(
        config,
        "POST",
        `/store/carts/${cartId}`,
        { "x-publishable-api-key": config.publishableKey },
        { email: customerEmail },
      );
    },
  };
}

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * Low-level HTTP call into Medusa. Returns the raw response text on
 * 2xx; throws a plain Error with the status + body on non-2xx so
 * callers can wrap into a domain error with their own context.
 *
 * Centralised here so timeout / header / error logging behaviour
 * stays consistent across both the parsed (`medusaFetch`) and raw
 * (`medusaFetchRaw`) variants.
 */
async function medusaFetchText(
  config: ShopConfig,
  method: HttpMethod,
  path: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<string> {
  const url = `${config.medusaUrl}${path}`;
  const init: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...headers,
    },
    // AbortSignal.timeout fires a TimeoutError that bubbles to the
    // central error-handler `isAbortOrTimeoutError` branch and becomes
    // a 504 Gateway Timeout response — same path as any other slow
    // upstream the app talks to.
    signal: AbortSignal.timeout(config.httpTimeoutMs),
  };
  if (body !== undefined) init.body = JSON.stringify(body);

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    getLogger().error({ err, url, method }, "Medusa request failed");
    throw err;
  }

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    getLogger().warn({ url, method, status: res.status, body: text }, "Medusa returned non-2xx");
    throw new Error(`Medusa ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  }
  return text;
}

/**
 * JSON-parsing variant — used by callers that need a typed value.
 */
async function medusaFetch<T = unknown>(
  config: ShopConfig,
  method: HttpMethod,
  path: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<T> {
  const text = await medusaFetchText(config, method, path, headers, body);
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

/**
 * Raw-text variant — used by callers that want to forward the
 * upstream body unchanged (e.g. the proxy's cart-attach interceptor,
 * which substitutes the attached-cart response for the original
 * cart-create body).
 */
function medusaFetchRaw(
  config: ShopConfig,
  method: HttpMethod,
  path: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<string> {
  return medusaFetchText(config, method, path, headers, body);
}
