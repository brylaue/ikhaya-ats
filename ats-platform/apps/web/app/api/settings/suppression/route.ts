/**
 * GET    /api/settings/suppression         — list agency's suppressions + bounces
 * POST   /api/settings/suppression         — manually add (manual / admin_ui)
 * DELETE /api/settings/suppression?id=…    — remove (owner/admin only; RLS enforces)
 *
 * US-473 / US-482: Recruiter visibility + manual controls over the suppression list.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@/lib/supabase/server";
import { getAgencyContext }          from "@/lib/supabase/agency-cache";
import { checkCsrf }                 from "@/lib/csrf";

export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const ctx      = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [suppressions, bounces] = await Promise.all([
    supabase
      .from("email_suppression_list")
      .select("id, email, reason, source, note, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("email_bounces")
      .select("id, recipient_email, bounce_type, diagnostic_code, smtp_status, reported_at")
      .order("reported_at", { ascending: false })
      .limit(100),
  ]);

  return NextResponse.json({
    suppressions: suppressions.data ?? [],
    bounces:      bounces.data ?? [],
  });
}

export async function POST(req: NextRequest) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const ctx      = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const note  = typeof body.note === "string"  ? body.note.trim().slice(0, 280)  : null;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  // Insert via user-scoped client so RLS enforces agency scope.
  const { error } = await supabase.from("email_suppression_list").upsert(
    {
      agency_id: ctx.agencyId,
      email,
      reason:    "manual",
      source:    "admin_ui",
      note,
    },
    { onConflict: "agency_id,email", ignoreDuplicates: true }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const ctx      = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  // DELETE RLS already restricts to owner/admin.
  const { error } = await supabase
    .from("email_suppression_list")
    .delete()
    .eq("id", id)
    .eq("agency_id", ctx.agencyId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
