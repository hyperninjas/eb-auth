import { describe, it, expect } from "vitest";
import {
  createDeviceSchema,
  listDevicesQuerySchema,
  verifyDeviceQuerySchema,
} from "./devices.schema";

describe("createDeviceSchema", () => {
  it("accepts a minimal valid payload", () => {
    const result = createDeviceSchema.safeParse({
      deviceId: "DEV-001",
      rfid: "RFID-001",
      macAddress: "AA:BB:CC:DD:EE:FF",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty deviceId", () => {
    const result = createDeviceSchema.safeParse({
      deviceId: "",
      rfid: "RFID-001",
      macAddress: "AA:BB:CC:DD:EE:FF",
    });
    expect(result.success).toBe(false);
  });

  it("trims whitespace", () => {
    const result = createDeviceSchema.safeParse({
      deviceId: "  DEV-001  ",
      rfid: "RFID-001",
      macAddress: "AA:BB:CC:DD:EE:FF",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.deviceId).toBe("DEV-001");
  });
});

describe("listDevicesQuerySchema", () => {
  it("applies defaults when query is empty", () => {
    const result = listDevicesQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(20);
    }
  });

  it("coerces string query params to numbers", () => {
    const result = listDevicesQuerySchema.safeParse({
      page: "3",
      limit: "50",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(3);
      expect(result.data.limit).toBe(50);
    }
  });

  it("rejects limit > 100", () => {
    const result = listDevicesQuerySchema.safeParse({ limit: "500" });
    expect(result.success).toBe(false);
  });
});

describe("verifyDeviceQuerySchema", () => {
  it("requires at least one of deviceId/rfid/macAddress", () => {
    const result = verifyDeviceQuerySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("accepts a single field", () => {
    const result = verifyDeviceQuerySchema.safeParse({ rfid: "RFID-001" });
    expect(result.success).toBe(true);
  });
});
