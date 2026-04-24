import { getLogger } from "../../infra/logger";
import type { MedusaConfig } from "./medusa.config";

/**
 * Tiny Medusa HTTP client — only the calls the provisioning logic makes.
 *
 * Two methods:
 *   1. createCustomer — POST /admin/customers to provision a customer
 *      record bound to our user.id via metadata.external_user_id.
 *      Called by the post-signup hook.
 *
 *   2. findCustomerByEmail — GET /admin/customers?email=X to recover
 *      from partial failures or race conditions. Called by the three-layer
 *      provisioning fallback chain.
 *
 * Both calls go through `medusaFetch()` which centralises timeout handling,
 * header injection, and error logging. Returning errors as thrown exceptions
 * (not Result types) keeps the call sites short.
 */

export interface MedusaCustomer {
  id: string;
  email: string;
  metadata?: Record<string, unknown> | null;
}

export interface MedusaClient {
  /**
   * Create a customer record bound to our user via metadata.external_user_id.
   * No password is set — that's deliberate. Medusa will NOT create an
   * AuthIdentity without a password, which is exactly what we want. Better
   * Auth owns identity; Medusa owns commerce.
   */
  createCustomer: (input: {
    email: string;
    firstName?: string;
    lastName?: string;
    externalUserId: string;
  }) => Promise<MedusaCustomer>;

  /**
   * Look up an existing customer by exact email match. Returns the first
   * match (Medusa enforces email uniqueness on create) or undefined if no
   * customer with that email exists.
   *
   * Used by the provisioning fallback chain: when our mapping table doesn't
   * know about a user but Medusa MIGHT have an orphaned customer record
   * (e.g. signup-time hook half-completed, or our DB was restored from a
   * backup older than Medusa's), this is how we recover the link without
   * creating a duplicate.
   */
  findCustomerByEmail: (email: string) => Promise<MedusaCustomer | undefined>;
}

export function createMedusaClient(config: MedusaConfig): MedusaClient {
  // Medusa v2 secret API keys authenticate via HTTP Basic auth: the
  // key is the username, the password is empty. Verified empirically
  // against Medusa 2.13.6: `curl --user sk_xxx: ...` works, Bearer doesn't.
  const adminAuthHeader = "Basic " + Buffer.from(`${config.adminToken}:`).toString("base64");

  return {
    createCustomer: async ({ email, firstName, lastName, externalUserId }) => {
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
      // Filter on exact email match. Limit=2 (not 1) so we can detect the
      // paranoid case where Medusa has more than one record for the same
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
        // Should be impossible — Medusa enforces email uniqueness on create.
        // Log so we notice if it ever happens, but pick the first one
        // (likely the oldest / canonical record) to keep provisioning unblocked.
        getLogger().warn(
          { email, count: data.count, ids: data.customers.map((c) => c.id) },
          "Multiple Medusa customers found for the same email",
        );
      }
      return data.customers[0];
    },
  };
}

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * Low-level HTTP call into Medusa. Returns the parsed JSON on 2xx;
 * throws a plain Error with the status + body on non-2xx so callers
 * can wrap into a domain error with their own context.
 *
 * Centralised here so timeout / header / error logging behaviour stays
 * consistent across all Medusa calls.
 */
async function medusaFetchText(
  config: MedusaConfig,
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
    // AbortSignal.timeout fires a TimeoutError that bubbles to the central
    // error-handler and becomes a 504 Gateway Timeout response — same path
    // as any other slow upstream the app talks to.
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
  config: MedusaConfig,
  method: HttpMethod,
  path: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<T> {
  const text = await medusaFetchText(config, method, path, headers, body);
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}
