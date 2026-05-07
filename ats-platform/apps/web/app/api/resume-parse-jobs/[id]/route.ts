/**
 * GET /api/resume-parse-jobs/[id]
 * US-380: Status polling endpoint for async resume parse jobs.
 *
 * RLS enforces agency scoping: the job is only visible if the caller's
 * agency matches resume_parse_jobs.agency_id. Cross-tenant IDOR is
 * therefore impossible — the SELECT policy rejects the row.
 *
 * Response shape:
 *   { id, status, candidateId, fileName, queuedAt, startedAt,
 *     completedAt, parsed?, fieldsUpdated?, error? }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const { data: job, error } = await supabase
    .from("resume_parse_jobs")
    .select("id, status, candidate_id, file_name, queued_at, started_at, completed_at, parsed_data, fields_updated, error_text, attempts")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[resume-parse-jobs/:id] query failed:", error);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }

  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    id:            job.id,
    status:        job.status,
    candidateId:   job.candidate_id,
    fileName:      job.file_name,
    queuedAt:      job.queued_at,
    startedAt:     job.started_at,
    completedAt:   job.completed_at,
    parsed:        job.parsed_data,
    fieldsUpdated: job.fields_updated,
    error:         job.error_text,
    attempts:      job.attempts,
  });
}
