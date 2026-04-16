/**
 * Function 1: Hourly Solar Forecast Engine.
 *
 * Generates estimated hourly solar generation curves for summer, winter,
 * and shoulder seasons using PVGIS monthly irradiance data and a
 * simplified solar bell curve model.
 *
 * Pure function — no I/O, fully deterministic for a given input.
 */

// ── Types ───────────────────────────────────────────────────────────

export type Season = "summer" | "winter" | "shoulder";

export interface SolarForecastInput {
  /** System capacity in kWp. */
  capacityKwp: number;
  /** 12-element array: monthly average daily global irradiation (kWh/m2/day). */
  monthlyIrradiance: number[];
  /** Property latitude (for daylight hours estimation). */
  latitude: number;
  /** Panel tilt in degrees (default 35). */
  tiltDeg?: number;
}

export interface SeasonalForecast {
  season: Season;
  /** 24-element array: estimated kWh generated per hour. */
  hourlyCurve: number[];
  /** Total daily yield in kWh. */
  dailyYieldKwh: number;
  /** Peak hour generation in kWh. */
  peakHourKwh: number;
}

export interface SolarForecastResult {
  capacityKwp: number;
  annualYieldKwh: number;
  seasons: SeasonalForecast[];
}

// ── Season month mappings (0-indexed) ───────────────────────────────

const SEASON_MONTHS: Record<Season, number[]> = {
  summer: [5, 6, 7], // Jun, Jul, Aug
  winter: [11, 0, 1], // Dec, Jan, Feb
  shoulder: [2, 3, 4, 8, 9, 10], // Mar-May, Sep-Nov
};

// ── Daylight hours by latitude and season ───────────────────────────

/**
 * Estimate sunrise and sunset hour for a UK latitude and season.
 * Simplified model — uses seasonal averages for the UK (50-58°N).
 */
function getDaylightHours(latitude: number, season: Season): { sunrise: number; sunset: number } {
  // Clamp latitude to reasonable UK range
  const lat = Math.max(50, Math.min(58, latitude));
  // Higher latitude = more variation between seasons
  const latFactor = (lat - 50) / 8; // 0..1

  switch (season) {
    case "summer":
      return {
        sunrise: 4.5 - latFactor * 1.5, // ~4.5 in south, ~3 in north
        sunset: 20.5 + latFactor * 1.5, // ~20.5 in south, ~22 in north
      };
    case "winter":
      return {
        sunrise: 8 + latFactor * 0.5,
        sunset: 16 - latFactor * 0.5,
      };
    case "shoulder":
      return {
        sunrise: 6.5 - latFactor * 0.5,
        sunset: 18.5 + latFactor * 0.5,
      };
  }
}

// ── Solar bell curve ────────────────────────────────────────────────

/**
 * Generate a normalised solar generation bell curve across 24 hours.
 *
 * Models the sun's arc as a cosine curve between sunrise and sunset,
 * with peak at solar noon. The area under the curve sums to 1.0.
 */
function solarBellCurve(sunrise: number, sunset: number): number[] {
  const curve = new Array<number>(24).fill(0);
  const solarNoon = (sunrise + sunset) / 2;
  const halfDay = (sunset - sunrise) / 2;

  let sum = 0;
  for (let h = 0; h < 24; h++) {
    const hourMid = h + 0.5;
    if (hourMid >= sunrise && hourMid <= sunset) {
      // Cosine curve: 1 at noon, 0 at sunrise/sunset
      const angle = ((hourMid - solarNoon) / halfDay) * (Math.PI / 2);
      curve[h] = Math.cos(angle);
      sum += curve[h]!;
    }
  }

  // Normalise so the curve sums to 1.0
  if (sum > 0) {
    for (let h = 0; h < 24; h++) {
      curve[h]! /= sum;
    }
  }

  return curve;
}

// ── Engine ───────────────────────────────────────────────────────────

export function generateSolarForecast(input: SolarForecastInput): SolarForecastResult {
  const { capacityKwp, monthlyIrradiance, latitude } = input;

  const seasons: SeasonalForecast[] = (["summer", "winter", "shoulder"] as const).map((season) => {
    const months = SEASON_MONTHS[season];

    // Average irradiance across the season's months (kWh/m2/day)
    const avgIrradiance =
      months.reduce((sum, m) => sum + (monthlyIrradiance[m] ?? 0), 0) / months.length;

    // Total daily yield = irradiance * capacity * system efficiency
    // PVGIS already accounts for tilt/orientation in its output, so we
    // apply a conservative 85% system efficiency (inverter + cable losses).
    const dailyYieldKwh = avgIrradiance * capacityKwp * 0.85;

    // Distribute across daylight hours using the bell curve
    const { sunrise, sunset } = getDaylightHours(latitude, season);
    const bell = solarBellCurve(sunrise, sunset);
    const hourlyCurve = bell.map((fraction) => dailyYieldKwh * fraction);

    const peakHourKwh = Math.max(...hourlyCurve);

    return { season, hourlyCurve, dailyYieldKwh, peakHourKwh };
  });

  // Annual yield: day-weighted sum across seasons
  const annualYieldKwh =
    seasons[0]!.dailyYieldKwh * 92 + // ~92 summer days
    seasons[1]!.dailyYieldKwh * 90 + // ~90 winter days
    seasons[2]!.dailyYieldKwh * 183; // ~183 shoulder days

  return { capacityKwp, annualYieldKwh, seasons };
}
