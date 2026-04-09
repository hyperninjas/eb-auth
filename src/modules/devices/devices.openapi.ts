import type { ZodOpenApiPathsObject } from "zod-openapi";
import { z } from "zod";
import { errorResponseSchema, paginatedResponse } from "../../http/openapi-shared";
import { deviceDTOSchema } from "./devices.dto";
import {
  createDeviceSchema,
  deviceIdParamSchema,
  listDevicesQuerySchema,
  updateDeviceSchema,
  verifyDeviceQuerySchema,
} from "./devices.schema";

/**
 * OpenAPI paths + per-endpoint response schemas for the devices module.
 *
 * Each successful response shape is defined as a Zod schema and exported
 * with both `Schema` and an inferred TypeScript type. The controller then
 * types `Response<DeviceCreateResponse>` etc., so the wire body is
 * compile-time linked to the OpenAPI document — drift between the runtime
 * and the published spec is a typecheck error.
 *
 * Nothing in this file duplicates the Device shape: it's all imported
 * from `devices.dto.ts`, which derives from the Prisma-generated schema.
 */

// ── Per-endpoint response schemas ────────────────────────────────────────

export const deviceCreateResponseSchema = deviceDTOSchema;
export type DeviceCreateResponse = z.infer<typeof deviceCreateResponseSchema>;

export const deviceListResponseSchema = paginatedResponse(deviceDTOSchema).meta({
  id: "DeviceListResponse",
});
export type DeviceListResponse = z.infer<typeof deviceListResponseSchema>;

export const deviceVerifyResponseSchema = z
  .discriminatedUnion("exists", [
    z.object({ exists: z.literal(true), device: deviceDTOSchema }),
    z.object({ exists: z.literal(false) }),
  ])
  .meta({ id: "DeviceVerifyResponse" });
export type DeviceVerifyResponse = z.infer<typeof deviceVerifyResponseSchema>;

export const deviceDeleteResponseSchema = z
  .object({
    message: z.string(),
    device: deviceDTOSchema,
  })
  .meta({ id: "DeviceDeleteResponse" });
export type DeviceDeleteResponse = z.infer<typeof deviceDeleteResponseSchema>;

// PATCH returns the updated device — same shape as create.
export const deviceUpdateResponseSchema = deviceDTOSchema;
export type DeviceUpdateResponse = z.infer<typeof deviceUpdateResponseSchema>;

// ── Paths ────────────────────────────────────────────────────────────────

export const devicesPaths: ZodOpenApiPathsObject = {
  "/api/devices": {
    post: {
      tags: ["devices"],
      summary: "Register a new device",
      security: [{ bearerAuth: [] }],
      requestBody: {
        content: { "application/json": { schema: createDeviceSchema } },
      },
      responses: {
        "201": {
          description: "Device created",
          content: {
            "application/json": { schema: deviceCreateResponseSchema },
          },
        },
        "400": {
          description: "Validation error",
          content: { "application/json": { schema: errorResponseSchema } },
        },
        "409": {
          description: "Conflict (duplicate)",
          content: { "application/json": { schema: errorResponseSchema } },
        },
      },
    },
    get: {
      tags: ["devices"],
      summary: "List devices (paginated)",
      security: [{ bearerAuth: [] }],
      requestParams: { query: listDevicesQuerySchema },
      responses: {
        "200": {
          description: "Paginated list of devices",
          content: {
            "application/json": { schema: deviceListResponseSchema },
          },
        },
      },
    },
  },
  "/api/devices/verify": {
    get: {
      tags: ["devices"],
      summary: "Check whether a device exists by deviceId / rfid / macAddress",
      security: [{ bearerAuth: [] }],
      requestParams: { query: verifyDeviceQuerySchema },
      responses: {
        "200": {
          description: "Existence check result",
          content: {
            "application/json": { schema: deviceVerifyResponseSchema },
          },
        },
      },
    },
  },
  "/api/devices/{id}": {
    patch: {
      tags: ["devices"],
      summary: "Update an existing device",
      security: [{ bearerAuth: [] }],
      requestParams: { path: deviceIdParamSchema },
      requestBody: {
        content: { "application/json": { schema: updateDeviceSchema } },
      },
      responses: {
        "200": {
          description: "Device updated",
          content: {
            "application/json": { schema: deviceUpdateResponseSchema },
          },
        },
        "400": {
          description: "Validation error",
          content: { "application/json": { schema: errorResponseSchema } },
        },
        "404": {
          description: "Not found",
          content: { "application/json": { schema: errorResponseSchema } },
        },
        "409": {
          description: "Conflict (rfid or macAddress already in use)",
          content: { "application/json": { schema: errorResponseSchema } },
        },
      },
    },
    delete: {
      tags: ["devices"],
      summary: "Delete a device",
      security: [{ bearerAuth: [] }],
      requestParams: { path: deviceIdParamSchema },
      responses: {
        "200": {
          description: "Device deleted",
          content: {
            "application/json": { schema: deviceDeleteResponseSchema },
          },
        },
        "404": {
          description: "Not found",
          content: { "application/json": { schema: errorResponseSchema } },
        },
      },
    },
  },
};
