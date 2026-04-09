import pino, { type Logger } from "pino";
import { env, isProduction } from "../config/env";
import { getRequestContext } from "./request-context";

/**
 * Root pino logger.
 *
 * Production: writes JSON to stdout via pino's async worker transport so
 * logging doesn't block the event loop. At high RPS, sync stdout writes
 * are a measurable tail-latency contributor — async transports run on a
 * worker thread and the main thread just hands off buffers.
 *
 * Development: pretty-printed colorized output via pino-pretty.
 *
 * In both modes, sensitive headers/fields are redacted before serialization.
 *
 * Use `getLogger()` instead of importing `logger` directly when you want
 * request-id correlation — that returns a child logger bound to the active
 * request via AsyncLocalStorage.
 */
export const logger: Logger = pino({
  level: env.LOG_LEVEL ?? (isProduction ? "info" : "debug"),
  base: { service: "eb-auth", env: env.NODE_ENV },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "*.password",
      "*.token",
      "*.secret",
      "*.accessToken",
      "*.refreshToken",
    ],
    remove: true,
  },
  ...(isProduction
    ? {
        // Async worker transport — non-blocking logging in prod.
        // Writes JSON lines to stdout (fd 1) for the container runtime
        // to forward to the log aggregator.
        transport: {
          target: "pino/file",
          options: { destination: 1 },
        },
      }
    : {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss.l",
            ignore: "pid,hostname,service,env",
            singleLine: false,
          },
        },
      }),
});

/**
 * Returns a logger bound to the current request context (request id +
 * user id if set). Falls back to the root logger outside of a request.
 *
 * Use this in any code path that runs inside an HTTP request — services,
 * repositories, hooks, scheduled jobs that copy a context — to get
 * automatic request correlation in every log line.
 */
export function getLogger(): Logger {
  const ctx = getRequestContext();
  if (!ctx) return logger;
  return logger.child({
    reqId: ctx.requestId,
    ...(ctx.userId ? { userId: ctx.userId } : {}),
  });
}
