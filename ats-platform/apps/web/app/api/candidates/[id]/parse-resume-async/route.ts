/**
 * POST /api/candidates/[id]/parse-resume-async
 * US-380: Async resume parser — enqueue variant.
 *
 * Accepts the same multipart payload as the sync parser. Extracts text
 * inline (cheap, deterministic), writes a pending resume_parse_jobs row
 * with the extracted text, and returns a job ID immediately.
 *
 * The client then polls GET /api/resume-parse-jobs/[jobId] until
 * status === "done" or "error".
 *
 * This sidesteps the 30s Vercel edge timeout for large / slow Claude calls
 * and lets the UI show upload progress + parse progress separately.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@/lib/supabase/server";
import { createClient as svc }       from "@supabase/supabase-js";
import { extractResumeText }         from "@/lib/ai/resume-extract";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const MAX_RAW_TEXT = 12_000; // Claude context budget

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Verify the candidate is visible to this user (RLS → agency match)
  const { data: candidate } = await supabase
    .from("candidates")
    .select("id, agency_id")
    .eq("id", id)
    .single();

  if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Parse multipart form
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file field required" }, { status: 400 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!["pdf", "docx", "doc"].includes(ext)) {
    return NextResponse.json({ error: "Only PDF and DOCX files are supported" }, { status: 415 });
  }

  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 413 });
  }

  // Extract text sync — this is fast and guarantees the worker has what it needs.
  const buffer = await file.arrayBuffer();
  let rawText: string;
  try {
    rawText = await extractResumeText(buffer, ext);
  } catch (err) {
    console.error("[parse-resume-async] text extraction failed:", err);
    return NextResponse.json({ error: "Could not extract text from file" }, { status: 422 });
  }

  if (!rawText || rawText.trim().length < 50) {
    return NextResponse.json(
      { error: "Could not extract readable text. The file may be a scanned image." },
      { status: 422 },
    );
  }

  const truncated = rawText.slice(0, MAX_RAW_TEXT);

  // Enqueue the job. The user-scoped client is fine here — RLS INSERT policy
  // requires agency_id = current_agency_id(), so a cross-tenant write is
  // impossible even if the candidate lookup above were bypassed.
  const { data: job, error: enqueueErr } = await supabase
    .from("resume_parse_jobs")
    .insert({
      agency_id:    candidate.agency_id,
      candidate_id: id,
      enqueued_by:  user.id,
      status:       "pending",
      file_name:    file.name,
      file_size:    file.size,
      file_ext:     ext,
      raw_text:     truncated,
    })
    .select("id, status, queued_at")
    .single();

  if (enqueueErr || !job) {
    console.error("[parse-resume-async] enqueue failed:", enqueueErr);
    return NextResponse.json({ error: "Failed to enqueue parse job" }, { status: 500 });
  }

  // Audit log — service role because audit_events has no user-scoped RLS.
  const db = svc(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  await db.from("audit_events").insert({
    actor_id: user.id,
    action:   "candidate.resume_parse_enqueued",
    resource: `candidate:${id}`,
    metadata: { job_id: job.id, file_name: file.name, file_size: file.size },
  }).maybeSingle();

  return NextResponse.json({
    jobId:    job.id,
    status:   job.status,
    queuedAt: job.queued_at,
  }, { status: 202 });
}
