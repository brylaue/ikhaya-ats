/**
 * lib/permissions.ts
 *
 * Single source of truth for role-based permissions.
 *
 * Roles (lowest → highest privilege):
 *   researcher → recruiter → senior_recruiter → admin → owner
 *
 * Usage in components:
 *   const { can } = usePermissions();
 *   if (can("team:manage")) { ... }
 *
 * Usage in server/middleware:
 *   import { hasPermission } from "@/lib/permissions";
 *   if (!hasPermission(userRole, "billing:view")) redirect("/");
 */

export type UserRole =
  | "owner"
  | "admin"
  | "senior_recruiter"
  | "recruiter"
  | "researcher";

export type Permission =
  // Candidate permissions
  | "candidates:view"
  | "candidates:create"
  | "candidates:edit"
  | "candidates:delete"
  // Job permissions
  | "jobs:view"
  | "jobs:create"
  | "jobs:edit"
  | "jobs:delete"
  // Portal / client submissions
  | "portal:submit"
  | "portal:view_all"
  // Analytics
  | "analytics:view"
  // Team management
  | "team:view"
  | "team:manage"          // invite, remove, change roles
  // Settings
  | "settings:org"         // org name, logo, domain
  | "settings:pipeline"    // pipeline stage config
  | "settings:tags"        // tag taxonomy
  | "settings:notifications"
  | "settings:integrations"
  | "settings:data"        // export + privacy
  | "settings:billing"     // owner only
  | "settings:audit"       // audit trail
  // Custom fields (US-090)
  | "custom_fields:manage"
  // Workflow automation (US-032)
  | "workflows:manage";

// ─── Permission matrix ────────────────────────────────────────────────────────
// true  = role has this permission
// false / missing = denied

const PERMISSIONS: Record<Permission, UserRole[]> = {
  // All roles can view + create + edit candidates
  "candidates:view":   ["researcher","recruiter","senior_recruiter","admin","owner"],
  "candidates:create": ["researcher","recruiter","senior_recruiter","admin","owner"],
  "candidates:edit":   ["researcher","recruiter","senior_recruiter","admin","owner"],
  "candidates:delete": ["admin","owner"],

  // Jobs — researchers can view but not create/edit/delete
  "jobs:view":   ["researcher","recruiter","senior_recruiter","admin","owner"],
  "jobs:create": ["recruiter","senior_recruiter","admin","owner"],
  "jobs:edit":   ["recruiter","senior_recruiter","admin","owner"],
  "jobs:delete": ["admin","owner"],

  // Portal submissions — researchers cannot submit to clients
  "portal:submit":   ["recruiter","senior_recruiter","admin","owner"],
  "portal:view_all": ["senior_recruiter","admin","owner"],

  // Analytics — researchers and plain recruiters cannot
  "analytics:view": ["senior_recruiter","admin","owner"],

  // Team
  "team:view":   ["recruiter","senior_recruiter","admin","owner"],
  "team:manage": ["admin","owner"],

  // Settings sections
  "settings:org":           ["admin","owner"],
  "settings:pipeline":      ["admin","owner"],
  "settings:tags":          ["senior_recruiter","admin","owner"],
  "settings:notifications": ["researcher","recruiter","senior_recruiter","admin","owner"],
  "settings:integrations":  ["admin","owner"],
  "settings:data":          ["admin","owner"],
  "settings:billing":       ["owner"],
  "settings:audit":         ["admin","owner"],

  // Advanced features
  "custom_fields:manage": ["admin","owner"],
  "workflows:manage":     ["admin","owner"],
};

// ─── Core check function (usable anywhere, including server code) ─────────────

export function hasPermission(role: UserRole | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return PERMISSIONS[permission]?.includes(role) ?? false;
}

/**
 * Returns every permission the given role has.
 * Useful for debugging / displaying a role's capabilities.
 */
export function permissionsForRole(role: UserRole): Permission[] {
  return (Object.keys(PERMISSIONS) as Permission[]).filter(
    (p) => PERMISSIONS[p].includes(role)
  );
}

/**
 * Minimum role required for a given permission.
 * Returns the role with the fewest privileges that still has the permission.
 */
const ROLE_ORDER: UserRole[] = [
  "researcher","recruiter","senior_recruiter","admin","owner",
];

export function minimumRoleFor(permission: Permission): UserRole | null {
  for (const role of ROLE_ORDER) {
    if (PERMISSIONS[permission]?.includes(role)) return role;
  }
  return null;
}
