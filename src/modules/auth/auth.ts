import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { redisStorage } from "@better-auth/redis-storage";
import { admin, bearer, jwt, openAPI, organization, twoFactor } from "better-auth/plugins";
import { prisma } from "../../infra/prisma";
import { redis } from "../../infra/redis";
import { logger } from "../../infra/logger";
import { env, isProduction } from "../../config/env";

export const auth = betterAuth({
  // ── Core ──────────────────────────────────────────────────────────────
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: [env.CORS_ORIGIN],

  // ── Database ──────────────────────────────────────────────────────────
  // Primary store: Postgres via Prisma adapter (users, accounts, etc.).
  database: prismaAdapter(prisma, { provider: "postgresql" }),

  // Secondary store: Redis caches sessions / verification tokens.
  // Big win at scale — `auth.api.getSession()` becomes an O(1) Redis hit
  // instead of a Postgres query on every authenticated request.
  secondaryStorage: redisStorage({
    client: redis,
    keyPrefix: "auth:",
  }),

  // ── Custom User Fields ────────────────────────────────────────────────
  user: {
    additionalFields: {
      isOnboardingDone: {
        type: "boolean",
        defaultValue: false,
        required: false,
        input: true,
      },
      onboardingStatus: {
        type: "string",
        defaultValue: "pending",
        required: false,
        input: true,
      },
      location: { type: "string", required: false, input: true },
      postcode: { type: "string", required: false, input: true },
      homeName: { type: "string", required: false, input: true },
      houseId: { type: "string", required: false, input: true },
      attributes: { type: "json", required: false, input: true },
    },
  },

  // ── Email & Password ──────────────────────────────────────────────────
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    autoSignIn: true,
    sendResetPassword: ({ user, url }) => {
      // TODO: integrate a real email provider (Resend, SES, etc.)
      logger.info(`[AUTH] Password reset for ${user.email}: ${url}`);
      return Promise.resolve();
    },
  },

  // ── Email Verification ────────────────────────────────────────────────
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: ({ user, url }) => {
      logger.info(`[AUTH] Verify email for ${user.email}: ${url}`);
      return Promise.resolve();
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
    accountLinking: { enabled: true, trustedProviders: ["google"] },
  },

  // ── Session ───────────────────────────────────────────────────────────
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh every 24 h
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },

  // ── Rate Limiting (Better Auth internal) ──────────────────────────────
  // Layered with our express-rate-limit limiter — Better Auth's rules are
  // per-action (sign-in vs sign-up) and use its own counter, while ours
  // is a coarse per-IP global. Both run; the stricter wins.
  // With secondaryStorage configured above, Better Auth's counters also
  // live in Redis so they're shared across replicas.
  rateLimit: {
    enabled: true,
    window: 10,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 20 },
      "/sign-up/email": { window: 60, max: 10 },
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
    admin(),
    openAPI(),
    bearer(),
    jwt({
      jwt: {
        expirationTime: "7d",
        definePayload: ({ user }) => ({
          id: user.id,
          email: user.email,
          name: user.name,
          role: (user as Record<string, unknown>)["role"] ?? "user",
          isOnboardingDone: user["isOnboardingDone"] as boolean | undefined,
          onboardingStatus: user["onboardingStatus"] as string | undefined,
        }),
      },
    }),
    twoFactor({ issuer: "eb-auth" }),
    organization(),
  ],

  // ── Audit Hooks ───────────────────────────────────────────────────────
  databaseHooks: {
    session: {
      create: {
        after: (session) => {
          logger.info(`[AUDIT] Session created for user ${session.userId}`);
          return Promise.resolve();
        },
      },
    },
    user: {
      update: {
        after: (user) => {
          logger.info(`[AUDIT] User updated: ${user.id} (${user.email})`);
          return Promise.resolve();
        },
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
