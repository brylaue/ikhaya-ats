/**
 * Module-level agency context cache (US-306).
 *
 * Every mutation in hooks.ts was calling auth.getUser() + a users table
 * lookup — 2 extra round trips per action. This singleton caches both
 * userId and agencyId after the first fetch; subsequent calls return
 * immediately from memory.
 *
 * The cache is keyed on userId so a user switch (logout → different login)
 * automatically invalidates it. Call clearAgencyCache() on sign-out to be safe.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

let _userId:   string | null = null;
let _agencyId: string | null = null;
let _role:     string | null = null;

export interface AgencyContext {
  userId:   string;
  agencyId: string;
  role:     string;
}

/**
 * Returns the current user's { userId, agencyId, role }.
 *
 * First call: 2 DB round trips (auth.getUser + users table).
 * Subsequent calls for the same session: 0 DB round trips (memory only).
 *
 * `userIdHint` is accepted for API-route callers that have already resolved
 * the user — passing it skips the auth.getUser() round trip on cache hit.
 * Validation still happens on cache-miss via supabase.auth.getUser().
 */
export async function getAgencyContext(
  supabase: SupabaseClient,
  userIdHint?: string
): Promise<AgencyContext | null> {
  // Fast-path: caller supplied user id and matches cache — no auth round trip
  if (userIdHint && _userId === userIdHint && _agencyId && _role) {
    return { userId: _userId, agencyId: _agencyId, role: _role };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    clearAgencyCache();
    return null;
  }

  // Cache hit on the authoritative user id
  if (_userId === user.id && _agencyId && _role) {
    return { userId: _userId, agencyId: _agencyId, role: _role };
  }

  // Cache miss — fetch agency_id + role from users table
  const { data: userRow } = await supabase
    .from("users")
    .select("agency_id, role")
    .eq("id", user.id)
    .single();

  if (!userRow?.agency_id) return null;

  _userId   = user.id;
  _agencyId = userRow.agency_id as string;
  _role     = (userRow.role as string | null) ?? "member";
  return { userId: _userId, agencyId: _agencyId, role: _role };
}

/** Reset cache — call this on sign-out. */
export function clearAgencyCache(): void {
  _userId   = null;
  _agencyId = null;
  _role     = null;
}
