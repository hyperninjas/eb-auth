/**
 * "Best Guess" Hardware Extrapolation Engine.
 *
 * Pure function — no DB calls, no HTTP, no side effects. Takes EPC
 * certificate data + historical inspection records and derives what
 * hardware the property likely has: solar PV specs, battery probability,
 * and heat pump readiness.
 *
 * The UPRN "Time Machine" logic lives here: it walks historical certs
 * chronologically to find the "Birth Date" — the first inspection where
 * solar or a heat pump appeared.
 */

import { getPanelWattage, type PanelEra } from "../data/panel-wattage-stepper";
import { getArchetype } from "../data/housing-archetype";

// ── Input types ─────────────────────────────────────────────────────

export interface HistoricalCert {
  lmkKey: string;
  inspectionDate: string; // ISO date string
  mainheatDescription: string | null;
  photoSupply: string | null;
  energyConsumptionCurrent: number | null;
}

export interface HardwareExtrapolationInput {
  propertyType: string;
  builtForm: string;
  totalFloorArea: number;
  /** Latest certificate's main heat description. */
  mainheatDescription: string;
  /** Latest certificate's photo supply value. */
  photoSupply: string;
  /** Latest certificate's energy consumption (kWh/m2/year). */
  energyConsumptionCurrent: number | null;
  /** Historical certs sorted by inspectionDate ASC (oldest first). */
  history: HistoricalCert[];
}

// ── Output types ────────────────────────────────────────────────────

export interface SolarExtrapolation {
  detected: boolean;
  birthDate: string | null;
  estimatedPanelCount: number;
  estimatedPanelWattage: number;
  panelTechnology: string;
  estimatedCapacityKwp: number;
  confidence: "high" | "medium" | "low";
  manualSurveyRequired: boolean;
}

export interface BatteryExtrapolation {
  probability: number;
  estimatedCapacityKwh: number;
  recommendation: string | null;
}

export interface HeatPumpExtrapolation {
  detected: boolean;
  birthDate: string | null;
  type: "air-source" | "ground-source" | "unknown" | null;
  readiness: "highly_suitable" | "suitable" | "insulation_required" | "unknown";
  readinessScore: number | null;
}

export interface HardwareExtrapolation {
  solar: SolarExtrapolation;
  battery: BatteryExtrapolation;
  heatPump: HeatPumpExtrapolation;
}

// ── Engine ───────────────────────────────────────────────────────────

export function extrapolateHardware(input: HardwareExtrapolationInput): HardwareExtrapolation {
  const solar = extrapolateSolar(input);
  const battery = extrapolateBattery(solar);
  const heatPump = extrapolateHeatPump(input);

  return { solar, battery, heatPump };
}

// ── Solar PV ────────────────────────────────────────────────────────

function extrapolateSolar(input: HardwareExtrapolationInput): SolarExtrapolation {
  const archetype = getArchetype(input.propertyType, input.builtForm);

  // Detect solar from current certificate or history
  const hasSolar = parsePhotoSupply(input.photoSupply) > 0;
  const solarBirthDate = findSolarBirthDate(input.history);

  // If current cert shows solar, use the birth date (or inspection date
  // of the latest cert that first shows it) for the technology stepper.
  const detected = hasSolar || solarBirthDate !== null;

  if (!detected || archetype.panelCount === 0) {
    // No solar detected, or flat/maisonette — return "potential" simulation
    const currentYear = new Date().getFullYear();
    const era = getPanelWattage(currentYear);

    return {
      detected: false,
      birthDate: null,
      estimatedPanelCount: archetype.panelCount,
      estimatedPanelWattage: era.wattage,
      panelTechnology: era.technology,
      estimatedCapacityKwp: (archetype.panelCount * era.wattage) / 1000,
      confidence: archetype.manualSurveyRequired ? "low" : "medium",
      manualSurveyRequired: archetype.manualSurveyRequired,
    };
  }

  // Solar detected — use birth date for technology stepper
  const birthDateStr = solarBirthDate ?? new Date().toISOString().slice(0, 10);
  const birthYear = new Date(birthDateStr).getFullYear();
  const era: PanelEra = getPanelWattage(birthYear);

  return {
    detected: true,
    birthDate: birthDateStr,
    estimatedPanelCount: archetype.panelCount,
    estimatedPanelWattage: era.wattage,
    panelTechnology: era.technology,
    estimatedCapacityKwp: (archetype.panelCount * era.wattage) / 1000,
    confidence: solarBirthDate ? "high" : "medium",
    manualSurveyRequired: archetype.manualSurveyRequired,
  };
}

