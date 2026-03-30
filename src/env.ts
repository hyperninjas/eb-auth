import "dotenv/config";

function requireEnv(key: string): string {
  const value = process.env[key];
  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const env = {
  NODE_ENV: (process.env["NODE_ENV"] ?? "development") as
    | "development"
    | "production",
  PORT: parseInt(process.env["PORT"] ?? "3000", 10),
  CORS_ORIGIN: requireEnv("CORS_ORIGIN"),
  BETTER_AUTH_SECRET: requireEnv("BETTER_AUTH_SECRET"),
  BETTER_AUTH_URL: process.env["BETTER_AUTH_URL"] ?? "http://localhost:3000",
  DATABASE_URL: requireEnv("DATABASE_URL"),
  GOOGLE_CLIENT_ID: requireEnv("GOOGLE_CLIENT_ID"),
  GOOGLE_CLIENT_SECRET: requireEnv("GOOGLE_CLIENT_SECRET"),
} as const;

export const isProduction = env.NODE_ENV === "production";
