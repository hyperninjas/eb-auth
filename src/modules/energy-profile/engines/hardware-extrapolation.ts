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

import { getArchetype } from "../data/housing-archetype";
import { solarSystemSize } from "../data/solar-system-sizing";
import { heatPumpSize } from "../data/heat-pump-sizing";
import { predictSolarSystem } from "../data/solar-system-prediction";

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
  // Derived system sizing
  estimatedInverterKw: number;
  estimatedBatteryKwh: number;
  // Prediction fields (if solar detected, we predict actual installed capacity)
  predictedFrom: "theoretical_max" | "historical_prediction" | null;
  /** Age-adjusted capacity accounting for panel degradation */
  effectiveCapacityKwp: number;
  /** Panel degradation percentage (0.6% per year) */
  degradationPercent: number;
  /** Explanation of how capacity was determined */
  predictionReason: string | null;
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
  readinessScore: number | null; // kWh/m²/year energy consumption
  // Sizing recommendations (derived from floor area + building efficiency)
  estimatedCapacityKw: number | null;
  sizingReason: string | null;
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
  const detected = hasSolar || solarBirthDate !== null;

  // ── No Solar Detected: Use Theoretical Maximum ──────────────────────
  if (!detected || archetype.panelCount === 0) {
    // Use theoretical max for property type (for "what if" recommendations)
    const panelCount = archetype.panelCount;
    const theoreticalSize = solarSystemSize(panelCount);

    const panelWattage = 435; // Current standard
    const panelTechnology = "N-Type Si (435W)"; // Current standard

    return {
      detected: false,
      birthDate: null,
      estimatedPanelCount: panelCount,
      estimatedPanelWattage: panelWattage,
      panelTechnology,
      estimatedCapacityKwp: theoreticalSize.capacityKwp,
      confidence: archetype.manualSurveyRequired ? "low" : "medium",
      manualSurveyRequired: archetype.manualSurveyRequired,
      estimatedInverterKw: theoreticalSize.inverterKw,
      estimatedBatteryKwh: theoreticalSize.batteryKwh,
      predictedFrom: "theoretical_max",
      effectiveCapacityKwp: theoreticalSize.capacityKwp,
      degradationPercent: 0,
      predictionReason: "No solar detected. Using theoretical maximum for property type.",
    };
  }

  // ── Solar Detected: Predict Actual Installed Capacity ──────────────
  // Extract birth year from birth date string (ISO format: YYYY-MM-DD)
  const birthDateStr = solarBirthDate ?? new Date().toISOString().slice(0, 10);
  const birthYear = parseInt(birthDateStr.slice(0, 4), 10);

  // Use the prediction engine to estimate what was actually installed
  const prediction = predictSolarSystem(birthYear, solarBirthDate ? "high" : "medium");

  return {
    detected: true,
    birthDate: birthDateStr,
    estimatedPanelCount: prediction.estimatedPanelCount,
    estimatedPanelWattage: prediction.panelWattage,
    panelTechnology: prediction.panelTechnology,
    estimatedCapacityKwp: prediction.estimatedCapacityKwp,
    confidence: prediction.confidence === "high" ? "high" : "medium",
    manualSurveyRequired: archetype.manualSurveyRequired,
    estimatedInverterKw: prediction.inverterKw, // Use prediction's inverter
    estimatedBatteryKwh: prediction.batteryKwh, // Use prediction's battery
    predictedFrom: "historical_prediction",
    effectiveCapacityKwp: prediction.effectiveCapacityKwp,
    degradationPercent: prediction.degradationPercent,
    predictionReason: prediction.reason,
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
  // Use the inverter-derived battery size from the solar system sizing
  const batteryCapacity = solar.estimatedBatteryKwh;

  if (!solar.detected) {
    return {
      probability: 0.01,
      estimatedCapacityKwh: 0,
      recommendation: `Bundle a ${batteryCapacity}kWh battery with solar installation for optimal savings.`,
    };
  }

  const birthYear = solar.birthDate ? new Date(solar.birthDate).getFullYear() : null;

  if (birthYear && birthYear >= 2024) {
    return {
      probability: 0.8,
      estimatedCapacityKwh: batteryCapacity,
      recommendation: null,
    };
  }

  return {
    probability: 0.1,
    estimatedCapacityKwh: 0,
    recommendation: `Retrofit a ${batteryCapacity}kWh smart battery to maximise self-consumption.`,
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

  // Calculate readiness score from energy intensity (kWh/m²/year).
  //
  // The EPC field `energyConsumptionCurrent` is ALREADY in kWh/m²/year
  // — do NOT divide by floor area again. The thresholds are:
  //   < 120 kWh/m²/year → well-insulated, heat pump will perform well
  //   120–150 → acceptable, minor insulation upgrades may help
  //   > 150 → poor fabric, needs oversized heat pump + insulation
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

  // Calculate recommended heat pump capacity based on floor area and efficiency
  const sizing = heatPumpSize(input.totalFloorArea, input.energyConsumptionCurrent);

  return {
    detected,
    birthDate,
    type,
    readiness,
    readinessScore,
    estimatedCapacityKw: sizing.recommendedCapacityKw,
    sizingReason: sizing.reason,
  };
}

function findHeatPumpBirthDate(history: HistoricalCert[]): string | null {
  for (const cert of history) {
    if (cert.mainheatDescription?.toLowerCase().includes("heat pump")) {
      return cert.inspectionDate;
    }
  }
  return null;
}
