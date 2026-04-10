import { redis } from "../../infra/redis";
import { getLogger } from "../../infra/logger";
import type { EpcConfig } from "./epc.config";

/**
 * Redis caching layer for EPC data.
 *
 * Caches both search results (by postcode) and individual certificates
 * (by LMK key). EPC data changes very rarely — certificates are valid
 * for 10 years — so a 24h default TTL is conservative.
 *
 * Cache misses are silent (return null); cache failures are logged but
 * never throw — a Redis outage degrades to pass-through, not a 500.
 */

const KEY_PREFIX_SEARCH = "epc:search:";
const KEY_PREFIX_CERT = "epc:cert:";

export interface EpcCache {
  getCachedSearch: (postcode: string) => Promise<string | null>;
  setCachedSearch: (postcode: string, data: string) => Promise<void>;
  getCachedCertificate: (lmkKey: string) => Promise<string | null>;
  setCachedCertificate: (lmkKey: string, data: string) => Promise<void>;
}

export function createEpcCache(config: EpcConfig): EpcCache {
  const ttl = config.cacheTtlSeconds;

  return {
    getCachedSearch: (postcode) => safeGet(`${KEY_PREFIX_SEARCH}${normalisePostcode(postcode)}`),

    setCachedSearch: (postcode, data) =>
      safeSet(`${KEY_PREFIX_SEARCH}${normalisePostcode(postcode)}`, data, ttl),

    getCachedCertificate: (lmkKey) => safeGet(`${KEY_PREFIX_CERT}${lmkKey}`),

    setCachedCertificate: (lmkKey, data) => safeSet(`${KEY_PREFIX_CERT}${lmkKey}`, data, ttl),
  };
}

/** Strip spaces and lowercase for consistent cache keys. */
function normalisePostcode(postcode: string): string {
  return postcode.replace(/\s+/g, "").toLowerCase();
}

async function safeGet(key: string): Promise<string | null> {
  try {
    return await redis.get(key);
  } catch (err) {
    getLogger().warn({ err, key }, "EPC cache read failed");
    return null;
  }
}

async function safeSet(key: string, value: string, ttlSeconds: number): Promise<void> {
  try {
    await redis.set(key, value, "EX", ttlSeconds);
  } catch (err) {
    getLogger().warn({ err, key }, "EPC cache write failed");
  }
}
