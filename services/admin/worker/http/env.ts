import type { Identity, Permission } from "@apiservice/core";
import { Hono } from "hono";

/** The signed-in user plus what they may do, resolved once per request. */
export interface Principal extends Identity {
  permissions: ReadonlySet<Permission>;
}

// Request-scoped values set by middleware (like scoped services in .NET).
export type ApiEnv = { Variables: { user: Principal } };

/** A route group for the authenticated /api area. */
export const apiRouter = () => new Hono<ApiEnv>();
