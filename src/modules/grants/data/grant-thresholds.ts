/**
 * UK Grant program thresholds and eligibility criteria (2026).
 * Source: GOV.UK
 */

// Boiler Upgrade Scheme (BUS)
export const BUS = {
  grantId: "bus",
  name: "Boiler Upgrade Scheme",
  description: "Upfront grant for replacing fossil fuel boilers with heat pumps or biomass",
  grantAmounts: {
    airSourceHeatPump: 7500,
    groundSourceHeatPump: 7500,
    biomassBoiler: 5000,
  },
  eligibleRegions: ["England", "Wales"],
  fossilFuels: ["gas boiler", "oil boiler", "solid fuel boiler"],
  requiresHomeownership: true,
};

// Warm Homes: Local Grant (WH:LG)
export const WARM_HOMES_LOCAL = {
  grantId: "whl",
  name: "Warm Homes: Local Grant",
  description: "Up to £15k for insulation/solar, £15k for low-carbon heating",
  maxInsulationGrant: 15000,
  maxHeatingGrant: 15000,
  totalMaxGrant: 30000,
  eligibleRegions: ["England"],
  eligibleEpcRatings: ["D", "E", "F", "G"],
  incomeLevels: {
    low: "Eligible for full support",
    medium: "May be eligible with other criteria",
    high: "Not eligible",
  },
  targetAudience: "Low-income, energy-inefficient homes",
};

// Energy Company Obligation 4 (ECO4)
export const ECO4 = {
  grantId: "eco4",
  name: "Energy Company Obligation 4",
  description: "Energy supplier-funded upgrades for low-income and vulnerable households",
  requiresEligibility: ["low-income", "vulnerable", "inefficient-home"],
  eligibleEpcRatings: ["D", "E", "F", "G"],
  measures: ["heat pumps", "insulation", "solar panels", "double glazing"],
};

// Smart Export Guarantee (SEG)
export const SEG = {
  grantId: "seg",
  name: "Smart Export Guarantee",
  description: "Energy suppliers pay for electricity you export to the grid",
  minCapacityKwp: 0.5,
  maxCapacityKwp: 10, // Residential typically
  requiresMcsRegistration: true,
  typicalExportRate: {
    min: 0.12, // 12p/kWh (lowest)
    typical: 0.15, // 15p/kWh (Octopus)
    max: 0.24, // 24p/kWh (best)
    currency: "GBP",
  },
};

// Energy Efficiency Thresholds
export const ENERGY_THRESHOLDS = {
  // kWh/m²/year (lower is better — more efficient)
  highly_suitable: 120, // Well-insulated, heat pump will perform well
  suitable: 150, // Acceptable, minor upgrades help
  insulation_required: 999, // > 150, poor fabric, insulate first
};

// Heat Pump COP (Coefficient of Performance) by energy efficiency
export const HEAT_PUMP_COP = {
  highly_suitable: 3.8, // < 120 kWh/m²
  suitable: 3.2, // 120-150
  insulation_required: 2.5, // > 150
};

// Regional Definitions
export const UK_REGIONS = {
  England: "England",
  Wales: "Wales",
  Scotland: "Scotland",
  NorthernIreland: "Northern Ireland",
};

