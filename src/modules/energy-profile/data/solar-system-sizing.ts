/**
 * Solar System Sizing Rules — derives inverter capacity and battery size
 * from panel count and capacity.
 *
 * Standard panel spec: 435W per panel.
 * Sizing logic based on real-world UK installer practice.
 */

export interface SolarSystemSize {
  /** Panel count */
  panelCount: number;
  /** Total capacity in kWp (panelCount × 0.435) */
  capacityKwp: number;
  /** Inverter size in kW */
  inverterKw: number;
  /** Battery capacity in kWh (if applicable) */
  batteryKwh: number;
}

const PANEL_WATTAGE = 435; // Standard modern panel (W)

/**
 * Size a solar system based on panel count.
 *
 * Rules:
 * - Inverter: Typically sized to match or slightly exceed panel capacity
 *   - Up to 3 kW: 3.6 kW inverter
 *   - 3–6 kW: 5 kW inverter
 *   - 6–8 kW: 8 kW inverter
 *   - >8 kW: 10 kW inverter
 *
 * - Battery: Recommended storage capacity
 *   - ≤6 panels (≤2.6 kW): 5 kWh
 *   - 7–12 panels (≤5.2 kW): 10 kWh
 *   - 13–20 panels (≤8.7 kW): 15 kWh
 *   - >20 panels: 20 kWh
 */
export function solarSystemSize(panelCount: number): SolarSystemSize {
  const capacityKwp = (panelCount * PANEL_WATTAGE) / 1000;

  // Inverter sizing: match or exceed capacity
  const inverterKw = selectInverterSize(capacityKwp);

  // Battery sizing: based on panel count tiers
  const batteryKwh = selectBatterySize(panelCount);

  return {
    panelCount,
    capacityKwp,
    inverterKw,
    batteryKwh,
  };
}

/**
 * Select standard inverter size based on system capacity.
 * Options: 3.6, 5, 8, 10, 12 kW (common UK offerings).
 */
function selectInverterSize(capacityKwp: number): number {
  if (capacityKwp <= 3.0) return 3.6;
  if (capacityKwp <= 5.0) return 5;
  if (capacityKwp <= 7.5) return 8;
  if (capacityKwp <= 10.0) return 10;
  return 12;
}

/**
 * Select standard battery size based on panel count.
 * Options: 5, 10, 15, 20 kWh (common UK offerings).
 */
function selectBatterySize(panelCount: number): number {
  if (panelCount <= 6) return 5;
  if (panelCount <= 12) return 10;
  if (panelCount <= 20) return 15;
  return 20;
}
