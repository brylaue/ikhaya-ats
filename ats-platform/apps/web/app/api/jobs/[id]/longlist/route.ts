/**
 * /api/jobs/[id]/longlist
 * US-122: Candidate Longlist / Shortlist per Req.
 *
 * Private to the agency — does not surface on the client portal until a
 * candidate is "promoted" to a real submittal (which creates an application).
 *
 * GET    — list longlist entries for the job (enriched with candidate basics)
 * POST   — add one or more candidates: { candidate_ids: string[], notes? }
 * DELETE — remove one: ?candidate_id=UUID
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAgencyContext } from "@/lib/supabase/agency-cache";
import { checkCsrf } from "@/lib/csrf";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const ctx = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("job_longlist")
    .select(`
      id, rank, notes, promoted, promoted_at, created_at,
      candidate:candidates(id, first_name, last_name, email, phone, contact_status)
    `)
    .eq("job_id", id)
    .order("promoted", { ascending: true })  // non-promoted first so the working set is at top
    .order("rank",     { ascending: true })
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entries: data ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfError = checkCsrf(req); if (csrfError) return csrfError;
  const { id: jobId } = await params;
  const supabase = await createClient();
  const ctx = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const b = await req.json().catch(() => ({})) as { candidate_ids?: unknown; notes?: unknown };
  const ids = Array.isArray(b.candidate_ids)
    ? b.candidate_ids.filter((x): x is string => typeof x === "string")
    : [];
  if (ids.length === 0) return NextResponse.json({ error: "candidate_ids required" }, { status: 400 });
  if (ids.length > 200) return NextResponse.json({ error: "Max 200 candidates at once" }, { status: 400 });

  const notes = typeof b.notes === "string" ? b.notes.slice(0, 1000) : null;
  const rows = ids.map((cid) => ({
    agency_id:    ctx.agencyId,
    job_id:       jobId,
    candidate_id: cid,
    notes,
    added_by:     ctx.userId,
  }));

  // UNIQUE(job_id, candidate_id) makes the upsert idempotent — callers can
  // "add to longlist" without worrying about duplicates.
  const { data, error } = await supabase
    .from("job_longlist")
    .upsert(rows, { onConflict: "job_id,candidate_id", ignoreDuplicates: true })
    .select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ added: data?.length ?? 0, entries: data ?? [] });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfError = checkCsrf(req); if (csrfError) return csrfError;
  const { id: jobId } = await params;
  const supabase = await createClient();
  const ctx = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const candidateId = req.nextUrl.searchParams.get("candidate_id");
  if (!candidateId) return NextResponse.json({ error: "candidate_id query param required" }, { status: 400 });

  const { error } = await supabase
    .from("job_longlist")
    .delete()
    .eq("job_id", jobId)
    .eq("candidate_id", candidateId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
