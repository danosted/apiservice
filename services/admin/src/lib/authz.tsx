import type { Permission } from "@apiservice/core/authz";
import { useRouteContext } from "@tanstack/react-router";
import type { ReactNode } from "react";

export type { Permission };

// Permission checks for the UI, based on the permissions the server computed in
// /api/me. Components ask "does the user have permission X?", never "is the user
// role Y?", so roles can change without touching UI code. The server enforces the
// same permissions (requirePermission() in worker/http/middleware.ts); these only
// decide what to show.

/** True when the signed-in user has the permission. */
export function useHasPermission(permission: Permission): boolean {
  const { user } = useRouteContext({ from: "__root__" });
  return user?.permissions.includes(permission) ?? false;
}

/** Renders children only with the permission, otherwise the fallback. */
export function RequirePermission({
  permission,
  children,
  fallback = null,
}: {
  permission: Permission;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return useHasPermission(permission) ? children : fallback;
}
