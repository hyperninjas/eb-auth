/**
 * 10-Year Technology Stepper — maps the year solar PV was first detected
 * on a property (the "Birth Date") to the typical panel wattage of that
 * era. Used by the hardware extrapolation engine to estimate system size.
 *
 * Source: UK solar industry averages by installation cohort.
 */

export interface PanelEra {
  /** Inclusive start year (undefined = no lower bound). */
  fromYear?: number;
  /** Inclusive end year (undefined = no upper bound). */
  toYear?: number;
  /** Typical watt-peak per panel in this era. */
  wattage: number;
  /** Human-readable technology description. */
  technology: string;
}

export const PANEL_ERAS: PanelEra[] = [
  { toYear: 2016, wattage: 250, technology: "Standard Polycrystalline" },
  { fromYear: 2017, toYear: 2020, wattage: 320, technology: "Standard Monocrystalline" },
  { fromYear: 2021, toYear: 2023, wattage: 400, technology: "Half-cut PERC" },
  { fromYear: 2024, wattage: 430, technology: "Modern N-Type" },
];

/** Look up panel wattage for a given installation year. */
export function getPanelWattage(year: number): PanelEra {
  const era = PANEL_ERAS.find(
    (e) =>
      (e.fromYear === undefined || year >= e.fromYear) &&
      (e.toYear === undefined || year <= e.toYear),
  );
  // Fallback to latest era if somehow no match (future-proof)
  return era ?? PANEL_ERAS[PANEL_ERAS.length - 1]!;
}
