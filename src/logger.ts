import pino from "pino";
import { pinoHttp, type Options } from "pino-http";
import { isProduction } from "./env.js";

export const logger = pino({
  level: isProduction ? "info" : "debug",
  ...(!isProduction && {
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "HH:MM:ss.l",
        ignore: "pid,hostname",
        singleLine: false,
      },
    },
  }),
});

const httpLoggerOptions: Options = {
  logger,
  autoLogging: {
    ignore: (req) => req.url === "/health",
  },
  customSuccessMessage: (req, res) =>
    `${req.method} ${req.url} → ${res.statusCode}`,
  customErrorMessage: (req, res) =>
    `${req.method} ${req.url} → ${res.statusCode}`,
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      remoteAddress: req.remoteAddress,
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
};

export const httpLogger = pinoHttp(httpLoggerOptions);
