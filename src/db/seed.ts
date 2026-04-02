import { pool } from "../db.js";
import { logger } from "../logger.js";

const SEED_DEVICES = [
  { device_id: "DEV-001", rfid: "E00401007B3C2A01", mac_address: "AA:BB:CC:DD:EE:01", name: "Warehouse Scanner A1" },
  { device_id: "DEV-002", rfid: "E00401007B3C2A02", mac_address: "AA:BB:CC:DD:EE:02", name: "Warehouse Scanner A2" },
  { device_id: "DEV-003", rfid: "E00401007B3C2A03", mac_address: "AA:BB:CC:DD:EE:03", name: "Loading Dock Reader B1" },
  { device_id: "DEV-004", rfid: "E00401007B3C2A04", mac_address: "AA:BB:CC:DD:EE:04", name: "Loading Dock Reader B2" },
  { device_id: "DEV-005", rfid: "E00401007B3C2A05", mac_address: "AA:BB:CC:DD:EE:05", name: "Office Entry Gate C1" },
  { device_id: "DEV-006", rfid: "E00401007B3C2A06", mac_address: "AA:BB:CC:DD:EE:06", name: "Office Entry Gate C2" },
  { device_id: "DEV-007", rfid: "E00401007B3C2A07", mac_address: "AA:BB:CC:DD:EE:07", name: "Parking Lot Sensor D1" },
  { device_id: "DEV-008", rfid: "E00401007B3C2A08", mac_address: "AA:BB:CC:DD:EE:08", name: "Parking Lot Sensor D2" },
  { device_id: "DEV-009", rfid: "E00401007B3C2A09", mac_address: "AA:BB:CC:DD:EE:09", name: "Server Room Monitor E1" },
  { device_id: "DEV-010", rfid: "E00401007B3C2A10", mac_address: "AA:BB:CC:DD:EE:10", name: "Server Room Monitor E2" },
  { device_id: "DEV-011", rfid: "E00401007B3C2A11", mac_address: "AA:BB:CC:DD:EE:11", name: "Inventory Tracker F1" },
  { device_id: "DEV-012", rfid: "E00401007B3C2A12", mac_address: "AA:BB:CC:DD:EE:12", name: "Inventory Tracker F2" },
  { device_id: "DEV-013", rfid: "E00401007B3C2A13", mac_address: "AA:BB:CC:DD:EE:13", name: "Assembly Line Sensor G1" },
  { device_id: "DEV-014", rfid: "E00401007B3C2A14", mac_address: "AA:BB:CC:DD:EE:14", name: "Assembly Line Sensor G2" },
  { device_id: "DEV-015", rfid: "E00401007B3C2A15", mac_address: "AA:BB:CC:DD:EE:15", name: "Cold Storage Monitor H1" },
  { device_id: "DEV-016", rfid: "E00401007B3C2A16", mac_address: "AA:BB:CC:DD:EE:16", name: "Cold Storage Monitor H2" },
  { device_id: "DEV-017", rfid: "E00401007B3C2A17", mac_address: "AA:BB:CC:DD:EE:17", name: "Shipping Bay Reader I1" },
  { device_id: "DEV-018", rfid: "E00401007B3C2A18", mac_address: "AA:BB:CC:DD:EE:18", name: "Shipping Bay Reader I2" },
  { device_id: "DEV-019", rfid: "E00401007B3C2A19", mac_address: "AA:BB:CC:DD:EE:19", name: "Quality Control Station J1" },
  { device_id: "DEV-020", rfid: "E00401007B3C2A20", mac_address: "AA:BB:CC:DD:EE:20", name: "Quality Control Station J2" },
  { device_id: "DEV-021", rfid: "E00401007B3C2A21", mac_address: "AA:BB:CC:DD:EE:21", name: "Forklift Tracker K1" },
  { device_id: "DEV-022", rfid: "E00401007B3C2A22", mac_address: "AA:BB:CC:DD:EE:22", name: "Forklift Tracker K2" },
  { device_id: "DEV-023", rfid: "E00401007B3C2A23", mac_address: "AA:BB:CC:DD:EE:23", name: "Emergency Exit Sensor L1" },
  { device_id: "DEV-024", rfid: "E00401007B3C2A24", mac_address: "AA:BB:CC:DD:EE:24", name: "Emergency Exit Sensor L2" },
  { device_id: "DEV-025", rfid: "E00401007B3C2A25", mac_address: "AA:BB:CC:DD:EE:25", name: "Maintenance Tool Tag M1" },
  { device_id: "DEV-026", rfid: "E00401007B3C2A26", mac_address: "AA:BB:CC:DD:EE:26", name: "Maintenance Tool Tag M2" },
  { device_id: "DEV-027", rfid: "E00401007B3C2A27", mac_address: "AA:BB:CC:DD:EE:27", name: "Fleet Vehicle GPS N1" },
  { device_id: "DEV-028", rfid: "E00401007B3C2A28", mac_address: "AA:BB:CC:DD:EE:28", name: "Fleet Vehicle GPS N2" },
  { device_id: "DEV-029", rfid: "E00401007B3C2A29", mac_address: "AA:BB:CC:DD:EE:29", name: "Visitor Badge Reader O1" },
  { device_id: "DEV-030", rfid: "E00401007B3C2A30", mac_address: "AA:BB:CC:DD:EE:30", name: "Visitor Badge Reader O2" },
  { device_id: "DEV-031", rfid: "E00401007B3C2A31", mac_address: "AA:BB:CC:DD:EE:31", name: "Roof HVAC Sensor P1" },
  { device_id: "DEV-032", rfid: "E00401007B3C2A32", mac_address: "AA:BB:CC:DD:EE:32", name: "Roof HVAC Sensor P2" },
  { device_id: "DEV-033", rfid: "E00401007B3C2A33", mac_address: "AA:BB:CC:DD:EE:33", name: "Water Meter Reader Q1" },
  { device_id: "DEV-034", rfid: "E00401007B3C2A34", mac_address: "AA:BB:CC:DD:EE:34", name: "Water Meter Reader Q2" },
  { device_id: "DEV-035", rfid: "E00401007B3C2A35", mac_address: "AA:BB:CC:DD:EE:35", name: "Electrical Panel Monitor R1" },
  { device_id: "DEV-036", rfid: "E00401007B3C2A36", mac_address: "AA:BB:CC:DD:EE:36", name: "Electrical Panel Monitor R2" },
  { device_id: "DEV-037", rfid: "E00401007B3C2A37", mac_address: "AA:BB:CC:DD:EE:37", name: "Fire Alarm Panel S1" },
  { device_id: "DEV-038", rfid: "E00401007B3C2A38", mac_address: "AA:BB:CC:DD:EE:38", name: "Fire Alarm Panel S2" },
  { device_id: "DEV-039", rfid: "E00401007B3C2A39", mac_address: "AA:BB:CC:DD:EE:39", name: "CCTV Controller T1" },
  { device_id: "DEV-040", rfid: "E00401007B3C2A40", mac_address: "AA:BB:CC:DD:EE:40", name: "CCTV Controller T2" },
  { device_id: "DEV-041", rfid: "E00401007B3C2A41", mac_address: "AA:BB:CC:DD:EE:41", name: "Access Control Panel U1" },
  { device_id: "DEV-042", rfid: "E00401007B3C2A42", mac_address: "AA:BB:CC:DD:EE:42", name: "Access Control Panel U2" },
  { device_id: "DEV-043", rfid: "E00401007B3C2A43", mac_address: "AA:BB:CC:DD:EE:43", name: "Environmental Sensor V1" },
  { device_id: "DEV-044", rfid: "E00401007B3C2A44", mac_address: "AA:BB:CC:DD:EE:44", name: "Environmental Sensor V2" },
  { device_id: "DEV-045", rfid: "E00401007B3C2A45", mac_address: "AA:BB:CC:DD:EE:45", name: "Smart Lock W1" },
  { device_id: "DEV-046", rfid: "E00401007B3C2A46", mac_address: "AA:BB:CC:DD:EE:46", name: "Smart Lock W2" },
  { device_id: "DEV-047", rfid: "E00401007B3C2A47", mac_address: "AA:BB:CC:DD:EE:47", name: "Conveyor Belt Sensor X1" },
  { device_id: "DEV-048", rfid: "E00401007B3C2A48", mac_address: "AA:BB:CC:DD:EE:48", name: "Conveyor Belt Sensor X2" },
  { device_id: "DEV-049", rfid: "E00401007B3C2A49", mac_address: "AA:BB:CC:DD:EE:49", name: "Robotic Arm Controller Y1" },
  { device_id: "DEV-050", rfid: "E00401007B3C2A50", mac_address: "AA:BB:CC:DD:EE:50", name: "Robotic Arm Controller Y2" },
];

/**
 * Seeds the device table with initial data if it's empty.
 * Safe to run on every startup — only inserts when table has zero rows.
 */
export async function seedDevices(): Promise<void> {
  const { rows } = await pool.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM device"
  );

  if (Number(rows[0]!.count) > 0) {
    logger.info(`[SEED] Device table already has data (${rows[0]!.count} rows) — skipping seed.`);
    return;
  }

  logger.info(`[SEED] Seeding ${SEED_DEVICES.length} devices…`);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const d of SEED_DEVICES) {
      await client.query(
        `INSERT INTO device (device_id, rfid, mac_address, name, created_by)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (device_id) DO NOTHING`,
        [d.device_id, d.rfid, d.mac_address, d.name, "system-seed"],
      );
    }

    await client.query("COMMIT");
    logger.info(`[SEED] Seeded ${SEED_DEVICES.length} devices.`);
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error(err, "[SEED] Failed to seed devices");
    throw err;
  } finally {
    client.release();
  }
}