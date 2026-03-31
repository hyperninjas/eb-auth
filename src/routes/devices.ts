import { Router, type Request, type Response } from "express";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { authGuard } from "../middleware/auth-guard.js";
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

// ── Helpers ────────────────────────────────────────────────────────────────

async function readDevices(): Promise<Device[]> {
  const raw = await readFile(DEVICES_FILE, "utf-8");
  return JSON.parse(raw) as Device[];
}

async function writeDevices(devices: Device[]): Promise<void> {
  await writeFile(DEVICES_FILE, JSON.stringify(devices, null, 2) + "\n", "utf-8");
}

const MAC_RE = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;

// ── All routes require authentication ──────────────────────────────────────

router.use(authGuard);

// ── POST /api/devices — Register a new device ─────────────────────────────

router.post("/", async (req: Request, res: Response): Promise<void> => {
  const { deviceId, rfid, macAddress, name } = req.body ?? {};

  if (!deviceId || !rfid || !macAddress) {
    res.status(400).json({ error: "deviceId, rfid, and macAddress are required." });
    return;
  }

  if (typeof deviceId !== "string" || typeof rfid !== "string" || typeof macAddress !== "string") {
    res.status(400).json({ error: "deviceId, rfid, and macAddress must be strings." });
    return;
  }

  if (!MAC_RE.test(macAddress)) {
    res.status(400).json({ error: "macAddress must be a valid MAC address (e.g. AA:BB:CC:DD:EE:FF)." });
    return;
  }

  try {
    const devices = await readDevices();

    const duplicate = devices.find(
      (d) => d.deviceId === deviceId || d.rfid === rfid || d.macAddress.toLowerCase() === macAddress.toLowerCase()
    );
    if (duplicate) {
      res.status(409).json({ error: "A device with this deviceId, rfid, or macAddress already exists." });
      return;
    }

    const newDevice: Device = {
      id: randomUUID(),
      deviceId,
      rfid,
      macAddress: macAddress.toUpperCase(),
      name: typeof name === "string" ? name : undefined,
      createdAt: new Date().toISOString(),
      createdBy: req.user!.id,
    };

    devices.push(newDevice);
    await writeDevices(devices);

    logger.info(`[DEVICE] Registered device ${newDevice.id} by user ${req.user!.id}`);
    res.status(201).json(newDevice);
  } catch (err) {
    logger.error(err, "Failed to register device");
    res.status(500).json({ error: "Failed to register device." });
  }
});

// ── GET /api/devices — List all devices ────────────────────────────────────

router.get("/", async (_req: Request, res: Response): Promise<void> => {
  try {
    const devices = await readDevices();
    res.json(devices);
  } catch (err) {
    logger.error(err, "Failed to read devices");
    res.status(500).json({ error: "Failed to read devices." });
  }
});

// ── GET /api/devices/verify — Check if a device exists ─────────────────────
// Query params: ?deviceId=...  OR  ?rfid=...  OR  ?macAddress=...

router.get("/verify", async (req: Request, res: Response): Promise<void> => {
  const { deviceId, rfid, macAddress } = req.query;

  if (!deviceId && !rfid && !macAddress) {
    res.status(400).json({ error: "Provide at least one of: deviceId, rfid, macAddress." });
    return;
  }

  try {
    const devices = await readDevices();

    const found = devices.find(
      (d) =>
        (deviceId && d.deviceId === deviceId) ||
        (rfid && d.rfid === rfid) ||
        (macAddress && d.macAddress.toLowerCase() === (macAddress as string).toLowerCase())
    );

    if (found) {
      res.json({ exists: true, device: found });
    } else {
      res.json({ exists: false });
    }
  } catch (err) {
    logger.error(err, "Failed to verify device");
    res.status(500).json({ error: "Failed to verify device." });
  }
});

// ── DELETE /api/devices/:id — Remove a device ──────────────────────────────

router.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    const devices = await readDevices();
    const index = devices.findIndex((d) => d.id === id);

    if (index === -1) {
      res.status(404).json({ error: "Device not found." });
      return;
    }

    const [removed] = devices.splice(index, 1);
    await writeDevices(devices);

    logger.info(`[DEVICE] Deleted device ${removed!.id} by user ${req.user!.id}`);
    res.json({ message: "Device deleted.", device: removed });
  } catch (err) {
    logger.error(err, "Failed to delete device");
    res.status(500).json({ error: "Failed to delete device." });
  }
});

export default router;
