import { betterAuth } from "better-auth";
import { logger } from "./logger.js";
import {
  admin,
  bearer,
  jwt,
  openAPI,
  organization,
  twoFactor,
} from "better-auth/plugins";
import { pool } from "./db.js";
import { env, isProduction } from "./env.js";

export const auth = betterAuth({
  // ── Core ──────────────────────────────────────────────────────────────
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: [env.CORS_ORIGIN],

  // ── Database ──────────────────────────────────────────────────────────
  database: pool,

  // ── Email & Password ──────────────────────────────────────────────────
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    autoSignIn: true,
    sendResetPassword: async ({ user, url }) => {
      // TODO: integrate a real email provider (Resend, SES, etc.)
      logger.info(`[AUTH] Password reset for ${user.email}: ${url}`);
    },
  },

  // ── Email Verification ────────────────────────────────────────────────
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      // TODO: integrate a real email provider
      logger.info(`[AUTH] Verify email for ${user.email}: ${url}`);
    },
  },

  // ── Social / OAuth Providers ──────────────────────────────────────────
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
  },

  // ── Account Linking ───────────────────────────────────────────────────
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["google"],
    },
  },

  // ── Session ───────────────────────────────────────────────────────────
  session: {
    expiresIn: 60 * 60 * 24 * 7,    // 7 days
    updateAge: 60 * 60 * 24,         // refresh every 24 h
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,                // 5 min cache
    },
  },

  // ── Rate Limiting (Better Auth internal) ──────────────────────────────
  rateLimit: {
    enabled: true,
    window: 10,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 3 },
      "/forgot-password": { window: 60, max: 3 },
    },
  },

  // ── Advanced / Security ───────────────────────────────────────────────
  advanced: {
    useSecureCookies: isProduction,
    ipAddress: {
      ipAddressHeaders: ["x-forwarded-for", "x-real-ip"],
    },
  },

  // ── Plugins ───────────────────────────────────────────────────────────
  plugins: [
    // User management (admin panel, list/ban/unban/delete users)
    admin(),

    // OpenAPI spec at /api/auth/reference
    openAPI(),

    // Bearer token auth for mobile / API clients
    bearer(),

    // JWT token auth
    jwt({
      jwt: {
        expirationTime: "7d",
        definePayload: ({ user }) => ({
          id: user.id,
          email: user.email,
          name: user.name,
          role: (user as Record<string, unknown>).role ?? "user",
        }),
      },
    }),

    // Two-factor authentication (TOTP)
    twoFactor({
      issuer: "eb-auth",
    }),

    // Organizations / teams with RBAC
    organization(),
  ],

  // ── Audit Hooks ───────────────────────────────────────────────────────
  databaseHooks: {
    session: {
      create: {
        after: async (session) => {
          logger.info(`[AUDIT] Session created for user ${session.userId}`);
        },
      },
    },
    user: {
      update: {
        after: async (user) => {
          logger.info(`[AUDIT] User updated: ${user.id} (${user.email})`);
        },
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
