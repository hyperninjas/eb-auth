import { Router } from "express";
import { authGuard } from "../../middleware/auth-guard";
import { asyncHandler } from "../../middleware/async-handler";
import { validate } from "../../middleware/validate";
import { devicesController } from "./devices.controller";
import {
  createDeviceSchema,
  deviceIdParamSchema,
  listDevicesQuerySchema,
  updateDeviceSchema,
  verifyDeviceQuerySchema,
} from "./devices.schema";

const router: Router = Router();

// Every device route requires authentication.
router.use(authGuard);

// validate() runs the schema BEFORE the controller, so handlers receive
// a strongly-typed, defaulted, key-stripped value via `req.validated`.
//
// Errors thrown anywhere in the chain (Zod, Prisma, AppError, domain
// errors) bubble up to the GLOBAL error handler mounted in `createApp()`.
// No module-local errorHandler is mounted here — there's exactly one
// place that formats error responses.
router.post("/", validate({ body: createDeviceSchema }), asyncHandler(devicesController.create));

router.get("/", validate({ query: listDevicesQuerySchema }), asyncHandler(devicesController.list));

router.get(
  "/verify",
  validate({ query: verifyDeviceQuerySchema }),
  asyncHandler(devicesController.verify),
);

router.patch(
  "/:id",
  validate({ params: deviceIdParamSchema, body: updateDeviceSchema }),
  asyncHandler(devicesController.update),
);

router.delete(
  "/:id",
  validate({ params: deviceIdParamSchema }),
  asyncHandler(devicesController.remove),
);

export { router as devicesRouter };
