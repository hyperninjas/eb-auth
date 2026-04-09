import type { Device } from "../../generated/prisma/client";
import { devicesRepository } from "./devices.repository";
import type {
  CreateDeviceInput,
  ListDevicesQuery,
  UpdateDeviceInput,
  VerifyDeviceQuery,
} from "./devices.schema";
import { DeviceNotFoundError } from "../../errors/domain";
import type { Pagination } from "../../http/openapi-shared";
import { getLogger } from "../../infra/logger";

/**
 * Paginated result from the service layer. The envelope shape (`items` +
 * `pagination`) is reused across modules; the per-module DTO is what
 * varies. `Pagination` is imported from `openapi-shared.ts` so this type
 * and the OpenAPI document share one definition.
 */
export interface PaginatedResult<T> {
  items: T[];
  pagination: Pagination;
}

/**
 * Devices business logic. HTTP-agnostic — every error this layer throws
 * is a `DomainError`, never an `AppError`. The HTTP error handler maps
 * domain errors to HTTP responses at the request boundary.
 */
export const devicesService = {
  async create(input: CreateDeviceInput, createdBy: string): Promise<Device> {
    const device = await devicesRepository.create({
      deviceId: input.deviceId,
      rfid: input.rfid,
      macAddress: input.macAddress.toUpperCase(),
      name: input.name ?? null,
      createdBy,
    });
    getLogger().info({ deviceId: device.id, createdBy }, "Device registered");
    return device;
  },

  async list(query: ListDevicesQuery): Promise<PaginatedResult<Device>> {
    const { page, limit } = query;
    const { items, total } = await devicesRepository.listPaginated(page, limit);
    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  async verify(query: VerifyDeviceQuery): Promise<Device | null> {
    // Build filters object conditionally so undefined keys are absent —
    // required by `exactOptionalPropertyTypes: true`.
    const filters: { deviceId?: string; rfid?: string; macAddress?: string } = {};
    if (query.deviceId) filters.deviceId = query.deviceId;
    if (query.rfid) filters.rfid = query.rfid;
    if (query.macAddress) filters.macAddress = query.macAddress.toUpperCase();
    return devicesRepository.findFirstMatching(filters);
  },

  async update(id: string, input: UpdateDeviceInput, updatedBy: string): Promise<Device> {
    const existing = await devicesRepository.findById(id);
    if (!existing) throw new DeviceNotFoundError(id);

    // Build the update payload conditionally so undefined keys are absent
    // (required by `exactOptionalPropertyTypes: true`) and `name` is
    // explicitly settable to null via the API in the future without
    // colliding with the omitted-key case.
    const data: { name?: string | null; rfid?: string; macAddress?: string } = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.rfid !== undefined) data.rfid = input.rfid;
    if (input.macAddress !== undefined) {
      data.macAddress = input.macAddress.toUpperCase();
    }

    const updated = await devicesRepository.update(id, data);
    getLogger().info({ deviceId: updated.id, updatedBy }, "Device updated");
    return updated;
  },

  async remove(id: string, removedBy: string): Promise<Device> {
    const existing = await devicesRepository.findById(id);
    if (!existing) throw new DeviceNotFoundError(id);
    const removed = await devicesRepository.delete(id);
    getLogger().info({ deviceId: removed.id, removedBy }, "Device deleted");
    return removed;
  },
};
