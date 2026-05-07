/**
 * POST /api/jobs/[id]/rescore
 * US-378: batch-rescore candidates after a job description changes.
 *
 * The caller (typically the jobs settings page) invokes this whenever a
 * change to the JD, must-have skills, or nice-to-have skills is persisted.
 * Rather than recomputing scores synchronously — which would stall the save —
 * we enqueue work on the existing `embedding_jobs` table so the embedding
 * cron picks it up on its next pass.
 *
 * Work enqueued:
 *   1. The job itself gets re-embedded (entity_type='jobs').
 *   2. Every candidate with an existing ai_match_score against this job
 *      gets re-embedded (entity_type='candidates'). We cap the batch at
 *      MAX_BATCH to avoid pathological cases where a single save triggers
 *      tens of thousands of inserts; anything beyond the cap is handled
 *      incrementally by the nightly embedding cron.
 *
 * Returns: { jobQueued: boolean; candidatesQueued: number }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@/lib/supabase/server";
import { createClient as svc }       from "@supabase/supabase-js";
import { checkCsrf }                 from "@/lib/csrf";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/** Cap rescore fan-out. Larger jobs rely on the nightly backfill cron. */
const MAX_BATCH = 5000;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Verify the caller owns this job (RLS handles tenant scoping on the read)
  const { data: job } = await supabase
    .from("jobs")
    .select("id, agency_id")
    .eq("id", id)
    .maybeSingle();

  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // US-327: service role reserved for system-table writes (embedding_jobs
  // has no user-facing policy) and for batch-reading candidates with
  // existing match scores — RLS would otherwise scope that to the caller's
  // explicit access list, which is narrower than we need here.
  const db = svc(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  // 1. Enqueue the job itself for re-embedding
  const { error: jobQueueErr } = await db
    .from("embedding_jobs")
    .upsert(
      {
        entity_type: "jobs",
        entity_id:   id,
        status:      "pending",
        queued_at:   new Date().toISOString(),
      },
      { onConflict: "entity_type,entity_id" }
    );

  if (jobQueueErr) {
    console.error("[rescore] failed to queue job:", jobQueueErr);
    return NextResponse.json({ error: "Failed to queue rescore" }, { status: 500 });
  }

  // 2. Find candidates with existing match scores for this job and batch-queue them
  const { data: rows, error: scoresErr } = await db
    .from("ai_match_scores")
    .select("candidate_id")
    .eq("job_id", id)
    .eq("agency_id", job.agency_id)
    .limit(MAX_BATCH);

  if (scoresErr) {
    console.error("[rescore] failed to read scores:", scoresErr);
    // Job is still queued — partial success
    return NextResponse.json({ jobQueued: true, candidatesQueued: 0 });
  }

  const candidateIds = Array.from(
    new Set((rows ?? []).map((r) => (r as { candidate_id: string }).candidate_id))
  );

  let candidatesQueued = 0;
  if (candidateIds.length > 0) {
    const nowIso = new Date().toISOString();
    // Chunk the upsert — avoid sending 5 000 rows in a single request.
    const CHUNK = 500;
    for (let i = 0; i < candidateIds.length; i += CHUNK) {
      const slice = candidateIds.slice(i, i + CHUNK).map((cid) => ({
        entity_type: "candidates" as const,
        entity_id:   cid,
        status:      "pending" as const,
        queued_at:   nowIso,
      }));

      const { error: upsertErr } = await db
        .from("embedding_jobs")
        .upsert(slice, { onConflict: "entity_type,entity_id" });

      if (upsertErr) {
        console.error("[rescore] chunk upsert failed:", upsertErr);
        break;  // partial success — keep the count honest
      }
      candidatesQueued += slice.length;
    }
  }

  // Audit (best-effort)
  await db.from("audit_events").insert({
    actor_id:  user.id,
    action:    "job.rescore_queued",
    resource:  `job:${id}`,
    metadata:  { candidates_queued: candidatesQueued, truncated: candidateIds.length === MAX_BATCH },
  }).maybeSingle();

  return NextResponse.json({
    jobQueued:        true,
    candidatesQueued,
    truncated:        candidateIds.length === MAX_BATCH,
  });
}
