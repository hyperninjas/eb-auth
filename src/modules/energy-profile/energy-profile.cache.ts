import { redis } from "../../infra/redis";
import { getLogger } from "../../infra/logger";
import type { EnergyProfileConfig } from "./energy-profile.config";

/**
 * Redis caching layer for the energy-profile module.
 *
 * Two tiers of TTL:
 *   - Profile data: 1 year (EPC data changes ~once per 10 years)
 *   - Forecast computations: 24 hours (derived data, stale faster)
 *
 * Cache failures are silent — a Redis outage degrades to pass-through.
 */

const PREFIX = "ep:";

export interface EnergyProfileCache {
  // Profile tier (1-year TTL)
  getProfile: (userId: string) => Promise<string | null>;
  setProfile: (userId: string, data: string) => Promise<void>;
  deleteProfile: (userId: string) => Promise<void>;

  // History tier (1-year TTL)
  getHistory: (profileId: string) => Promise<string | null>;
  setHistory: (profileId: string, data: string) => Promise<void>;
  deleteHistory: (profileId: string) => Promise<void>;

  // Forecast tier (24h TTL)
  getForecast: (profileId: string, type: string) => Promise<string | null>;
  setForecast: (profileId: string, type: string, data: string) => Promise<void>;

  // Load profile tier (7-day TTL)
  getLoadProfile: (profileId: string) => Promise<string | null>;
  setLoadProfile: (profileId: string, data: string) => Promise<void>;
  deleteLoadProfile: (profileId: string) => Promise<void>;

  /** Invalidate all forecast caches for a profile. */
  invalidateForecasts: (profileId: string) => Promise<void>;
}

export function createEnergyProfileCache(config: EnergyProfileConfig): EnergyProfileCache {
  const profileTtl = config.profileCacheTtlSeconds;
  const forecastTtl = config.forecastCacheTtlSeconds;
  const loadTtl = 604_800; // 7 days

  return {
    getProfile: (userId) => safeGet(`${PREFIX}profile:${userId}`),
    setProfile: (userId, data) => safeSet(`${PREFIX}profile:${userId}`, data, profileTtl),
    deleteProfile: (userId) => safeDel(`${PREFIX}profile:${userId}`),

    getHistory: (profileId) => safeGet(`${PREFIX}history:${profileId}`),
    setHistory: (profileId, data) => safeSet(`${PREFIX}history:${profileId}`, data, profileTtl),
    deleteHistory: (profileId) => safeDel(`${PREFIX}history:${profileId}`),

    getForecast: (profileId, type) => safeGet(`${PREFIX}forecast:${type}:${profileId}`),
    setForecast: (profileId, type, data) =>
      safeSet(`${PREFIX}forecast:${type}:${profileId}`, data, forecastTtl),

    getLoadProfile: (profileId) => safeGet(`${PREFIX}load:${profileId}`),
    setLoadProfile: (profileId, data) => safeSet(`${PREFIX}load:${profileId}`, data, loadTtl),
    deleteLoadProfile: (profileId) => safeDel(`${PREFIX}load:${profileId}`),

    invalidateForecasts: async (profileId) => {
      const types = ["solar", "cost", "tariff", "heatpump", "summary"];
      await Promise.all(types.map((t) => safeDel(`${PREFIX}forecast:${t}:${profileId}`)));
    },
  };
}

async function safeGet(key: string): Promise<string | null> {
  try {
    return await redis.get(key);
  } catch (err) {
    getLogger().warn({ err, key }, "Energy-profile cache read failed");
    return null;
  }
}

async function safeSet(key: string, value: string, ttlSeconds: number): Promise<void> {
  try {
    await redis.set(key, value, "EX", ttlSeconds);
  } catch (err) {
    getLogger().warn({ err, key }, "Energy-profile cache write failed");
  }
}

async function safeDel(key: string): Promise<void> {
  try {
    await redis.del(key);
  } catch (err) {
    getLogger().warn({ err, key }, "Energy-profile cache delete failed");
  }
}
