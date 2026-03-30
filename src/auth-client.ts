import { createAuthClient } from "better-auth/client";
import {
  adminClient,
  organizationClient,
  twoFactorClient,
} from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: process.env["BETTER_AUTH_URL"] ?? "http://localhost:3000",
  plugins: [adminClient(), organizationClient(), twoFactorClient()],
});

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  getSession,
  twoFactor,
  organization,
  admin,
} = authClient;
