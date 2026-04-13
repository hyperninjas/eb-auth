import { getLogger } from "../../infra/logger";
import type { SolarConfig } from "./solar.config";
import { SolarUpstreamError } from "./solar.errors";

/**
 * Response shape from Quartz Solar API.
 *
 * predictions: {
 *   power_kw: {
 *     "2024-04-12T06:00+00:00": 0.5,
 *     "2024-04-12T06:15+00:00": 0.8,
 *     ...
 *   }
 * }
 */
export interface QuartzRawResponse {
  predictions: {
    power_kw: Record<string, number>;
  };
}

/**
 * Normalised hourly solar forecast.
 */
export interface SolarForecastEntry {
  timestamp: string; // ISO 8601
  powerKw: number;
}

export interface SolarForecast {
  entries: SolarForecastEntry[];
  totalYieldKwh: number; // Sum of all hourly entries
}

export interface SolarClient {
  /**
   * Fetch 48-hour solar forecast from Quartz Solar API.
   * Returns normalised hourly power predictions.
   */
  fetchForecast: (params: {
    latitude: number;
    longitude: number;
    capacityKwp: number;
    tilt: number;
    orientation: number;
  }) => Promise<SolarForecast>;
}

export function createSolarClient(config: SolarConfig): SolarClient {
  return {
    fetchForecast: async (params) => {
      const url = `${config.baseUrl}/forecast/`;
      const init: RequestInit = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          site: {
            latitude: params.latitude.toString(),
            longitude: params.longitude.toString(),
            capacity_kwp: params.capacityKwp.toString(),
            tilt: params.tilt.toString(),
            orientation: params.orientation.toString(),
          },
        }),
        signal: AbortSignal.timeout(config.httpTimeoutMs),
      };

      let res: Response;
      try {
        res = await fetch(url, init);
      } catch (err) {
        getLogger().error({ err, url }, "Solar API request failed");
        throw err;
      }

      const text = await res.text().catch(() => "");

      if (!res.ok) {
        getLogger().warn(
          { url, status: res.status, body: text.slice(0, 300) },
          "Solar API returned non-2xx",
        );
        throw new SolarUpstreamError(res.status, text.slice(0, 300));
      }

      if (!text) {
        throw new SolarUpstreamError(500, "Empty response from Solar API");
      }

      const data = JSON.parse(text) as QuartzRawResponse;
      const predictions = data.predictions?.power_kw ?? {};

      const entries: SolarForecastEntry[] = Object.entries(predictions).map(
        ([timestamp, powerKw]) => ({
          timestamp,
          powerKw: typeof powerKw === "number" ? powerKw : 0,
        }),
      );

      const totalYieldKwh = entries.reduce((sum, e) => sum + e.powerKw, 0);

      return {
        entries,
        totalYieldKwh,
      };
    },
  };
}
