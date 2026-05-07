/**
 * POST /api/admin/impersonate/end
 * US-403: End an impersonation session (callable by either party).
 *
 * Body: { sessionId: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@/lib/supabase/server";
import { createClient as svc }       from "@supabase/supabase-js";
import { checkCsrf }                 from "@/lib/csrf";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  // US-326: same-origin only
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sessionId } = await req.json().catch(() => ({}));
  if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });

  const db = svc(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  // Only the impersonator or the target can end the session
  const { data: session } = await db
    .from("impersonation_sessions")
    .select("id, impersonator_id, target_user_id")
    .eq("id", sessionId)
    .is("ended_at", null)
    .single();

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (user.id !== session.impersonator_id && user.id !== session.target_user_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await db.from("impersonation_sessions").update({
    ended_at: new Date().toISOString(),
  }).eq("id", sessionId);

  await db.from("audit_events").insert({
    actor_id:  user.id,
    action:    "impersonation.ended",
    resource:  `session:${sessionId}`,
    metadata:  { session_id: sessionId, ended_by: user.id },
  }).maybeSingle();

  return NextResponse.json({ ok: true });
}
