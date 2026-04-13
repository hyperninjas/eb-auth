import { getLogger } from "../../infra/logger";
import type { WeatherConfig } from "./weather.config";
import { WeatherUpstreamError } from "./weather.errors";

/**
 * Response shape from Open-Meteo API.
 *
 * {
 *   daily: {
 *     time: ["2024-04-12", "2024-04-13", ...],
 *     temperature_2m_max: [18.5, 20.2, ...],
 *     temperature_2m_min: [10.3, 11.1, ...],
 *     weather_code: [0, 2, ...],
 *     shortwave_radiation_sum: [15.2, 14.8, ...]
 *   }
 * }
 */
export interface OpenMeteoRawResponse {
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    weather_code: number[];
    shortwave_radiation_sum: number[];
  };
}

/**
 * Single day forecast.
 */
export interface DailyForecast {
  date: string; // YYYY-MM-DD
  temperatureMin: number;
  temperatureMax: number;
  weatherCode: number;
  shortwaveRadiation: number;
}

/**
 * Complete weather forecast.
 */
export interface WeatherForecast {
  dailyForecasts: DailyForecast[];
  temperatureMin: number;
  temperatureMax: number;
  dominantWeatherCode: number;
}

export interface WeatherClient {
  /**
   * Fetch 7-day weather forecast from Open-Meteo API.
   * Returns daily forecasts with temps, weather codes, and radiation.
   */
  fetchForecast: (params: { latitude: number; longitude: number }) => Promise<WeatherForecast>;
}

export function createWeatherClient(config: WeatherConfig): WeatherClient {
  return {
    fetchForecast: async (params) => {
      const url = new URL(`${config.baseUrl}/v1/forecast`);
      url.searchParams.set("latitude", params.latitude.toString());
      url.searchParams.set("longitude", params.longitude.toString());
      url.searchParams.set(
        "daily",
        "temperature_2m_max,temperature_2m_min,weather_code,shortwave_radiation_sum",
      );
      url.searchParams.set("timezone", "auto");
      url.searchParams.set("forecast_days", "7");

      const init: RequestInit = {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(config.httpTimeoutMs),
      };

      let res: Response;
      try {
        res = await fetch(url.toString(), init);
      } catch (err) {
        getLogger().error({ err, url: url.toString() }, "Weather API request failed");
        throw err;
      }

      const text = await res.text().catch(() => "");

      if (!res.ok) {
        getLogger().warn(
          { url: url.toString(), status: res.status, body: text.slice(0, 300) },
          "Weather API returned non-2xx",
        );
        throw new WeatherUpstreamError(res.status, text.slice(0, 300));
      }

      if (!text) {
        throw new WeatherUpstreamError(500, "Empty response from Weather API");
      }

      const data = JSON.parse(text) as OpenMeteoRawResponse;
      const daily = data.daily ?? {};

      const dailyForecasts: DailyForecast[] = (daily.time ?? []).map((date, i) => ({
        date,
        temperatureMin: daily.temperature_2m_min?.[i] ?? 0,
        temperatureMax: daily.temperature_2m_max?.[i] ?? 0,
        weatherCode: daily.weather_code?.[i] ?? 0,
        shortwaveRadiation: daily.shortwave_radiation_sum?.[i] ?? 0,
      }));

      // Calculate min/max across all days
      const allTemps = [...(daily.temperature_2m_min ?? []), ...(daily.temperature_2m_max ?? [])];
      const temperatureMin = allTemps.length > 0 ? Math.min(...allTemps) : 0;
      const temperatureMax = allTemps.length > 0 ? Math.max(...allTemps) : 0;

      // Find dominant weather code (most frequent)
      const codeFreq = new Map<number, number>();
      for (const code of daily.weather_code ?? []) {
        codeFreq.set(code, (codeFreq.get(code) ?? 0) + 1);
      }
      let dominantWeatherCode = 0;
      let maxCount = 0;
      for (const [code, count] of codeFreq) {
        if (count > maxCount) {
          maxCount = count;
          dominantWeatherCode = code;
        }
      }

      return {
        dailyForecasts,
        temperatureMin,
        temperatureMax,
        dominantWeatherCode,
      };
    },
  };
}
