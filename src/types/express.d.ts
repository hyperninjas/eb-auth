import type { Session } from "../modules/auth/auth";

declare global {
  namespace Express {
    interface Request {
      session?: Session["session"];
      user?: Session["user"];
      remoteAddress?: string;
    }
  }
}

export {};
