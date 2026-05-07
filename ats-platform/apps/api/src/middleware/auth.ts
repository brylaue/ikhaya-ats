import { Context } from "hono";
import { dataStore } from "../data/seed";

export interface AuthContext extends Context {
  user?: typeof dataStore.users[number] | null;
}

export async function authMiddleware(c: Context, next: () => Promise<void>) {
  const authHeader = c.req.header("Authorization");
  let user = null;

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    // Simple token-to-user mapping (in production, verify JWT)
    if (token === "demo-token") {
      user = dataStore.users[0];
    }
  }

  (c as AuthContext).user = user;
  await next();
}
