/**
 * POST /api/pipeline/move
 * US-480: Move a single candidate to a new pipeline stage and dispatch
 *         the candidate.stage_changed webhook to all registered endpoints.
 *
 * Body: { candidateId, jobId, stageId }
 * Response: { ok: true }
 *
 * Called from the kanban board drag-and-drop and stage selector in the
 * candidate detail panel. Wraps the Supabase upsert so webhook delivery
 * happens server-side without leaking service-role credentials to the client.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@/lib/supabase/server";
import { createClient as svc }       from "@supabase/supabase-js";
import { getAgencyContext }          from "@/lib/supabase/agency-cache";
import { checkCsrf }                 from "@/lib/csrf";
import { dispatchWebhook }           from "@/lib/webhooks/deliver";

const serviceDb = () =>
  svc(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

export async function POST(req: NextRequest) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const ctx      = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as {
    candidateId?: string;
    jobId?:       string;
    stageId?:     string;
  };

  const { candidateId, jobId, stageId } = body;
  if (!candidateId || !jobId || !stageId) {
    return NextResponse.json({ error: "candidateId, jobId, and stageId are required" }, { status: 400 });
  }

  // Verify job belongs to agency
  const { data: job } = await supabase
    .from("jobs")
    .select("id, title")
    .eq("id", jobId)
    .eq("agency_id", ctx.agencyId)
    .single();
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  // Verify candidate belongs to agency
  const { data: candidate } = await supabase
    .from("candidates")
    .select("id, first_name, last_name, email")
    .eq("id", candidateId)
    .eq("agency_id", ctx.agencyId)
    .single();
  if (!candidate) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });

  // Resolve stage name for payload
  const { data: stage } = await supabase
    .from("pipeline_stages")
    .select("name, stage_order")
    .eq("id", stageId)
    .single();

  // Upsert the pipeline entry
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("candidate_pipeline_entries")
    .upsert(
      {
        agency_id:        ctx.agencyId,
        job_id:           jobId,
        candidate_id:     candidateId,
        stage_id:         stageId,
        status:           "active",
        entered_stage_at: now,
      },
      { onConflict: "job_id,candidate_id", ignoreDuplicates: false }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // US-480: Dispatch webhook (fire-and-forget, never fail the response)
  const db = serviceDb();
  dispatchWebhook(db, ctx.agencyId, "candidate.stage_changed", {
    candidateId,
    candidateName:  `${(candidate as Record<string, unknown>).first_name ?? ""} ${(candidate as Record<string, unknown>).last_name ?? ""}`.trim(),
    candidateEmail: (candidate as Record<string, unknown>).email ?? null,
    jobId,
    jobTitle:  (job as Record<string, unknown>).title ?? null,
    stageId,
    stageName:  stage?.name ?? null,
    stageOrder: stage?.stage_order ?? null,
    movedAt:    now,
    movedBy:    ctx.userId,
  }).catch(() => {/* ignore */});

  return NextResponse.json({ ok: true });
}
