/**
 * Housing Archetype Matrix — maps UK property type + built form to the
 * MAXIMUM realistic panel count for that combination.
 *
 * Based on UK solar installer guidelines (2024). Values represent the high end
 * of typical installations for each property type and built form.
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
 * Combined lookup: propertyType + builtForm → max panel count.
 * Keys are "propertytype-builtform" (both lowercased).
 * This exhaustively covers all combinations from the image.
 */
const COMBINED_PROPERTY_PANELS: Record<string, number> = {
  // HOUSES
  "house-detached": 16, // Detached House: 12–16 panels
  "house-semi-detached": 12, // Semi-Detached House: 8–12 panels
  "house-mid-terrace": 8, // Mid-Terrace House: 6–8 panels
  "house-end-terrace": 10, // End-Terrace House: 6–10 panels
  "house-enclosed mid-terrace": 6, // Enclosed Mid-Terrace House: 4–6 panels
  "house-enclosed end-terrace": 8, // Enclosed End-Terrace House: 4–8 panels

  // BUNGALOWS
  "bungalow-detached": 14, // Detached Bungalow: 10–14 panels
  "bungalow-semi-detached": 12, // Semi-Detached Bungalow: 8–12 panels
  "bungalow-mid-terrace": 8, // Mid-Terrace Bungalow: 6–8 panels
  "bungalow-end-terrace": 10, // End-Terrace Bungalow: 6–10 panels
};

/**
 * Fallback by property type only when the built form is absent or
 * unrecognised. Used as second-level lookup.
 */
const PROPERTY_TYPE_PANELS: Record<string, number> = {
  house: 10,
  bungalow: 12,
  "park home": 4,
};

/** Property types that cannot have rooftop PV without a manual survey. */
const MANUAL_SURVEY_TYPES = new Set(["flat", "maisonette"]);

/**
 * Determine maximum panel count for a given property.
 *
 * @param propertyType - EPC `propertyType` field (e.g. "House", "Bungalow")
 * @param builtForm    - EPC `builtForm` field (e.g. "Semi-Detached")
 * @returns Maximum realistic panel count; 0 if manual survey required
 */
export function getArchetype(propertyType: string, builtForm: string): HousingArchetype {
  const normType = propertyType.toLowerCase().trim();
  const normForm = builtForm.toLowerCase().trim();

  if (MANUAL_SURVEY_TYPES.has(normType)) {
    return { panelCount: 0, manualSurveyRequired: true };
  }

  // Try combined lookup first (property type + built form)
  const combinedKey = `${normType}-${normForm}`;
  const fromCombined = COMBINED_PROPERTY_PANELS[combinedKey];
  if (fromCombined !== undefined) {
    return { panelCount: fromCombined, manualSurveyRequired: false };
  }

  // Fall back to property type only
  const fromType = PROPERTY_TYPE_PANELS[normType];
  if (fromType !== undefined) {
    return { panelCount: fromType, manualSurveyRequired: false };
  }

  // Unknown property type — flag for manual survey with a conservative guess
  return { panelCount: 6, manualSurveyRequired: true };
}
