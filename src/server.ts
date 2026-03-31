import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import hpp from "hpp";
import cookieParser from "cookie-parser";
import { toNodeHandler } from "better-auth/node";
import { env, isProduction } from "./env.js";
import { auth } from "./auth.js";
import { logger, httpLogger } from "./logger.js";
import devicesRouter from "./routes/devices.js";
import { runMigrations } from "./db/migrate.js";
import { seedDevices } from "./db/seed.js";
import { pool } from "./db.js";

const app: Express = express();

// ---------------------------------------------------------------------------
// HTTP request logger — first middleware so all requests are logged
// ---------------------------------------------------------------------------
app.use(httpLogger);

// ---------------------------------------------------------------------------
// 1. Security Headers (OWASP A05 – Security Misconfiguration)
//    Relaxed CSP for /api/auth/reference (Scalar API docs needs CDN + inline).
//    Strict CSP for everything else.
// ---------------------------------------------------------------------------
const sharedHelmetOptions = {
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: true,
  crossOriginResourcePolicy: { policy: "same-origin" as const },
  hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" as const },
};

app.use(
  "/api/auth/reference",
  helmet({
    ...sharedHelmetOptions,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" as const },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
        imgSrc: ["'self'", "data:", "https://cdn.jsdelivr.net"],
        connectSrc: ["'self'", "https://cdn.jsdelivr.net", "https://api.scalar.com"],
        fontSrc: ["'self'", "https://cdn.jsdelivr.net", "https://fonts.gstatic.com", "https://fonts.googleapis.com", "https://fonts.scalar.com"],
        workerSrc: ["'self'", "blob:"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
  })
);

const strictHelmet = helmet({
  ...sharedHelmetOptions,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
});

app.use((req: Request, res: Response, next: NextFunction): void => {
  if (req.path === "/api/auth/reference") {
    next();
    return;
  }
  strictHelmet(req, res, next);
});

// ---------------------------------------------------------------------------
// 2. CORS (OWASP A01 – Broken Access Control)
// ---------------------------------------------------------------------------
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    maxAge: 600,
  })
);

// ---------------------------------------------------------------------------
// 3. Rate Limiting (OWASP A04 – Insecure Design / brute-force mitigation)
// ---------------------------------------------------------------------------
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});
app.use(globalLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many authentication attempts, please try again later.",
  },
});

// ---------------------------------------------------------------------------
// 4. Disable x-powered-by (information leakage)
// ---------------------------------------------------------------------------
app.disable("x-powered-by");

// ---------------------------------------------------------------------------
// 5. Trust proxy only in production behind a reverse proxy
// ---------------------------------------------------------------------------
if (isProduction) {
  app.set("trust proxy", 1);
}

// ---------------------------------------------------------------------------
// 6. Auth routes — mounted BEFORE body parsers so Better Auth can read
//    the raw request body itself.
// ---------------------------------------------------------------------------
app.use("/api/auth", authLimiter);
app.all("/api/auth/*splat", toNodeHandler(auth));

// ---------------------------------------------------------------------------
// 7. Body Parsing with size limits (OWASP A08 - Software & Data Integrity)
//    Applied to all non-auth routes below.
// ---------------------------------------------------------------------------
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: false, limit: "10kb" }));

// ---------------------------------------------------------------------------
// 8. HTTP Parameter Pollution protection
// ---------------------------------------------------------------------------
app.use(hpp());

// ---------------------------------------------------------------------------
// 9. Cookie Parser
// ---------------------------------------------------------------------------
app.use(cookieParser());

// ---------------------------------------------------------------------------
// 10. Device management API (authenticated)
// ---------------------------------------------------------------------------
app.use("/api/devices", devicesRouter);

// ---------------------------------------------------------------------------
// 11. Health check (verifies DB connectivity)
// ---------------------------------------------------------------------------
app.get("/health", async (_req: Request, res: Response): Promise<void> => {
  try {
    await pool.query("SELECT 1");
    res.status(200).json({ status: "ok", db: "connected" });
  } catch {
    res.status(503).json({ status: "degraded", db: "disconnected" });
  }
});

// ---------------------------------------------------------------------------
// 11. 404 handler
// ---------------------------------------------------------------------------
app.use((_req: Request, res: Response): void => {
  res.status(404).json({ error: "Not found" });
});

// ---------------------------------------------------------------------------
// 12. Global error handler (OWASP A09 – Security Logging & Monitoring)
// ---------------------------------------------------------------------------
app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction): void => {
  logger.error(err);
  res.status(err.status ?? 500).json({
    error: isProduction ? "Internal server error" : err.message,
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
async function bootstrap(): Promise<void> {
  await runMigrations();
  await seedDevices();

  const server = app.listen(env.PORT, () => {
    logger.info(`Server running on port ${env.PORT} [${env.NODE_ENV}]`);
  });

  // ── Graceful shutdown ──────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received — shutting down gracefully`);
    server.close(() => {
      logger.info("HTTP server closed");
    });
    await pool.end();
    logger.info("Database pool closed");
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

bootstrap().catch((err) => {
  logger.fatal(err, "Bootstrap failed — server not started");
  process.exit(1);
});

export default app;
