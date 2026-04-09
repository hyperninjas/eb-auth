import { pinoHttp, type Options } from "pino-http";
import { logger } from "../infra/logger";
import { getRequestId } from "../infra/request-context";

// Minimal shapes for what we read off pino-http's request/response objects.
// Pino-http augments node's IncomingMessage/ServerResponse, but its public
// serializer signatures are loose, so we narrow locally.
interface PinoLogReq {
  method?: string;
  url?: string;
  remoteAddress?: string;
}
interface PinoLogRes {
  statusCode: number;
}

const options: Options = {
  logger,
  // Reuse the request id assigned by the requestContext middleware.
  genReqId: (req, res) => {
    const id = getRequestId() ?? (req.headers["x-request-id"] as string | undefined);
    if (id) res.setHeader("x-request-id", id);
    return id ?? "unknown";
  },
  customProps: () => {
    const id = getRequestId();
    return id ? { reqId: id } : {};
  },
  autoLogging: {
    ignore: (req) => req.url === "/livez" || req.url === "/readyz",
  },
  customSuccessMessage: (req, res) => `${req.method ?? ""} ${req.url ?? ""} → ${res.statusCode}`,
  customErrorMessage: (req, res) => `${req.method ?? ""} ${req.url ?? ""} → ${res.statusCode}`,
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  serializers: {
    req: (req: PinoLogReq) => ({
      method: req.method,
      url: req.url,
      remoteAddress: req.remoteAddress,
    }),
    res: (res: PinoLogRes) => ({ statusCode: res.statusCode }),
  },
};

export const httpLogger = pinoHttp(options);
