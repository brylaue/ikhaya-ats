/**
 * GET /api/cron/embed-backfill
 * US-375: Process pending embedding jobs — calls the generate-embeddings
 * Supabase Edge Function for each queued candidate / job / company.
 *
 * Processes up to BATCH_SIZE records per invocation to stay within timeout.
 * Protected by CRON_SECRET bearer token (same pattern as other cron routes).
 *
 * Schedule: every 5 minutes while there's a backlog; can be triggered manually.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@supabase/supabase-js";

const BATCH_SIZE     = 20; // records per run
const EDGE_FUNC_URL  = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-embeddings`;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function checkCronSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail-closed: missing secret blocks all calls
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!checkCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  // Fetch next batch of pending embedding jobs
  const { data: batch, error } = await db.rpc("next_embedding_batch", {
    batch_size: BATCH_SIZE,
  });

  if (error) {
    console.error("[embed-backfill] fetch batch error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!batch || (batch as unknown[]).length === 0) {
    return NextResponse.json({ ok: true, processed: 0, message: "No pending jobs" });
  }

  const jobs = batch as { entity_type: string; entity_id: string }[];

  // Mark all as in-flight to prevent duplicate processing
  const ids = jobs.map((j) => j.entity_id);
  await db.from("embedding_jobs")
    .update({ status: "processing" })
    .in("entity_id", ids)
    .eq("status", "pending");

  // Call Edge Function for each job
  const results = await Promise.allSettled(
    jobs.map(async (job) => {
      const body: Record<string, string> =
        job.entity_type === "candidates" ? { candidate_id: job.entity_id } :
        job.entity_type === "jobs"       ? { job_id:        job.entity_id } :
                                           { company_id:    job.entity_id };

      const res = await fetch(EDGE_FUNC_URL, {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Edge Function error ${res.status}: ${errText}`);
      }
    })
  );

  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const failed    = results.filter((r) => r.status === "rejected").length;

  console.info(`[embed-backfill] processed ${jobs.length}: ${succeeded} ok, ${failed} failed`);

  return NextResponse.json({ ok: true, processed: jobs.length, succeeded, failed });
}
