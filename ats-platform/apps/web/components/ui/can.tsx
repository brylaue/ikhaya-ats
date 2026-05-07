"use client";

/**
 * <Can> — declarative RBAC guard component.
 *
 * Renders `children` only when the current user has the required permission(s).
 * Renders `fallback` (default: null) otherwise.
 *
 * Usage:
 *   <Can permission="team:manage">
 *     <InviteButton />
 *   </Can>
 *
 *   <Can permission="settings:billing" fallback={<p>Owner only</p>}>
 *     <BillingSection />
 *   </Can>
 *
 *   // Any of several permissions
 *   <Can anyOf={["jobs:create","jobs:edit"]}>
 *     <SaveJobButton />
 *   </Can>
 */

import { type ReactNode } from "react";
import { usePermissions } from "@/lib/supabase/hooks";
import type { Permission } from "@/lib/permissions";

interface CanProps {
  /** The single permission required */
  permission?: Permission;
  /** Require ALL of these permissions */
  allOf?: Permission[];
  /** Require ANY of these permissions */
  anyOf?: Permission[];
  /** Rendered when the check fails (default: null) */
  fallback?: ReactNode;
  children: ReactNode;
}

export function Can({ permission, allOf, anyOf, fallback = null, children }: CanProps) {
  const { can, canAll, canAny, loading } = usePermissions();

  // While loading we render nothing (avoids flash of hidden content)
  if (loading) return null;

  let allowed = false;
  if (permission)        allowed = can(permission);
  else if (allOf?.length) allowed = canAll(...allOf);
  else if (anyOf?.length) allowed = canAny(...anyOf);
  else                   allowed = true; // no restriction specified

  return allowed ? <>{children}</> : <>{fallback}</>;
}

/**
 * Higher-order helper: returns a boolean indicating whether the current user
 * can perform the action. Useful for disabling buttons rather than hiding them.
 *
 * Usage:
 *   const { can } = usePermissions();
 *   <button disabled={!can("candidates:delete")}>Delete</button>
 *
 * (Re-export for convenience — callers can import both from this file.)
 */
export { usePermissions } from "@/lib/supabase/hooks";
export type { Permission } from "@/lib/permissions";