// Postcode to Region mapping (first 1-2 chars)
export const POSTCODE_REGION_MAP: Record<string, string> = {
  AB: UK_REGIONS.Scotland,
  AB2: UK_REGIONS.Scotland,
  AB3: UK_REGIONS.Scotland,
  AL: UK_REGIONS.England,
  B: UK_REGIONS.England,
  BA: UK_REGIONS.England,
  BB: UK_REGIONS.England,
  BD: UK_REGIONS.England,
  BH: UK_REGIONS.England,
  BL: UK_REGIONS.England,
  BN: UK_REGIONS.England,
  BR: UK_REGIONS.England,
  BS: UK_REGIONS.England,
  BT: UK_REGIONS.NorthernIreland,
  CA: UK_REGIONS.England,
  CB: UK_REGIONS.England,
  CF: UK_REGIONS.Wales,
  CH: UK_REGIONS.England,
  CM: UK_REGIONS.England,
  CO: UK_REGIONS.England,
  CR: UK_REGIONS.England,
  CT: UK_REGIONS.England,
  CV: UK_REGIONS.England,
  CW: UK_REGIONS.England,
  DA: UK_REGIONS.England,
  DD: UK_REGIONS.Scotland,
  DE: UK_REGIONS.England,
  DG: UK_REGIONS.Scotland,
  DH: UK_REGIONS.England,
  DL: UK_REGIONS.England,
  DN: UK_REGIONS.England,
  DT: UK_REGIONS.England,
  DY: UK_REGIONS.England,
  E: UK_REGIONS.England,
  EC: UK_REGIONS.England,
  EH: UK_REGIONS.Scotland,
  EN: UK_REGIONS.England,
  EX: UK_REGIONS.England,
  EY: UK_REGIONS.England,
  FK: UK_REGIONS.Scotland,
  FY: UK_REGIONS.England,
  G: UK_REGIONS.Scotland,
  GL: UK_REGIONS.England,
  GU: UK_REGIONS.England,
  HA: UK_REGIONS.England,
  HD: UK_REGIONS.England,
  HG: UK_REGIONS.England,
  HP: UK_REGIONS.England,
  HR: UK_REGIONS.England,
  HS: UK_REGIONS.Scotland,
  HU: UK_REGIONS.England,
  HX: UK_REGIONS.England,
  IG: UK_REGIONS.England,
  IP: UK_REGIONS.England,
  IV: UK_REGIONS.Scotland,
  JE: "Jersey",
  KA: UK_REGIONS.Scotland,
  KT: UK_REGIONS.England,
  KW: UK_REGIONS.Scotland,
  KY: UK_REGIONS.Scotland,
  L: UK_REGIONS.England,
  LA: UK_REGIONS.England,
  LD: UK_REGIONS.Wales,
  LE: UK_REGIONS.England,
  LI: "Guernsey",
  LL: UK_REGIONS.Wales,
  LN: UK_REGIONS.England,
  LS: UK_REGIONS.England,
  LU: UK_REGIONS.England,
  M: UK_REGIONS.England,
  MA: UK_REGIONS.England,
  ME: UK_REGIONS.England,
  MK: UK_REGIONS.England,
  ML: UK_REGIONS.Scotland,
  N: UK_REGIONS.England,
  NE: UK_REGIONS.England,
  NG: UK_REGIONS.England,
  NN: UK_REGIONS.England,
  NP: UK_REGIONS.Wales,
  NR: UK_REGIONS.England,
  NW: UK_REGIONS.England,
  OL: UK_REGIONS.England,
  OX: UK_REGIONS.England,
  PA: UK_REGIONS.Scotland,
  PE: UK_REGIONS.England,
  PH: UK_REGIONS.Scotland,
  PL: UK_REGIONS.England,
  PM: UK_REGIONS.England,
  PO: UK_REGIONS.England,
  PR: UK_REGIONS.England,
  RG: UK_REGIONS.England,
  RH: UK_REGIONS.England,
  RM: UK_REGIONS.England,
  S: UK_REGIONS.England,
  SA: UK_REGIONS.Wales,
  SE: UK_REGIONS.England,
  SG: UK_REGIONS.England,
  SK: UK_REGIONS.England,
  SL: UK_REGIONS.England,
  SM: UK_REGIONS.England,
  SN: UK_REGIONS.England,
  SO: UK_REGIONS.England,
  SP: UK_REGIONS.England,
  SR: UK_REGIONS.England,
  SS: UK_REGIONS.England,
  ST: UK_REGIONS.England,
  SW: UK_REGIONS.England,
  SY: UK_REGIONS.Wales,
  TA: UK_REGIONS.England,
  TD: UK_REGIONS.Scotland,
  TF: UK_REGIONS.England,
  TG: UK_REGIONS.Wales,
  TN: UK_REGIONS.England,
  TR: UK_REGIONS.England,
  TS: UK_REGIONS.England,
  TW: UK_REGIONS.England,
  TY: UK_REGIONS.Wales,
  UB: UK_REGIONS.England,
  UL: UK_REGIONS.Scotland,
  UP: UK_REGIONS.England,
  UR: UK_REGIONS.NorthernIreland,
  V: UK_REGIONS.England,
  W: UK_REGIONS.Wales,
  WA: UK_REGIONS.England,
  WC: UK_REGIONS.England,
  WD: UK_REGIONS.England,
  WF: UK_REGIONS.England,
  WN: UK_REGIONS.England,
  WR: UK_REGIONS.England,
  WS: UK_REGIONS.England,
  WV: UK_REGIONS.England,
  Y: UK_REGIONS.England,
  YO: UK_REGIONS.England,
  ZE: UK_REGIONS.Scotland,
};

/**
 * Extract region from UK postcode.
 * Matches first 1-2 letters (outward code).
 */
export function extractRegionFromPostcode(postcode: string): string {
  const cleaned = postcode.replace(/\s+/g, "").toUpperCase();

  // Try 2-char match first (more specific)
  if (cleaned.length >= 2) {
    const twoChar = cleaned.substring(0, 2);
    const region = POSTCODE_REGION_MAP[twoChar];
    if (region) {
      return region;
    }
  }

  // Fall back to 1-char match
  if (cleaned.length >= 1) {
    const oneChar = cleaned.substring(0, 1);
    const region = POSTCODE_REGION_MAP[oneChar];
    if (region) {
      return region;
    }
  }

  return "Unknown";
}
