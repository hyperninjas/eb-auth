import { redis } from "../../infra/redis";
import { getLogger } from "../../infra/logger";
import type { WeatherConfig } from "./weather.config";
import type { WeatherForecast } from "./weather.client";

/**
 * Redis caching layer for weather forecast data.
 *
 * Caches weather forecasts by location (lat/lng).
 * Weather data updates 4x daily from meteorological models — 6h TTL
 * balances freshness with API performance.
 *
 * Cache misses are silent (return null); cache failures are logged but
 * never throw — a Redis outage degrades to pass-through, not a 500.
 */

const KEY_PREFIX = "weather:forecast:";

export interface WeatherCache {
  getCachedForecast: (cacheKey: string) => Promise<WeatherForecast | null>;
  setCachedForecast: (cacheKey: string, data: WeatherForecast) => Promise<void>;
}

/**
 * Generate a cache key from weather forecast parameters.
 * Ensures consistent keys for the same location.
 */
export function generateWeatherCacheKey(params: { latitude: number; longitude: number }): string {
  return [params.latitude.toFixed(4), params.longitude.toFixed(4)].join(":");
}

export function createWeatherCache(config: WeatherConfig): WeatherCache {
  const ttl = config.cacheTtlSeconds;

  return {
    getCachedForecast: (cacheKey) => safeGet(`${KEY_PREFIX}${cacheKey}`),

    setCachedForecast: (cacheKey, data) => safeSet(`${KEY_PREFIX}${cacheKey}`, data, ttl),
  };
}

async function safeGet(key: string): Promise<WeatherForecast | null> {
  try {
    const cached = await redis.get(key);
    if (!cached) return null;
    return JSON.parse(cached) as WeatherForecast;
  } catch (err) {
    getLogger().warn({ err, key }, "Weather cache read failed");
    return null;
  }
}

async function safeSet(key: string, value: WeatherForecast, ttlSeconds: number): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (err) {
    getLogger().warn({ err, key }, "Weather cache write failed");
  }
}
