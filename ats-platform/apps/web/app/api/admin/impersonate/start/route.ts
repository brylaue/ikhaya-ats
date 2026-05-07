/**
 * POST /api/admin/impersonate/start
 * US-403: Owner initiates an impersonation session.
 *
 * Only agency owners can call this. Creates an impersonation_sessions record
 * and sends a consent email to the target user with a one-time consent token.
 *
 * Body: { targetUserId: string; reason?: string }
 * Returns: { sessionId: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@/lib/supabase/server";
import { createClient as svc }       from "@supabase/supabase-js";
import { getAgencyContext }          from "@/lib/supabase/agency-cache";
import { checkCsrf }                 from "@/lib/csrf";
import crypto                        from "crypto";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  // US-326: impersonation must be same-origin
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Must be agency owner
  const ctx = await getAgencyContext(supabase, user.id);
  if (!ctx || ctx.role !== "owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { targetUserId, reason } = await req.json().catch(() => ({}));
  if (!targetUserId) {
    return NextResponse.json({ error: "targetUserId required" }, { status: 400 });
  }

  const db = svc(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  // Verify target user belongs to same agency
  const { data: targetUser } = await db
    .from("users")
    .select("id, full_name, email")
    .eq("id", targetUserId)
    .eq("agency_id", ctx.agencyId)
    .single();

  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Cannot impersonate yourself
  if (targetUserId === user.id) {
    return NextResponse.json({ error: "Cannot impersonate yourself" }, { status: 400 });
  }

  const consentToken    = crypto.randomBytes(32).toString("hex");
  const consentTokenExp = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min

  const { data: session, error } = await db
    .from("impersonation_sessions")
    .insert({
      impersonator_id:  user.id,
      target_user_id:   targetUserId,
      agency_id:        ctx.agencyId,
      reason:           reason ?? null,
      consent_token:    consentToken,
      consent_token_exp: consentTokenExp,
    })
    .select("id")
    .single();

  if (error || !session) {
    return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
  }

  // Audit log
  await db.from("audit_events").insert({
    actor_id:  user.id,
    action:    "impersonation.requested",
    resource:  `user:${targetUserId}`,
    metadata:  { session_id: session.id, target_email: targetUser.email, reason },
  }).maybeSingle();

  // TODO: send consent email to targetUser.email with consentToken link
  // For now: log to console in dev
  const consentUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/admin/impersonate/consent?token=${consentToken}`;
  console.info("[impersonation] consent URL:", consentUrl);

  return NextResponse.json({ sessionId: session.id });
}
