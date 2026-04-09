import { z } from "zod";
import { DeviceModelSchema } from "../../generated/zod/schemas/variants/pure";

/**
 * Input validation schemas for the devices HTTP layer.
 *
 * Built on top of `DeviceModelSchema` (auto-generated from Prisma) so the
 * field set, types and nullability stay in sync with the database. We
 * use `.pick()` to select only the columns the client is allowed to send
 * (omitting server-generated fields like `id`, `createdAt`, `createdBy`),
 * then `.extend()` to add API-specific validation rules that don't exist
 * in the DB schema (length caps, trim, regex).
 *
 * Renaming a column in `prisma/schema.prisma` → next `prisma generate`
 * → this file's `.pick({ ... })` typechecks against the new shape and
 * fails loudly if a referenced field disappeared.
 */

// ── POST /api/devices ─────────────────────────────────────────────────────

export const createDeviceSchema = DeviceModelSchema.pick({
  deviceId: true,
  rfid: true,
  macAddress: true,
  name: true,
}).extend({
  // Tighter rules than the DB column allows. Order: trim → length → regex.
  deviceId: z
    .string({ error: "deviceId is required and must be a string." })
    .trim()
    .min(1, "deviceId must not be empty.")
    .max(100, "deviceId must be at most 100 characters."),
  rfid: z
    .string({ error: "rfid is required and must be a string." })
    .trim()
    .min(1, "rfid must not be empty.")
    .max(100, "rfid must be at most 100 characters."),
  macAddress: z
    .string({ error: "macAddress is required and must be a string." })
    .trim()
    .min(1, "macAddress must not be empty.")
    .max(17, "macAddress must be at most 17 characters."),
  // Pure DB schema makes `name` nullable; the API treats it as optional
  // (omitted = null in DB) which is friendlier for clients.
  name: z.string().trim().max(200, "name must be at most 200 characters.").optional(),
});

// ── GET /api/devices?page=&limit= ─────────────────────────────────────────
//
// Query parameters don't map to DB columns, so they're hand-written.
// They're orthogonal to the database — no derivation possible.

export const listDevicesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ── GET /api/devices/verify?... ───────────────────────────────────────────
//
// Lookup by any one of the unique columns. We `.pick()` from the DB
// schema for the field set so we can never look up by a non-existent
// column, then make all three optional with a "at least one" refine.

export const verifyDeviceQuerySchema = DeviceModelSchema.pick({
  deviceId: true,
  rfid: true,
  macAddress: true,
})
  .partial()
  .extend({
    deviceId: z.string().trim().min(1).optional(),
    rfid: z.string().trim().min(1).optional(),
    macAddress: z.string().trim().min(1).optional(),
  })
  .refine((data) => Boolean(data.deviceId ?? data.rfid ?? data.macAddress), {
    message: "Provide at least one of: deviceId, rfid, macAddress.",
  });

// ── PATCH /api/devices/:id ────────────────────────────────────────────────
//
// Mutable subset of the create schema. We `.pick()` from the create
// schema (which is itself a `.pick()` from the generated DB schema) and
// `.partial()` so every field is optional, then add a "must touch at
// least one field" refinement.

export const updateDeviceSchema = createDeviceSchema
  .pick({ name: true, rfid: true, macAddress: true })
  .partial()
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: "At least one of: name, rfid, macAddress must be provided.",
  });

export type UpdateDeviceInput = z.infer<typeof updateDeviceSchema>;

// ── DELETE /api/devices/:id ───────────────────────────────────────────────
//
// Picks the `id` column from the DB schema and tightens it to UUID — the
// generator emits it as `z.string()` because Prisma's `@db.Uuid` is a
// storage hint, not a Zod refinement.

export const deviceIdParamSchema = DeviceModelSchema.pick({ id: true }).extend({
  id: z.uuid("id must be a valid UUID."),
});

// ── Inferred TS types — single source via z.infer ────────────────────────

export type CreateDeviceInput = z.infer<typeof createDeviceSchema>;
export type ListDevicesQuery = z.infer<typeof listDevicesQuerySchema>;
export type VerifyDeviceQuery = z.infer<typeof verifyDeviceQuerySchema>;
