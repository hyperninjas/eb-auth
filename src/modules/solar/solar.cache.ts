import { redis } from "../../infra/redis";
import { getLogger } from "../../infra/logger";
import type { SolarConfig } from "./solar.config";
import type { SolarForecast } from "./solar.client";

/**
 * Redis caching layer for solar forecast data.
 *
 * Caches solar forecasts by location (lat/lng/capacity/tilt/orientation).
 * Solar data changes rarely (weather patterns, sun angle) — forecasts are
 * slow to compute — so a 24h TTL is conservative.
 *
 * Cache misses are silent (return null); cache failures are logged but
 * never throw — a Redis outage degrades to pass-through, not a 500.
 */

const KEY_PREFIX = "solar:forecast:";

export interface SolarCache {
  getCachedForecast: (cacheKey: string) => Promise<SolarForecast | null>;
  setCachedForecast: (cacheKey: string, data: SolarForecast) => Promise<void>;
}

/**
 * Generate a cache key from solar forecast parameters.
 * Ensures consistent keys for the same location/capacity.
 */
export function generateSolarCacheKey(params: {
  latitude: number;
  longitude: number;
  capacityKwp: number;
  tilt: number;
  orientation: number;
}): string {
  return [
    params.latitude.toFixed(4),
    params.longitude.toFixed(4),
    params.capacityKwp.toFixed(1),
    params.tilt,
    params.orientation,
  ].join(":");
}

export function createSolarCache(config: SolarConfig): SolarCache {
  const ttl = config.cacheTtlSeconds;

  return {
    getCachedForecast: (cacheKey) => safeGet(`${KEY_PREFIX}${cacheKey}`),

    setCachedForecast: (cacheKey, data) => safeSet(`${KEY_PREFIX}${cacheKey}`, data, ttl),
  };
}

async function safeGet(key: string): Promise<SolarForecast | null> {
  try {
    const cached = await redis.get(key);
    if (!cached) return null;
    return JSON.parse(cached) as SolarForecast;
  } catch (err) {
    getLogger().warn({ err, key }, "Solar cache read failed");
    return null;
  }
}

async function safeSet(key: string, value: SolarForecast, ttlSeconds: number): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (err) {
    getLogger().warn({ err, key }, "Solar cache write failed");
  }
}
