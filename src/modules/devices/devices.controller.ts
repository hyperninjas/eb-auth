import type { Request, Response } from "express";
import type { ValidatedRequest } from "../../middleware/validate";
import { devicesService } from "./devices.service";
import { toDeviceDTO } from "./devices.dto";
import type {
  CreateDeviceInput,
  ListDevicesQuery,
  UpdateDeviceInput,
  VerifyDeviceQuery,
} from "./devices.schema";
import type {
  DeviceCreateResponse,
  DeviceDeleteResponse,
  DeviceListResponse,
  DeviceUpdateResponse,
  DeviceVerifyResponse,
} from "./devices.openapi";

// Local type aliases — each handler narrows `req.validated` to the shape
// the corresponding `validate()` middleware produced. This keeps the
// controller free of `.parse()` calls and gives editor autocomplete.
type CreateReq = ValidatedRequest<CreateDeviceInput>;
type ListReq = ValidatedRequest<unknown, ListDevicesQuery>;
type VerifyReq = ValidatedRequest<unknown, VerifyDeviceQuery>;
type UpdateReq = ValidatedRequest<UpdateDeviceInput, unknown, { id: string }>;
type RemoveReq = ValidatedRequest<unknown, unknown, { id: string }>;

/**
 * Devices HTTP layer. Pure adapters: parse the validated payload from
 * `req.validated`, call the service, format the response. No business
 * logic, no DB queries — those live in `devices.service.ts`.
 *
 * Each handler types its `Response<T>` parameter with the per-endpoint
 * response type imported from `devices.openapi.ts`. That makes
 * `res.json(...)` only accept payloads matching the OpenAPI document —
 * if the openapi schema and the controller drift, typecheck flags it.
 *
 * Methods are arrow functions so they can be passed as bare references to
 * Express routes without losing `this`.
 */
export const devicesController = {
  create: async (req: Request, res: Response<DeviceCreateResponse>): Promise<void> => {
    const body = (req as CreateReq).validated.body;
    const device = await devicesService.create(body, req.user!.id);
    res.status(201).json(toDeviceDTO(device));
  },

  list: async (req: Request, res: Response<DeviceListResponse>): Promise<void> => {
    const query = (req as ListReq).validated.query;
    const result = await devicesService.list(query);
    res.json({
      data: result.items.map(toDeviceDTO),
      pagination: result.pagination,
    });
  },

  verify: async (req: Request, res: Response<DeviceVerifyResponse>): Promise<void> => {
    const query = (req as VerifyReq).validated.query;
    const device = await devicesService.verify(query);
    if (device) {
      res.json({ exists: true, device: toDeviceDTO(device) });
    } else {
      res.json({ exists: false });
    }
  },

  update: async (req: Request, res: Response<DeviceUpdateResponse>): Promise<void> => {
    const { id } = (req as UpdateReq).validated.params;
    const body = (req as UpdateReq).validated.body;
    const updated = await devicesService.update(id, body, req.user!.id);
    res.json(toDeviceDTO(updated));
  },

  remove: async (req: Request, res: Response<DeviceDeleteResponse>): Promise<void> => {
    const { id } = (req as RemoveReq).validated.params;
    const removed = await devicesService.remove(id, req.user!.id);
    res.json({ message: "Device deleted.", device: toDeviceDTO(removed) });
  },
};
