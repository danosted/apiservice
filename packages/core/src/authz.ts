// Authorization policy: the only place that knows what each role may do.
// Code everywhere else checks permissions, never roles, so adding or changing a
// role is an edit to ROLE_PERMISSIONS alone.
//
// No runtime-specific imports: the admin UI imports the types from
// "@apiservice/core/authz" as well.

export const ROLES = ["viewer", "editor"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "game:read", // players, items, stats
  "inventory:adjust", // grant and remove items
  "audit:read", // the audit log
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  viewer: ["game:read", "audit:read"],
  editor: ["game:read", "audit:read", "inventory:adjust"],
};

/** Union of the permissions granted by every role the user holds. */
export function permissionsFor(roles: readonly Role[]): Set<Permission> {
  return new Set(roles.flatMap((r) => ROLE_PERMISSIONS[r] ?? []));
}
