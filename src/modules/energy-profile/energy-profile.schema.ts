/**
 * Input validation schemas for the energy-profile module.
 *
 * Designed for mobile/web app consumption:
 *   - Clear validation messages for client-side error display
 *   - Query filters for tariff browsing
 *   - Hardware correction schema for user override flow
 */

import { z } from "zod";

// ── Profile ─────────────────────────────────────────────────────────

export const createProfileSchema = z.object({
  lmkKey: z.string().trim().min(1, "LMK key is required"),
});
export type CreateProfileInput = z.infer<typeof createProfileSchema>;

// ── Hardware Correction (user overrides best-guess) ─────────────────

export const updateHardwareSchema = z
  .object({
    solar: z
      .object({
        detected: z.boolean().optional(),
        estimatedPanelCount: z.number().int().min(0).max(50).optional(),
        estimatedCapacityKwp: z.number().min(0).max(50).optional(),
      })
      .optional(),
    battery: z
      .object({
        estimatedCapacityKwh: z.number().min(0).max(100).optional(),
      })
      .optional(),
    heatPump: z
      .object({
        detected: z.boolean().optional(),
        type: z.enum(["air-source", "ground-source", "unknown"]).nullable().optional(),
      })
      .optional(),
  })
  .refine(
    (data) => data.solar !== undefined || data.battery !== undefined || data.heatPump !== undefined,
    { message: "At least one hardware section must be provided." },
  );
export type UpdateHardwareInput = z.infer<typeof updateHardwareSchema>;

// ── Load Profile ────────────────────────────────────────────────────

export const createLoadProfileSchema = z.object({
  providerId: z.string().uuid("Invalid provider ID"),
  tariffId: z.string().uuid("Invalid tariff ID"),
  monthlyBillPence: z.number().int().positive("Monthly bill must be a positive integer (pence)"),
});
export type CreateLoadProfileInput = z.infer<typeof createLoadProfileSchema>;

export const updateLoadProfileSchema = createLoadProfileSchema
  .partial()
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: "At least one field must be provided.",
  });
export type UpdateLoadProfileInput = z.infer<typeof updateLoadProfileSchema>;

// ── Tariff Query Filters ────────────────────────────────────────────

export const tariffQuerySchema = z.object({
  /** Filter by provider ID. */
  providerId: z.string().uuid().optional(),
  /** Filter by tariff type: "flat", "tou", "export". */
  type: z.enum(["flat", "tou", "export"]).optional(),
  /** Page number (1-based). */
  page: z.coerce.number().int().min(1).default(1),
  /** Items per page (max 100). */
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type TariffQuery = z.infer<typeof tariffQuerySchema>;

export const providerIdParamSchema = z.object({
  providerId: z.string().uuid("Invalid provider ID"),
});
export type ProviderIdParam = z.infer<typeof providerIdParamSchema>;

// ── Forecast query ──────────────────────────────────────────────────

export const solarForecastQuerySchema = z.object({
  /** Override system capacity for "what if" simulation (kWp). */
  capacityKwp: z.coerce.number().positive().max(50).optional(),
  /** Override panel count for "what if" simulation. */
  panelCount: z.coerce.number().int().min(1).max(50).optional(),
});
export type SolarForecastQuery = z.infer<typeof solarForecastQuerySchema>;
