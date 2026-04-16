/**
 * UK energy provider seed data with Ofgem price cap SVT rates.
 *
 * Rates are in integer "pence × 100" (e.g. 24.50p = 2450) to match the
 * EnergyTariff model's integer pence convention.
 *
 * Standing charges are daily pence × 100.
 *
 * These rates reflect the Ofgem Q2 2025 price cap. They should be
 * updated when new caps are published (quarterly). The admin tariff
 * refresh endpoint can also upsert these programmatically.
 *
 * SEG export rate is a market average — individual providers vary.
 */

export interface ProviderSeed {
  name: string;
  slug: string;
  svt: {
    flatRatePence: number;
    standingChargePence: number;
    segExportRatePence: number;
  };
}

export const UK_PROVIDERS: ProviderSeed[] = [
  {
    name: "British Gas",
    slug: "british-gas",
    svt: { flatRatePence: 2450, standingChargePence: 6138, segExportRatePence: 1200 },
  },
  {
    name: "EDF Energy",
    slug: "edf-energy",
    svt: { flatRatePence: 2450, standingChargePence: 6138, segExportRatePence: 1500 },
  },
  {
    name: "E.ON Next",
    slug: "eon-next",
    svt: { flatRatePence: 2450, standingChargePence: 6138, segExportRatePence: 1500 },
  },
  {
    name: "Scottish Power",
    slug: "scottish-power",
    svt: { flatRatePence: 2450, standingChargePence: 6138, segExportRatePence: 1200 },
  },
  {
    name: "OVO Energy",
    slug: "ovo-energy",
    svt: { flatRatePence: 2450, standingChargePence: 6138, segExportRatePence: 1500 },
  },
  {
    name: "Octopus Energy",
    slug: "octopus-energy",
    svt: { flatRatePence: 2450, standingChargePence: 6138, segExportRatePence: 1500 },
  },
  {
    name: "Shell Energy",
    slug: "shell-energy",
    svt: { flatRatePence: 2450, standingChargePence: 6138, segExportRatePence: 1200 },
  },
  {
    name: "So Energy",
    slug: "so-energy",
    svt: { flatRatePence: 2450, standingChargePence: 6138, segExportRatePence: 1200 },
  },
  {
    name: "Utility Warehouse",
    slug: "utility-warehouse",
    svt: { flatRatePence: 2450, standingChargePence: 6138, segExportRatePence: 1200 },
  },
  {
    name: "Good Energy",
    slug: "good-energy",
    svt: { flatRatePence: 2450, standingChargePence: 6138, segExportRatePence: 1500 },
  },
  {
    name: "Ecotricity",
    slug: "ecotricity",
    svt: { flatRatePence: 2450, standingChargePence: 6138, segExportRatePence: 1200 },
  },
  {
    name: "Green Energy UK",
    slug: "green-energy-uk",
    svt: { flatRatePence: 2450, standingChargePence: 6138, segExportRatePence: 1200 },
  },
  {
    name: "Outfox the Market",
    slug: "outfox-the-market",
    svt: { flatRatePence: 2350, standingChargePence: 5500, segExportRatePence: 1500 },
  },
  {
    name: "Opus Energy",
    slug: "opus-energy",
    svt: { flatRatePence: 2450, standingChargePence: 6138, segExportRatePence: 1200 },
  },
  {
    name: "Bristol Energy",
    slug: "bristol-energy",
    svt: { flatRatePence: 2450, standingChargePence: 6138, segExportRatePence: 1200 },
  },
  {
    name: "Affect Energy",
    slug: "affect-energy",
    svt: { flatRatePence: 2450, standingChargePence: 6138, segExportRatePence: 1200 },
  },
  {
    name: "Igloo Energy",
    slug: "igloo-energy",
    svt: { flatRatePence: 2350, standingChargePence: 5800, segExportRatePence: 1500 },
  },
  {
    name: "Bulb (Octopus)",
    slug: "bulb-octopus",
    svt: { flatRatePence: 2450, standingChargePence: 6138, segExportRatePence: 1500 },
  },
];
