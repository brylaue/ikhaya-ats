/**
 * POST /api/auth/extension/validate
 *
 * US-369: Extension session timeout bypass fix.
 *
 * The Chrome extension authenticates with Supabase using a raw JWT, bypassing
 * the middleware that enforces session revocation (idle/absolute timeouts and
 * manual revoke from the Active Sessions UI). A revoked web-app session
 * continues to work in the extension until the JWT itself expires.
 *
 * This endpoint bridges that gap: the extension calls it on every refresh
 * cycle. If the user's session has been revoked (user_sessions.revoked_at IS
 * NOT NULL for all their sessions), the endpoint returns 401 and the extension
 * should clear tokens and prompt re-login.
 *
 * Request:
 *   Authorization: Bearer <access_token>
 *   (no body required)
 *
 * Response 200: { valid: true, userId: string }
 * Response 401: { valid: false, reason: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  // Verify the JWT is still valid with Supabase
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json(
      { valid: false, reason: "invalid_token" },
      { status: 401 }
    );
  }

  // Check if ALL active web-app sessions for this user have been revoked.
  // If so, the user was signed out from the web app (idle timeout, absolute
  // timeout, or manual revoke) and the extension should follow suit.
  const { data: activeSessions } = await supabase
    .from("user_sessions")
    .select("id")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .limit(1);

  const hasActiveSession = (activeSessions?.length ?? 0) > 0;

  if (!hasActiveSession) {
    // All sessions revoked — force extension to clear tokens
    return NextResponse.json(
      { valid: false, reason: "session_revoked" },
      { status: 401 }
    );
  }

  return NextResponse.json({ valid: true, userId: user.id });
}
