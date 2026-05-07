/**
 * POST /api/compliance/legal-holds/[id]/release
 * US-414: Release a legal hold. Required because holds can be indefinite —
 * the only way to clear them is an explicit human action.
 *
 * Body: { released_reason?: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAgencyContext } from "@/lib/supabase/agency-cache";
import { checkCsrf } from "@/lib/csrf";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfError = checkCsrf(req); if (csrfError) return csrfError;
  const { id } = await params;
  const supabase = await createClient();
  const ctx = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["admin","owner","compliance"].includes(ctx.role)) {
    return NextResponse.json({ error: "Compliance access required" }, { status: 403 });
  }

  const b = await req.json().catch(() => ({})) as { released_reason?: unknown };
  const released_reason = typeof b.released_reason === "string" ? b.released_reason.slice(0, 2000) : null;

  const { data, error } = await supabase
    .from("legal_holds")
    .update({
      released_at:     new Date().toISOString(),
      released_by:     ctx.userId,
      released_reason,
    })
    .eq("id", id)
    .is("released_at", null)  // fail idempotently if already released
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: "Hold not found or already released" }, { status: 404 });
  return NextResponse.json({ ok: true, hold: data });
}
