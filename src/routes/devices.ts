import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { pool } from "../db.js";
import { authGuard } from "../middleware/auth-guard.js";
import { errorHandler } from "../middleware/error-handler.js";
import { conflict, notFound } from "../errors/app-error.js";
import { logger } from "../logger.js";

const router: Router = Router();

// ── Types ──────────────────────────────────────────────────────────────────

interface DeviceRow {
  id: string;
  device_id: string;
  rfid: string;
  mac_address: string;
  name: string | null;
  created_at: Date;
  created_by: string;
}

interface DeviceDTO {
  id: string;
  deviceId: string;
  rfid: string;
  macAddress: string;
  name: string | null;
  createdAt: string;
  createdBy: string;
}

function toDTO(row: DeviceRow): DeviceDTO {
  return {
    id: row.id,
    deviceId: row.device_id,
    rfid: row.rfid,
    macAddress: row.mac_address,
    name: row.name,
    createdAt: row.created_at.toISOString(),
    createdBy: row.created_by,
  };
}

// ── Zod Schemas ────────────────────────────────────────────────────────────

const MAC_REGEX = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;

const createDeviceSchema = z.object({
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
    .regex(MAC_REGEX, "macAddress must be a valid MAC address (e.g. AA:BB:CC:DD:EE:FF)."),
  name: z
    .string()
    .trim()
    .max(200, "name must be at most 200 characters.")
    .optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const verifyQuerySchema = z
  .object({
    deviceId: z.string().trim().min(1).optional(),
    rfid: z.string().trim().min(1).optional(),
    macAddress: z
      .string()
      .trim()
      .regex(MAC_REGEX, "macAddress must be a valid MAC address.")
      .optional(),
  })
  .refine(
    (data) => data.deviceId || data.rfid || data.macAddress,
    { message: "Provide at least one of: deviceId, rfid, macAddress." },
  );

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const idParamSchema = z.object({
  id: z.string().regex(UUID_REGEX, "id must be a valid UUID."),
});

// ── Helpers ────────────────────────────────────────────────────────────────

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

/**
 * Maps PostgreSQL unique-constraint violation (23505) to a user-friendly
 * conflict error indicating which field caused the duplicate.
 */
function handleUniqueViolation(err: unknown): never {
  if (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "23505"
  ) {
    const constraint = (err as { constraint?: string }).constraint ?? "";
    const field = constraint.includes("device_id")
      ? "deviceId"
      : constraint.includes("rfid")
        ? "rfid"
        : constraint.includes("mac")
          ? "macAddress"
          : "deviceId, rfid, or macAddress";

    throw conflict(`A device with this ${field} already exists.`);
  }
  throw err;
}

// ── All routes require authentication ──────────────────────────────────────

router.use(authGuard);

// ── POST /api/devices — Register a new device ─────────────────────────────

router.post(
  "/",
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const body = createDeviceSchema.parse(req.body);

    try {
      const { rows } = await pool.query<DeviceRow>(
        `INSERT INTO device (device_id, rfid, mac_address, name, created_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          body.deviceId,
          body.rfid,
          body.macAddress.toUpperCase(),
          body.name ?? null,
          req.user!.id,
        ],
      );

      const device = rows[0]!;
      logger.info(`[DEVICE] Registered device ${device.id} by user ${req.user!.id}`);
      res.status(201).json(toDTO(device));
    } catch (err) {
      handleUniqueViolation(err);
    }
  }),
);

// ── GET /api/devices — List all devices ────────────────────────────────────

router.get(
  "/",
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { page, limit } = listQuerySchema.parse(req.query);
    const offset = (page - 1) * limit;

    const [dataResult, countResult] = await Promise.all([
      pool.query<DeviceRow>(
        "SELECT * FROM device ORDER BY created_at DESC LIMIT $1 OFFSET $2",
        [limit, offset],
      ),
      pool.query<{ count: string }>("SELECT count(*)::text AS count FROM device"),
    ]);

    const total = Number(countResult.rows[0]!.count);

    res.json({
      data: dataResult.rows.map(toDTO),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  }),
);

// ── GET /api/devices/verify — Check if a device exists ─────────────────────

router.get(
  "/verify",
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const query = verifyQuerySchema.parse(req.query);

    const conditions: string[] = [];
    const values: string[] = [];
    let idx = 1;

    if (query.deviceId) {
      conditions.push(`device_id = $${idx++}`);
      values.push(query.deviceId);
    }
    if (query.rfid) {
      conditions.push(`rfid = $${idx++}`);
      values.push(query.rfid);
    }
    if (query.macAddress) {
      conditions.push(`mac_address = $${idx++}`);
      values.push(query.macAddress.toUpperCase());
    }

    const { rows } = await pool.query<DeviceRow>(
      `SELECT * FROM device WHERE ${conditions.join(" OR ")} LIMIT 1`,
      values,
    );

    if (rows.length > 0) {
      res.json({ exists: true, device: toDTO(rows[0]!) });
    } else {
      res.json({ exists: false });
    }
  }),
);

// ── DELETE /api/devices/:id — Remove a device ──────────────────────────────

router.delete(
  "/:id",
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = idParamSchema.parse(req.params);

    const { rows } = await pool.query<DeviceRow>(
      "DELETE FROM device WHERE id = $1 RETURNING *",
      [id],
    );

    if (rows.length === 0) {
      throw notFound("Device not found.");
    }

    const removed = rows[0]!;
    logger.info(`[DEVICE] Deleted device ${removed.id} by user ${req.user!.id}`);
    res.json({ message: "Device deleted.", device: toDTO(removed) });
  }),
);

// ── Router-level error handler ─────────────────────────────────────────────

router.use(errorHandler);

export default router;
