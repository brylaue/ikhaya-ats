/**
 * GET /api/admin/impersonate/session?id=<sessionId>
 * US-403: Returns display info for an active impersonation session.
 * Used by the banner component.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@/lib/supabase/server";
import { createClient as svc }       from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const db = svc(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  const { data: session } = await db
    .from("impersonation_sessions")
    .select(`
      id, started_at, ended_at,
      impersonator:impersonator_id ( full_name, email ),
      target:target_user_id ( full_name, email )
    `)
    .eq("id", id)
    .is("ended_at", null)
    .single();

  if (!session) {
    return NextResponse.json({ error: "Session not found or ended" }, { status: 404 });
  }

  // Only impersonator or target can view
  if (user.id !== (session as any).impersonator?.id && user.id !== (session as any).target?.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const imp = (session as any).impersonator;
  const tgt = (session as any).target;

  return NextResponse.json({
    targetName:       tgt?.full_name ?? tgt?.email ?? "Unknown",
    targetEmail:      tgt?.email ?? "",
    impersonatorName: imp?.full_name ?? imp?.email ?? "Unknown",
    startedAt:        session.started_at,
  });
}
