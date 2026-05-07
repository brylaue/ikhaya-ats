/**
 * GET /api/admin/impersonate/consent?token=...
 * US-403: Target user clicks consent link from email.
 *
 * Validates the token, records consent, and sets an impersonation cookie
 * so the next request from the owner's browser adopts the target's identity.
 *
 * Redirects to dashboard with `?impersonating=<sessionId>` to show the banner.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as svc }       from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const appUrl      = process.env.NEXT_PUBLIC_APP_URL ?? "";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const db = svc(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  const { data: session } = await db
    .from("impersonation_sessions")
    .select("id, impersonator_id, target_user_id, consented_at, consent_token_exp, ended_at")
    .eq("consent_token", token)
    .single();

  if (!session) {
    return new NextResponse("Invalid or expired consent link.", { status: 400 });
  }

  if (session.consented_at) {
    return new NextResponse("This consent link has already been used.", { status: 400 });
  }

  if (new Date(session.consent_token_exp) < new Date()) {
    return new NextResponse("This consent link has expired. Ask the admin to resend.", { status: 400 });
  }

  if (session.ended_at) {
    return new NextResponse("This impersonation session is no longer valid.", { status: 400 });
  }

  // Record consent
  await db.from("impersonation_sessions").update({
    consented_at: new Date().toISOString(),
    started_at:   new Date().toISOString(),
  }).eq("id", session.id);

  // Audit log
  await db.from("audit_events").insert({
    actor_id:  session.target_user_id,
    action:    "impersonation.consented",
    resource:  `user:${session.impersonator_id}`,
    metadata:  { session_id: session.id },
  }).maybeSingle();

  // Redirect to dashboard with session ID in query string.
  // The impersonation banner reads this from the URL on first load,
  // then stores it in sessionStorage for subsequent navigation.
  const redirect = new URL(`${appUrl}/dashboard`);
  redirect.searchParams.set("impersonating", session.id);

  return NextResponse.redirect(redirect.toString());
}
