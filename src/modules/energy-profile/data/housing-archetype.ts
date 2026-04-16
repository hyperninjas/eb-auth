/**
 * Housing Archetype Matrix — maps UK property type + built form to a
 * safe, typical maximum panel count. These are conservative estimates
 * based on average UK roof sizes by dwelling type.
 *
 * The EPC API returns `propertyType` (House, Bungalow, Flat, Maisonette,
 * Park home) and `builtForm` (Detached, Semi-Detached, Mid-Terrace,
 * End-Terrace, Enclosed Mid-Terrace, Enclosed End-Terrace).
 */

export interface HousingArchetype {
  panelCount: number;
  /** If true, the property type is unsuitable for rooftop PV and
   *  should be flagged for manual survey. */
  manualSurveyRequired: boolean;
}

/**
 * Lookup table keyed by normalised `builtForm` values from EPC data.
 * Falls back to a property-type-level default if the built form is
 * unrecognised.
 */
const BUILT_FORM_PANELS: Record<string, number> = {
  "mid-terrace": 6,
  "enclosed mid-terrace": 6,
  "semi-detached": 10,
  "end-terrace": 10,
  "enclosed end-terrace": 10,
  detached: 14,
};

/**
 * Fallback by property type when the built form is absent or
 * unrecognised. Bungalows have good roof access but less area.
 */
const PROPERTY_TYPE_PANELS: Record<string, number> = {
  house: 10,
  bungalow: 8,
  "park home": 4,
};

/** Property types that cannot have rooftop PV without a manual survey. */
const MANUAL_SURVEY_TYPES = new Set(["flat", "maisonette"]);

/**
 * Determine panel count for a given property.
 *
 * @param propertyType - EPC `propertyType` field (e.g. "House")
 * @param builtForm    - EPC `builtForm` field (e.g. "Semi-Detached")
 */
export function getArchetype(propertyType: string, builtForm: string): HousingArchetype {
  const normType = propertyType.toLowerCase().trim();
  const normForm = builtForm.toLowerCase().trim();

  if (MANUAL_SURVEY_TYPES.has(normType)) {
    return { panelCount: 0, manualSurveyRequired: true };
  }

  const fromForm = BUILT_FORM_PANELS[normForm];
  if (fromForm !== undefined) {
    return { panelCount: fromForm, manualSurveyRequired: false };
  }

  const fromType = PROPERTY_TYPE_PANELS[normType];
  if (fromType !== undefined) {
    return { panelCount: fromType, manualSurveyRequired: false };
  }

  // Unknown property type — flag for manual survey with a conservative guess
  return { panelCount: 6, manualSurveyRequired: true };
}
