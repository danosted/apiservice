import type { Deps } from "../deps";
import { apiRouter } from "../http/env";

/**
 * /api/me
 *   GET /    the signed-in user, their roles and effective permissions, and where to sign out.
 *            The UI decides what to show from `permissions`, so it never needs the role mapping.
 */
export function meRoutes({ identity }: Pick<Deps, "identity">) {
  return apiRouter().get("/", (c) => {
    const { permissions, ...user } = c.get("user");
    return c.json({ ...user, permissions: [...permissions].sort(), signOutUrl: identity.signOutUrl });
  });
}