/** Walk history chronologically to find the first cert where solar appears. */
function findSolarBirthDate(history: HistoricalCert[]): string | null {
  for (const cert of history) {
    if (parsePhotoSupply(cert.photoSupply) > 0) {
      return cert.inspectionDate;
    }
  }
  return null;
}

/**
 * Parse the EPC `photoSupply` field. The API field name is `PHOTO_SUPPLY`
 * and contains a numeric percentage (0–100) as a string, or may be empty.
 */
function parsePhotoSupply(value: string | null | undefined): number {
  if (!value) return 0;
  const num = parseFloat(value);
  return Number.isFinite(num) ? num : 0;
}

// ── Battery ─────────────────────────────────────────────────────────

function extrapolateBattery(solar: SolarExtrapolation): BatteryExtrapolation {
  if (!solar.detected) {
    return {
      probability: 0.01,
      estimatedCapacityKwh: 0,
      recommendation: "Bundle a 5kWh battery with solar installation for optimal savings.",
    };
  }

  const birthYear = solar.birthDate ? new Date(solar.birthDate).getFullYear() : null;

  if (birthYear && birthYear >= 2024) {
    return {
      probability: 0.8,
      estimatedCapacityKwh: 5,
      recommendation: null,
    };
  }

  return {
    probability: 0.1,
    estimatedCapacityKwh: 0,
    recommendation: "Retrofit a 5kWh smart battery to maximise self-consumption.",
  };
}

// ── Heat Pump ───────────────────────────────────────────────────────

function extrapolateHeatPump(input: HardwareExtrapolationInput): HeatPumpExtrapolation {
  const description = input.mainheatDescription.toLowerCase();
  const detected = description.includes("heat pump");

  // Find birth date from history
  const birthDate = detected ? findHeatPumpBirthDate(input.history) : null;

  // Detect type
  let type: HeatPumpExtrapolation["type"] = null;
  if (detected) {
    if (description.includes("air source") || description.includes("air-source")) {
      type = "air-source";
    } else if (description.includes("ground source") || description.includes("ground-source")) {
      type = "ground-source";
    } else {
      type = "unknown";
    }
  }

  // Calculate readiness score from energy intensity (kWh/m2/year).
  //
  // The EPC field `energyConsumptionCurrent` is ALREADY in kWh/m2/year
  // — do NOT divide by floor area again. The thresholds are:
  //   < 120 kWh/m2/year → well-insulated, heat pump will perform well
  //   120–150 → acceptable, minor insulation upgrades may help
  //   > 150 → poor fabric, insulate before installing a heat pump
  let readiness: HeatPumpExtrapolation["readiness"] = "unknown";
  let readinessScore: number | null = null;

  if (input.energyConsumptionCurrent !== null && input.energyConsumptionCurrent !== undefined) {
    readinessScore = input.energyConsumptionCurrent;

    if (readinessScore < 120) {
      readiness = "highly_suitable";
    } else if (readinessScore <= 150) {
      readiness = "suitable";
    } else {
      readiness = "insulation_required";
    }
  }

  return { detected, birthDate, type, readiness, readinessScore };
}

function findHeatPumpBirthDate(history: HistoricalCert[]): string | null {
  for (const cert of history) {
    if (cert.mainheatDescription?.toLowerCase().includes("heat pump")) {
      return cert.inspectionDate;
    }
  }
  return null;
}
