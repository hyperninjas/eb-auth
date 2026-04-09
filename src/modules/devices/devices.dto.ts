import { z } from "zod";
import { DeviceModelSchema } from "../../generated/zod/schemas/variants/pure";
import type { Device } from "../../generated/prisma/client";

/**
 * Single source of truth for the Device response shape.
 *
 * Built on top of `DeviceModelSchema` (auto-generated from the Prisma
 * schema by `prisma-zod-generator`). When you rename or add a column in
 * `prisma/schema.prisma`, the generator updates `DeviceModelSchema` on
 * the next `prisma generate`, and this file's typecheck either keeps
 * working (additive change) or fails (breaking change) — you can never
 * silently drift.
 *
 * What we override:
 *   - `id` → uuid format (Prisma's `@db.Uuid` doesn't carry through to Zod)
 *   - `createdAt` → ISO datetime string instead of `Date`, since this
 *     value is JSON-serialised on the wire.
 */
export const deviceDTOSchema = DeviceModelSchema.extend({
  id: z.uuid(),
  createdAt: z.iso.datetime(),
}).meta({ id: "Device" });

export type DeviceDTO = z.infer<typeof deviceDTOSchema>;

/**
 * Maps a Prisma `Device` row to its DTO. The `satisfies` clause guarantees
 * the function actually produces something matching `deviceDTOSchema` —
 * if the schema and the mapper diverge, this is a typecheck error.
 */
export function toDeviceDTO(device: Device): DeviceDTO {
  return {
    id: device.id,
    deviceId: device.deviceId,
    rfid: device.rfid,
    macAddress: device.macAddress,
    name: device.name,
    createdAt: device.createdAt.toISOString(),
    createdBy: device.createdBy,
  } satisfies DeviceDTO;
}
