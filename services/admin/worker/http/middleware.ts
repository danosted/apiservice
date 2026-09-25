import {
  FakeIdentityProvider,
  HttpError,
  type IdentityProvider,
  type Permission,
  permissionsFor,
} from "@apiservice/core";
import { createMiddleware } from "hono/factory";
import type { ApiEnv } from "./env";

/** Resolves the caller and their permissions through the injected IdentityProvider; 401 when unknown. */
export function authenticate(identity: IdentityProvider) {
  return createMiddleware<ApiEnv>(async (c, next) => {
    const user = await identity.identify(c.req.raw);
    if (!user) {
      // The fake provider tells the UI which dev users it can sign in as.
      const devLogin = identity instanceof FakeIdentityProvider ? identity.userKeys() : undefined;
      return c.json({ error: "unauthorized", devLogin }, 401);
    }
    c.set("user", { ...user, permissions: permissionsFor(user.roles) });
    await next();
  });
}

/** Browsers always send Origin on cross-site writes; reject any that isn't us. */
export function rejectCrossOrigin() {
  return createMiddleware<ApiEnv>(async (c, next) => {
    if (c.req.method !== "GET" && c.req.method !== "HEAD") {
      const origin = c.req.header("origin");
      if (origin && origin !== new URL(c.req.url).origin) throw new HttpError(403, "cross-origin request rejected");
    }
    await next();
  });
}

/**
 * Per-route authorization by permission, never by role:
 * `players.post("/:id/inventory", requirePermission("inventory:adjust"), ...)`.
 * Which roles grant a permission is defined only in core's authz.ts.
 */
export function requirePermission(permission: Permission) {
  return createMiddleware<ApiEnv>(async (c, next) => {
    if (!c.get("user").permissions.has(permission)) throw new HttpError(403, `missing permission ${permission}`);
    await next();
  });
}
