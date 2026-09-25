import { createMiddleware } from "hono/factory";

// Bindings every service must provide.
export interface BaseBindings {
  API_BEARER_TOKEN: string;
}

// Hash both sides first so the comparison is constant-time and length-independent.
async function tokenMatches(header: string | undefined, expected: string): Promise<boolean> {
  const match = /^Bearer (.+)$/.exec(header ?? "");
  if (!match || !expected) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(match[1])),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

// Server-to-server auth with one shared secret per service. Browser clients and
// per-consumer API keys will need their own middleware (see README).
export function bearerAuth<B extends BaseBindings>() {
  return createMiddleware<{ Bindings: B }>(async (c, next) => {
    if (!(await tokenMatches(c.req.header("authorization"), c.env.API_BEARER_TOKEN))) {
      c.header("www-authenticate", "Bearer");
      return c.json({ error: "unauthorized" }, 401);
    }
    await next();
  });
}
