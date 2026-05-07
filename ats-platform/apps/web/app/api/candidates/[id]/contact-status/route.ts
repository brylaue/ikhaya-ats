/**
 * POST /api/candidates/[id]/contact-status
 * US-017: Set/update a candidate's contact status ("Do Not Contact", "Ghosted",
 * "Placed Elsewhere", "Paused"). Any outreach endpoint checks this first so
 * recruiters don't re-outreach someone who asked to be left alone.
 *
 * Body: { status: 'ok'|'do_not_contact'|'ghosted'|'placed_elsewhere'|'paused',
 *         reason?: string, next_permissible_contact_at?: 'YYYY-MM-DD' }
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAgencyContext } from "@/lib/supabase/agency-cache";
import { checkCsrf } from "@/lib/csrf";

const VALID = ["ok","do_not_contact","ghosted","placed_elsewhere","paused"] as const;
type Status = typeof VALID[number];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfError = checkCsrf(req); if (csrfError) return csrfError;
  const { id } = await params;
  const supabase = await createClient();
  const ctx = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as {
    status?: unknown; reason?: unknown; next_permissible_contact_at?: unknown;
  };
  if (typeof body.status !== "string" || !(VALID as readonly string[]).includes(body.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  const status = body.status as Status;
  const reason = typeof body.reason === "string" ? body.reason.slice(0, 2000) : null;
  const next_permissible = typeof body.next_permissible_contact_at === "string"
    && /^\d{4}-\d{2}-\d{2}$/.test(body.next_permissible_contact_at)
      ? body.next_permissible_contact_at
      : null;

  const { data, error } = await supabase
    .from("candidates")
    .update({
      contact_status: status,
      contact_reason: reason,
      contact_status_set_by: ctx.userId,
      contact_status_set_at: new Date().toISOString(),
      next_permissible_contact_at: next_permissible,
    })
    .eq("id", id)
    .select("id, contact_status, contact_reason, next_permissible_contact_at")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: "Not found" },   { status: 404 });
  return NextResponse.json({ ok: true, candidate: data });
}

/**
 * GET /api/candidates/[id]/contact-status — used by outreach screens to check
 * before composing an email / SMS. Returns a "blocked" flag + "warn" flag with
 * a human-readable message.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const ctx = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("candidates")
    .select("id, contact_status, contact_reason, next_permissible_contact_at, contact_status_set_at")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: "Not found" },   { status: 404 });

  const today = new Date().toISOString().slice(0, 10);
  const futureOk = data.next_permissible_contact_at && data.next_permissible_contact_at > today;
  // 'do_not_contact' is hard-block, everything else (including 'paused' past its date) is a warn.
  const blocked = data.contact_status === "do_not_contact";
  const warn    = !blocked && data.contact_status !== "ok" && !(!futureOk);

  return NextResponse.json({
    status: data.contact_status,
    reason: data.contact_reason,
    next_permissible_contact_at: data.next_permissible_contact_at,
    blocked,
    warn,
    message:
      data.contact_status === "do_not_contact" ? "This candidate asked not to be contacted." :
      data.contact_status === "ghosted"        ? "Candidate went silent — proceed with care." :
      data.contact_status === "placed_elsewhere" ? "Candidate was placed elsewhere." :
      data.contact_status === "paused"         ? `Candidate asked to pause${futureOk ? ` until ${data.next_permissible_contact_at}` : ""}.` :
      null,
  });
}
