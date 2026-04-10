import { getLogger } from "../../infra/logger";
import type { EpcConfig } from "./epc.config";
import { EpcUpstreamError } from "./epc.errors";

/**
 * HTTP client for the UK EPC Open Data Communities API.
 *
 * Only two endpoints are used:
 *   1. Search domestic properties by postcode
 *   2. Fetch a single certificate by its LMK key
 *
 * The EPC API returns a custom JSON format with `column-names` and
 * `rows` arrays. We normalise the response into a flat array of
 * certificate objects with camelCase keys.
 *
 * Authentication is HTTP Basic Auth (email:apiKey), injected by this
 * client so the Flutter app never needs the credentials.
 */

/** Raw row shape from the EPC API (kebab-case keys). */
export type EpcRawRow = Record<string, string | undefined>;

/** Normalised certificate — camelCase keys, string values. */
export interface EpcCertificate {
  lmkKey: string;
  address: string;
  postcode: string;
  currentEnergyRating: string;
  currentEnergyEfficiency: string;
  potentialEnergyRating: string;
  potentialEnergyEfficiency: string;
  propertyType: string;
  builtForm: string;
  inspectionDate: string;
  lodgementDate: string;
  transactionType: string;
  environmentImpactCurrent: string;
  environmentImpactPotential: string;
  co2EmissionsCurrent: string;
  co2EmissCurrPerFloorArea: string;
  co2EmissionsPotential: string;
  lightingCostCurrent: string;
  lightingCostPotential: string;
  heatingCostCurrent: string;
  heatingCostPotential: string;
  hotWaterCostCurrent: string;
  hotWaterCostPotential: string;
  totalFloorArea: string;
  energyConsumptionCurrent: string;
  energyConsumptionPotential: string;
  mainFuel: string;
  tenure: string;
  constructionAgeBand: string;
  numberHabitableRooms: string;
  numberHeatedRooms: string;
  lowEnergyLighting: string;
  wallsDescription: string;
  wallsEnergyEff: string;
  wallsEnvEff: string;
  roofDescription: string;
  roofEnergyEff: string;
  roofEnvEff: string;
  floorDescription: string;
  floorEnergyEff: string;
  floorEnvEff: string;
  windowsDescription: string;
  windowsEnergyEff: string;
  windowsEnvEff: string;
  mainheatDescription: string;
  mainheatEnergyEff: string;
  mainheatEnvEff: string;
  mainheatcontDescription: string;
  mainheatcontEnergyEff: string;
  mainheatcontEnvEff: string;
  hotWaterDescription: string;
  hotWaterEnergyEff: string;
  hotWaterEnvEff: string;
  lightingDescription: string;
  lightingEnergyEff: string;
  lightingEnvEff: string;
  /** Catch-all for any fields not explicitly listed. */
  [key: string]: string;
}

export interface EpcSearchResult {
  rows: EpcCertificate[];
  totalResults: number;
}

export interface EpcClient {
  /** Search domestic properties by postcode. */
  searchProperties: (
    postcode: string,
    options?: { from?: number; size?: number },
  ) => Promise<EpcSearchResult>;

  /** Fetch a single certificate by LMK key. Returns null if not found. */
  getCertificate: (lmkKey: string) => Promise<EpcCertificate | null>;
}

export function createEpcClient(config: EpcConfig): EpcClient {
  const authHeader =
    "Basic " + Buffer.from(`${config.apiEmail}:${config.apiKey}`).toString("base64");

  return {
    searchProperties: async (postcode, options) => {
      const params = new URLSearchParams({
        postcode: postcode.replace(/\s+/g, ""),
        size: String(options?.size ?? 50),
        from: String(options?.from ?? 0),
      });

      const data = await epcFetch<{
        rows: EpcRawRow[];
        "column-names": string[];
      }>(config, `/domestic/search?${params.toString()}`, authHeader);

      if (!data) return { rows: [], totalResults: 0 };

      const rows = (data.rows ?? []).map(normaliseRow);
      return { rows, totalResults: rows.length };
    },

    getCertificate: async (lmkKey) => {
      const data = await epcFetch<{
        rows: EpcRawRow[];
        "column-names": string[];
      }>(config, `/domestic/certificate/${encodeURIComponent(lmkKey)}`, authHeader);

      if (!data?.rows || data.rows.length === 0) return null;
      return normaliseRow(data.rows[0]!);
    },
  };
}

/**
 * Convert kebab-case EPC API keys to camelCase.
 * e.g. "current-energy-rating" → "currentEnergyRating"
 */
function kebabToCamel(str: string): string {
  return str.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

/** Normalise a raw EPC row into a camelCase certificate object. */
function normaliseRow(row: EpcRawRow): EpcCertificate {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) {
    out[kebabToCamel(k)] = v ?? "";
  }
  return out as unknown as EpcCertificate;
}

/**
 * Low-level HTTP call to the EPC API. Returns parsed JSON on 2xx,
 * null on 404, and throws EpcUpstreamError on other failures.
 */
async function epcFetch<T>(config: EpcConfig, path: string, authHeader: string): Promise<T | null> {
  const url = `${config.baseUrl}${path}`;
  const init: RequestInit = {
    method: "GET",
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(config.httpTimeoutMs),
  };

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    getLogger().error({ err, url }, "EPC API request failed");
    throw err;
  }

  // 404 = no results — return null so callers can handle gracefully.
  if (res.status === 404) return null;

  const text = await res.text().catch(() => "");

  if (!res.ok) {
    getLogger().warn(
      { url, status: res.status, body: text.slice(0, 300) },
      "EPC API returned non-2xx",
    );
    throw new EpcUpstreamError(res.status, text.slice(0, 300));
  }

  if (!text) return null;
  return JSON.parse(text) as T;
}
