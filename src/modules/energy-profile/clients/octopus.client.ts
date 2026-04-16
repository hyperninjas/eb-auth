/**
 * Octopus Energy API client.
 *
 * Fetches electricity tariff data from the public Octopus Energy API.
 * No authentication required for product/tariff listing endpoints.
 *
 * Results are stored in Postgres for monthly refresh.
 */

import { getLogger } from "../../../infra/logger";
import { OctopusUpstreamError } from "../energy-profile.errors";
import type { EnergyProfileConfig } from "../energy-profile.config";

// ── Types ───────────────────────────────────────────────────────────

export interface OctopusTariff {
  productCode: string;
  displayName: string;
  /** "SINGLE_REGISTER" (flat) or "MULTI_REGISTER" (ToU). */
  registerType: string;
  /** Rate in pence (already × 100 for our DB convention). */
  unitRatePence: number;
  /** Standing charge pence/day × 100. */
  standingChargePence: number;
  /** Valid from date ISO string. */
  validFrom: string;
  /** Valid to date ISO string or null if open-ended. */
  validTo: string | null;
}

export interface OctopusClient {
  /** Fetch current electricity tariffs for a region (default: South East — _C). */
  getElectricityTariffs: (regionCode?: string) => Promise<OctopusTariff[]>;
}

// ── Octopus API response shapes ─────────────────────────────────────

interface OctopusProductsResponse {
  count: number;
  next: string | null;
  results: {
    code: string;
    display_name: string;
    is_variable: boolean;
    is_green: boolean;
    is_business: boolean;
    available_from: string;
    available_to: string | null;
    links: { rel: string; href: string }[];
    direction: string;
    brand: string;
  }[];
}

interface OctopusRatesResponse {
  count: number;
  next: string | null;
  results: {
    value_exc_vat: number;
    value_inc_vat: number;
    valid_from: string;
    valid_to: string | null;
  }[];
}

interface OctopusStandingChargesResponse {
  count: number;
  results: {
    value_exc_vat: number;
    value_inc_vat: number;
    valid_from: string;
    valid_to: string | null;
  }[];
}

// ── Client factory ──────────────────────────────────────────────────

export function createOctopusClient(config: EnergyProfileConfig): OctopusClient {
  return {
    getElectricityTariffs: async (regionCode = "C") => {
      const tariffs: OctopusTariff[] = [];

      // Fetch the product list
      const products = await fetchProducts(config);

      // For each domestic electricity product, get the latest standard rates
      for (const product of products) {
        if (product.is_business || product.direction !== "IMPORT") continue;

        try {
          const rates = await fetchRates(config, product.code, regionCode);
          const standingCharges = await fetchStandingCharges(config, product.code, regionCode);

          if (rates.length === 0) continue;

          // Take the latest rate
          const latestRate = rates[0]!;
          const latestSC = standingCharges[0];

          tariffs.push({
            productCode: product.code,
            displayName: product.display_name,
            registerType: rates.length > 1 ? "MULTI_REGISTER" : "SINGLE_REGISTER",
            // Octopus returns p/kWh with VAT — multiply by 100 for our
            // integer pence convention
            unitRatePence: Math.round(latestRate.value_inc_vat * 100),
            standingChargePence: latestSC ? Math.round(latestSC.value_inc_vat * 100) : 6138, // fallback to Ofgem cap
            validFrom: latestRate.valid_from,
            validTo: latestRate.valid_to,
          });
        } catch (err) {
          // Skip individual products that fail — don't abort the whole fetch
          getLogger().warn(
            { err, productCode: product.code },
            "Failed to fetch Octopus rates for product, skipping",
          );
        }
      }

      return tariffs;
    },
  };
}

async function fetchProducts(
  config: EnergyProfileConfig,
): Promise<OctopusProductsResponse["results"]> {
  const url = `${config.octopusBaseUrl}/products/?is_business=false&is_variable=true`;
  const data = await octopusFetch<OctopusProductsResponse>(config, url);
  return data?.results ?? [];
}

async function fetchRates(
  config: EnergyProfileConfig,
  productCode: string,
  regionCode: string,
): Promise<OctopusRatesResponse["results"]> {
  const tariffCode = `E-1R-${productCode}-${regionCode}`;
  const url = `${config.octopusBaseUrl}/products/${productCode}/electricity-tariffs/${tariffCode}/standard-unit-rates/?page_size=1`;
  const data = await octopusFetch<OctopusRatesResponse>(config, url);
  return data?.results ?? [];
}

async function fetchStandingCharges(
  config: EnergyProfileConfig,
  productCode: string,
  regionCode: string,
): Promise<OctopusStandingChargesResponse["results"]> {
  const tariffCode = `E-1R-${productCode}-${regionCode}`;
  const url = `${config.octopusBaseUrl}/products/${productCode}/electricity-tariffs/${tariffCode}/standing-charges/?page_size=1`;
  const data = await octopusFetch<OctopusStandingChargesResponse>(config, url);
  return data?.results ?? [];
}

async function octopusFetch<T>(config: EnergyProfileConfig, url: string): Promise<T | null> {
  const init: RequestInit = {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(config.octopusTimeoutMs),
  };

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    getLogger().error({ err, url }, "Octopus API request failed");
    throw err;
  }

  if (res.status === 404) return null;

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    getLogger().warn({ url, status: res.status, body: text.slice(0, 300) }, "Octopus API non-2xx");
    throw new OctopusUpstreamError(res.status, text.slice(0, 300));
  }

  if (!text) return null;
  return JSON.parse(text) as T;
}
