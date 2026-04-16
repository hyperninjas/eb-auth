/**
 * Standard UK residential 24-hour electricity load curve.
 *
 * Each element is the fraction of daily consumption that falls in that
 * hour (index 0 = midnight–1am, index 23 = 11pm–midnight). The array
 * sums to 1.0.
 *
 * Derived from Elexon Profile Class 1 (domestic unrestricted) averaged
 * across seasons. This is a simplified "typical day" — seasonal
 * variation is handled by the forecast engines.
 *
 * Distribution:
 *   Night (0–6):    ~15% — appliances on standby, fridge cycling
 *   Morning (7–9):  ~15% — kettle, shower, cooking
 *   Daytime (10–15): ~20% — lower occupancy, background loads
 *   Evening (16–21): ~40% — cooking, lighting, entertainment peak
 *   Late (22–23):   ~10% — winding down
 */
export const UK_LOAD_CURVE: readonly number[] = [
  0.02, // 00:00
  0.018, // 01:00
  0.017, // 02:00
  0.017, // 03:00
  0.018, // 04:00
  0.022, // 05:00
  0.03, // 06:00
  0.055, // 07:00
  0.058, // 08:00
  0.042, // 09:00
  0.035, // 10:00
  0.032, // 11:00
  0.033, // 12:00
  0.032, // 13:00
  0.03, // 14:00
  0.032, // 15:00
  0.045, // 16:00
  0.07, // 17:00
  0.085, // 18:00
  0.08, // 19:00
  0.065, // 20:00
  0.055, // 21:00
  0.05, // 22:00
  0.039, // 23:00
] as const;

/** Precomputed sum for normalisation — the weights are approximate and
 *  may not sum to exactly 1.0, so we normalise at runtime. */
const CURVE_SUM = UK_LOAD_CURVE.reduce((a, b) => a + b, 0);

/**
 * Distribute a daily kWh total across the standard 24h UK load curve.
 *
 * @returns 24-element array of hourly kWh values summing to `dailyKwh`.
 */
export function distributeLoad(dailyKwh: number): number[] {
  return UK_LOAD_CURVE.map((fraction) => dailyKwh * (fraction / CURVE_SUM));
}
