/**
 * EU JRC PVGIS API client.
 *
 * Fetches annual/monthly solar irradiance data for a given location.
 * The PVGIS API is free, requires no authentication, and provides
 * high-quality irradiance data for all of Europe including the UK.
 *
 * Results are stored in Postgres (not Redis) because they change at
 * most annually and are shared across users at the same location.
 */

import { getLogger } from "../../../infra/logger";
import { PvgisUpstreamError } from "../energy-profile.errors";
import type { EnergyProfileConfig } from "../energy-profile.config";

// ── Types ───────────────────────────────────────────────────────────

export interface PvgisMonthlyData {
  /** Month number (1-12). */
  month: number;
  /** Monthly average daily PV energy production (kWh/day). */
  E_d: number;
  /** Monthly PV energy production (kWh/month). */
  E_m: number;
  /** Monthly average daily global irradiation on fixed plane (kWh/m2/day). */
  "H(i)_d": number;
  /** Monthly global irradiation on fixed plane (kWh/m2/month). */
  "H(i)_m": number;
}

export interface PvgisResult {
  /** 12-element array of monthly irradiance (kWh/m2/day), index 0 = January. */
  monthlyIrradiance: number[];
  /** Optimal tilt angle for fixed installation. */
  optimalAngle: number;
  /** Estimated annual PV energy yield per kWp installed (kWh/kWp/year). */
  annualYieldKwhPerKwp: number;
}

export interface PvgisClient {
  /** Fetch solar irradiance data for a location. */
  getIrradiance: (latitude: number, longitude: number) => Promise<PvgisResult>;
}

// ── PVGIS API response shape ────────────────────────────────────────

interface PvgisApiResponse {
  outputs: {
    monthly: {
      fixed: PvgisMonthlyData[];
    };
    totals: {
      fixed: Record<string, number>;
    };
  };
  inputs: {
    mounting_system: {
      fixed: {
        slope: { value: number };
        azimuth: { value: number };
      };
    };
  };
}

// ── Client factory ──────────────────────────────────────────────────

export function createPvgisClient(config: EnergyProfileConfig): PvgisClient {
  return {
    getIrradiance: async (latitude, longitude) => {
      // Round to 2 decimals for cache dedup (PVGIS resolution is ~3km)
      const lat = Math.round(latitude * 100) / 100;
      const lon = Math.round(longitude * 100) / 100;

      const params = new URLSearchParams({
        lat: lat.toString(),
        lon: lon.toString(),
        peakpower: "1", // 1 kWp reference system
        loss: "14", // 14% system losses (industry standard)
        angle: "35", // UK optimal tilt
        aspect: "0", // South-facing
        outputformat: "json",
      });

      const url = `${config.pvgisBaseUrl}/PVcalc?${params.toString()}`;
      const init: RequestInit = {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(config.pvgisTimeoutMs),
      };

      let res: Response;
      try {
        res = await fetch(url, init);
      } catch (err) {
        getLogger().error({ err, url }, "PVGIS API request failed");
        throw err;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        getLogger().warn(
          { url, status: res.status, body: text.slice(0, 300) },
          "PVGIS API non-2xx",
        );
        throw new PvgisUpstreamError(res.status, text.slice(0, 300));
      }

      const data = (await res.json()) as PvgisApiResponse;

      // Extract monthly irradiance (kWh/m2/day) from H(i)_d field
      const monthlyIrradiance = new Array<number>(12).fill(0);
      for (const m of data.outputs.monthly.fixed) {
        monthlyIrradiance[m.month - 1] = m["H(i)_d"];
      }

      return {
        monthlyIrradiance,
        optimalAngle: data.inputs.mounting_system.fixed.slope.value,
        annualYieldKwhPerKwp: data.outputs.totals.fixed["E_y"] ?? 0,
      };
    },
  };
}
