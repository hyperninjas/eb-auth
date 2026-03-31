import type { Session } from "../auth.js";

declare global {
  namespace Express {
    interface Request {
      session?: Session["session"];
      user?: Session["user"];
    }
  }
}
