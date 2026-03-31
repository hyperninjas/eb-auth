import { Router, type Request, type Response, type NextFunction } from "express";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { authGuard } from "../middleware/auth-guard.js";
import { errorHandler } from "../middleware/error-handler.js";
import { conflict, notFound } from "../errors/app-error.js";
import { logger } from "../logger.js";

const router: Router = Router();
const DEVICES_FILE = join(process.cwd(), "data", "devices.json");

// ── Types ──────────────────────────────────────────────────────────────────

interface Device {
  id: string;
  deviceId: string;
  rfid: string;
  macAddress: string;
  name?: string | undefined;
  createdAt: string;
  createdBy: string;
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

async function readDevices(): Promise<Device[]> {
  const raw = await readFile(DEVICES_FILE, "utf-8");
  return JSON.parse(raw) as Device[];
}

async function writeDevices(devices: Device[]): Promise<void> {
  await writeFile(DEVICES_FILE, JSON.stringify(devices, null, 2) + "\n", "utf-8");
}

/**
 * Wraps an async route handler so thrown errors are forwarded to Express
 * error middleware instead of causing unhandled promise rejections.
 */
function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

// ── All routes require authentication ──────────────────────────────────────

router.use(authGuard);

// ── POST /api/devices — Register a new device ─────────────────────────────

router.post(
  "/",
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const body = createDeviceSchema.parse(req.body);

    const devices = await readDevices();

    const duplicateOn = devices.find((d) => d.deviceId === body.deviceId)
      ? "deviceId"
      : devices.find((d) => d.rfid === body.rfid)
        ? "rfid"
        : devices.find(
              (d) => d.macAddress.toLowerCase() === body.macAddress.toLowerCase(),
            )
          ? "macAddress"
          : null;

    if (duplicateOn) {
      throw conflict(
        `A device with this ${duplicateOn} already exists.`,
      );
    }

    const newDevice: Device = {
      id: randomUUID(),
      deviceId: body.deviceId,
      rfid: body.rfid,
      macAddress: body.macAddress.toUpperCase(),
      name: body.name,
      createdAt: new Date().toISOString(),
      createdBy: req.user!.id,
    };

    devices.push(newDevice);
    await writeDevices(devices);

    logger.info(`[DEVICE] Registered device ${newDevice.id} by user ${req.user!.id}`);
    res.status(201).json(newDevice);
  }),
);

// ── GET /api/devices — List all devices ────────────────────────────────────

router.get(
  "/",
  asyncHandler(async (_req: Request, res: Response): Promise<void> => {
    const devices = await readDevices();
    res.json(devices);
  }),
);

// ── GET /api/devices/verify — Check if a device exists ─────────────────────

router.get(
  "/verify",
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const query = verifyQuerySchema.parse(req.query);

    const devices = await readDevices();

    const found = devices.find(
      (d) =>
        (query.deviceId && d.deviceId === query.deviceId) ||
        (query.rfid && d.rfid === query.rfid) ||
        (query.macAddress &&
          d.macAddress.toLowerCase() === query.macAddress.toLowerCase()),
    );

    if (found) {
      res.json({ exists: true, device: found });
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

    const devices = await readDevices();
    const index = devices.findIndex((d) => d.id === id);

    if (index === -1) {
      throw notFound("Device not found.");
    }

    const [removed] = devices.splice(index, 1);
    await writeDevices(devices);

    logger.info(`[DEVICE] Deleted device ${removed!.id} by user ${req.user!.id}`);
    res.json({ message: "Device deleted.", device: removed });
  }),
);

// ── Router-level error handler ─────────────────────────────────────────────

router.use(errorHandler);

export default router;
