import type { Device, Prisma } from "../../generated/prisma/client";
import { prisma } from "../../infra/prisma";

/**
 * Thin Prisma wrapper for the `device` table. Keeps DB access in one place
 * so the service layer stays storage-agnostic and easy to test.
 */
export const devicesRepository = {
  create(data: Prisma.DeviceCreateInput): Promise<Device> {
    return prisma.device.create({ data });
  },

  findById(id: string): Promise<Device | null> {
    return prisma.device.findUnique({ where: { id } });
  },

  findFirstMatching(filters: {
    deviceId?: string;
    rfid?: string;
    macAddress?: string;
  }): Promise<Device | null> {
    const or: Prisma.DeviceWhereInput[] = [];
    if (filters.deviceId) or.push({ deviceId: filters.deviceId });
    if (filters.rfid) or.push({ rfid: filters.rfid });
    if (filters.macAddress) or.push({ macAddress: filters.macAddress });
    if (or.length === 0) return Promise.resolve(null);
    return prisma.device.findFirst({ where: { OR: or } });
  },

  async listPaginated(page: number, limit: number): Promise<{ items: Device[]; total: number }> {
    const [items, total] = await prisma.$transaction([
      prisma.device.findMany({
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.device.count(),
    ]);
    return { items, total };
  },

  update(id: string, data: Prisma.DeviceUpdateInput): Promise<Device> {
    return prisma.device.update({ where: { id }, data });
  },

  delete(id: string): Promise<Device> {
    return prisma.device.delete({ where: { id } });
  },
};
