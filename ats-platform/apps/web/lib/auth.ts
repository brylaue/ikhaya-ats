/**
 * Server-side auth helpers — backed by Supabase.
 * Use these in Server Components and Route Handlers.
 * For client components, use lib/supabase/client.ts directly.
 */

import { createClient } from "@/lib/supabase/server";

/**
 * Returns the current authenticated user, or null if not signed in.
 * Validates the session token server-side (safe against forged cookies).
 */
export async function getCurrentUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

/**
 * Asserts that the request is authenticated.
 * Throws if there is no valid session — use in protected route handlers.
 */
export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Unauthorized");
  }
  return { userId: user.id };
}

/**
 * Returns the agency/org ID for the current user.
 * Currently uses the user's Supabase ID as the org scope.
 * Replace with a DB lookup once org tables are wired up.
 */
export async function getAgencyId(): Promise<string> {
  const user = await getCurrentUser();
  return user?.id ?? "unknown";
}
