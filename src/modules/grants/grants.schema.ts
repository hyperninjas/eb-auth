/**
 * Input validation schemas for the grants module.
 */

import { z } from "zod";

// ── Get/Update User Grant Profile ──────────────────────────────────

export const updateGrantProfileSchema = z
  .object({
    isHomeowner: z.boolean().optional(),
    householdIncome: z.enum(["low", "medium", "high"]).optional(),
    hasVulnerableOccupant: z.boolean().optional(),
    solarMcsRegistered: z.boolean().optional(),
    mcsInstallerId: z.string().trim().min(3).max(100).optional(),
  })
  .refine(
    (data) =>
      data.isHomeowner !== undefined ||
      data.householdIncome !== undefined ||
      data.hasVulnerableOccupant !== undefined ||
      data.solarMcsRegistered !== undefined ||
      data.mcsInstallerId !== undefined,
    { message: "At least one field must be provided" },
  );

export type UpdateGrantProfileInput = z.infer<typeof updateGrantProfileSchema>;
