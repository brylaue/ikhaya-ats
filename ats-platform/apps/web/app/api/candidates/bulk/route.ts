/**
 * POST /api/candidates/bulk
 * US-479: Bulk candidate operations from the candidate table.
 * US-480: Dispatches candidate.stage_changed webhook on "move" action.
 *
 * Actions:
 *  - "archive"    → set status = 'archived' on all ids
 *  - "tag"        → append tag(s) to skills/tags array
 *  - "move"       → add/move all to a pipeline stage (job_id + stage_id required)
 *  - "unarchive"  → set status = 'active' on all ids
 *
 * Body: { action: string; ids: string[]; tag?: string; jobId?: string; stageId?: string }
 * Response: { updated: number }
 */

import { NextRequest, NextResponse }    from "next/server";
import { createClient }                 from "@/lib/supabase/server";
import { createClient as svc }          from "@supabase/supabase-js";
import { getAgencyContext }             from "@/lib/supabase/agency-cache";
import { checkCsrf }                    from "@/lib/csrf";
import { dispatchWebhook }              from "@/lib/webhooks/deliver";

const serviceDb = () =>
  svc(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

const MAX_BULK = 500;

export async function POST(req: NextRequest) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const ctx      = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { action, ids, tag, jobId, stageId } = body as {
    action?:  string;
    ids?:     string[];
    tag?:     string;
    jobId?:   string;
    stageId?: string;
  };

  if (!action || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "action and ids are required" }, { status: 400 });
  }
  if (ids.length > MAX_BULK) {
    return NextResponse.json({ error: `Max ${MAX_BULK} candidates per bulk operation` }, { status: 400 });
  }

  // All operations are scoped to the agency via RLS (candidates table has agency_id column)
  switch (action) {
    case "archive":
    case "unarchive": {
      const { error, count } = await supabase
        .from("candidates")
        .update({ status: action === "archive" ? "archived" : "active" })
        .eq("agency_id", ctx.agencyId)
        .in("id", ids);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ updated: count ?? ids.length });
    }

    case "tag": {
      if (!tag?.trim()) return NextResponse.json({ error: "tag is required" }, { status: 400 });
      // Append tag to each candidate's tags array (PostgreSQL array_append)
      // We do this one-by-one in a batch because Supabase JS doesn't support array_append in bulk
      // A RPC would be cleaner but we use a loop with Promise.all for simplicity
      const results = await Promise.allSettled(
        ids.map((id) =>
          supabase.rpc("append_candidate_tag", { p_agency_id: ctx.agencyId, p_candidate_id: id, p_tag: tag.trim() })
        )
      );
      const updated = results.filter((r) => r.status === "fulfilled").length;
      return NextResponse.json({ updated });
    }

    case "move": {
      if (!jobId || !stageId) {
        return NextResponse.json({ error: "jobId and stageId are required for move" }, { status: 400 });
      }
      // Verify job belongs to agency
      const { data: job } = await supabase
        .from("jobs")
        .select("id, title")
        .eq("id", jobId)
        .eq("agency_id", ctx.agencyId)
        .single();
      if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

      // Resolve stage name for webhook payload
      const { data: stage } = await supabase
        .from("pipeline_stages")
        .select("name")
        .eq("id", stageId)
        .single();

      // Upsert pipeline entries for each candidate
      const now = new Date().toISOString();
      const entries = ids.map((candidateId) => ({
        agency_id:        ctx.agencyId,
        job_id:           jobId,
        candidate_id:     candidateId,
        stage_id:         stageId,
        status:           "active",
        entered_stage_at: now,
      }));

      // Insert, updating stage_id if already present (ON CONFLICT)
      const { error, count } = await supabase
        .from("candidate_pipeline_entries")
        .upsert(entries, { onConflict: "job_id,candidate_id", ignoreDuplicates: false })
        .eq("agency_id", ctx.agencyId);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      // US-480: Dispatch candidate.stage_changed webhook (fire-and-forget)
      const db = serviceDb();
      dispatchWebhook(db, ctx.agencyId, "candidate.stage_changed", {
        candidateIds: ids,
        jobId,
        jobTitle:  (job as Record<string, unknown>).title ?? null,
        stageId,
        stageName: stage?.name ?? null,
        movedAt:   now,
        movedBy:   ctx.userId,
      }).catch(() => {/* ignore webhook delivery failures */});

      return NextResponse.json({ updated: count ?? ids.length });
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}
