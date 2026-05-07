/**
 * GET /api/cron/parse-resumes
 * US-380: Worker that drains the resume_parse_jobs queue.
 *
 * Protected by CRON_SECRET bearer token (same pattern as embed-backfill).
 * Processes up to BATCH_SIZE jobs per invocation to stay inside the Vercel
 * function timeout budget.
 *
 * Each job is claimed via the claim_next_resume_parse_job() RPC which
 * uses SELECT ... FOR UPDATE SKIP LOCKED so concurrent worker invocations
 * never double-process a row. On permanent failure we flip status to
 * 'error' and stash the message so the admin UI can surface it.
 *
 * Schedule suggestion: every 1-2 minutes while a backlog exists.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  RESUME_PARSE_SYSTEM,
  parsedResumeToUpdates,
  type ParsedResume,
} from "@/lib/ai/resume-extract";
import { callClaude, AiRateLimitError } from "@/lib/ai/client";

const BATCH_SIZE  = 5;           // Claude calls can be slow — keep concurrency low
const MAX_ATTEMPTS = 3;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function checkCronSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

interface ParseJobRow {
  id: string;
  agency_id: string;
  candidate_id: string;
  enqueued_by: string | null;
  status: string;
  file_name: string;
  raw_text: string | null;
  attempts: number;
}

// Use the untyped SupabaseClient here — the cron worker writes to system
// tables that aren't in the generated Database type, so a typed client
// would require casts anyway. Narrowing happens at each call site.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedSupabase = SupabaseClient<any, any, any, any, any>;

async function processOne(
  db: UntypedSupabase,
  job: ParseJobRow,
): Promise<{ ok: boolean; error?: string }> {
  if (!job.raw_text || job.raw_text.length < 50) {
    return { ok: false, error: "Empty or too-short extracted text" };
  }

  // Call Claude for structured extraction
  let parsed: ParsedResume;
  try {
    const raw = await callClaude(
      RESUME_PARSE_SYSTEM,
      [{ role: "user", content: `Resume text:\n\n${job.raw_text}` }],
      1024,
      {
        agencyId:  job.agency_id,
        userId:    job.enqueued_by ?? undefined,
        operation: "resume_parse_async",
      },
    );
    const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    parsed = JSON.parse(cleaned) as ParsedResume;
  } catch (err) {
    if (err instanceof AiRateLimitError) {
      // Transient — leave as "processing" with the attempt counter bumped
      // so the next cron pass retries once the daily cap rolls over.
      return { ok: false, error: `rate_limited: ${err.message}` };
    }
    console.error("[cron/parse-resumes] Claude call failed for job", job.id, err);
    return { ok: false, error: (err as Error).message ?? "AI extraction failed" };
  }

  const updates = parsedResumeToUpdates(parsed);

  let appliedFields: string[] = [];
  if (Object.keys(updates).length > 0) {
    // Write back via service role — this endpoint has no user session.
    // RLS is bypassed intentionally: the job row itself proves the write
    // is scoped to the right agency (we fetch candidate by id + agency_id).
    const { error: updErr, data: updated } = await db
      .from("candidates")
      .update(updates)
      .eq("id", job.candidate_id)
      .eq("agency_id", job.agency_id)
      .select("id")
      .maybeSingle();

    if (updErr) {
      console.error("[cron/parse-resumes] candidate update failed", updErr);
      return { ok: false, error: `db update: ${updErr.message}` };
    }
    if (updated) appliedFields = Object.keys(updates);
  }

  // Mark job done
  await db.from("resume_parse_jobs").update({
    status:         "done",
    parsed_data:    parsed,
    fields_updated: appliedFields,
    completed_at:   new Date().toISOString(),
    error_text:     null,
  }).eq("id", job.id);

  // Re-queue embedding for the candidate now that its text changed
  if (appliedFields.length > 0) {
    await db.from("embedding_jobs").upsert({
      entity_type: "candidates",
      entity_id:   job.candidate_id,
      status:      "pending",
      queued_at:   new Date().toISOString(),
    }, { onConflict: "entity_type,entity_id" });
  }

  return { ok: true };
}

export async function GET(req: NextRequest) {
  if (!checkCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  const results: Array<{ jobId: string; ok: boolean; error?: string }> = [];

  for (let i = 0; i < BATCH_SIZE; i++) {
    const { data: claimed, error: claimErr } = await db
      .rpc("claim_next_resume_parse_job");

    if (claimErr) {
      console.error("[cron/parse-resumes] claim RPC failed:", claimErr);
      return NextResponse.json({ error: claimErr.message, results }, { status: 500 });
    }

    // RPC returns NULL columns when queue is empty — detect via missing id.
    const job = claimed as ParseJobRow | null;
    if (!job || !job.id) break;

    const result = await processOne(db, job);
    results.push({ jobId: job.id, ok: result.ok, error: result.error });

    if (!result.ok) {
      const permanent = job.attempts + 1 >= MAX_ATTEMPTS;
      await db.from("resume_parse_jobs").update({
        status:       permanent ? "error" : "pending",
        error_text:   result.error ?? "unknown",
        // Don't bump started_at on retries — it reflects the first claim
        ...(permanent ? { completed_at: new Date().toISOString() } : {}),
      }).eq("id", job.id);
    }
  }

  return NextResponse.json({
    ok:        true,
    processed: results.length,
    results,
  });
}
