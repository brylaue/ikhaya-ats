/**
 * GET /api/candidate-portal/[token]
 * US-240: Candidate portal — public token-authenticated endpoint.
 *
 * No Supabase auth session required. The token IS the credential.
 * Returns candidate name, job details, current pipeline stage, stage
 * history breadcrumb, and any prep content attached to this candidate
 * that is visible at the current stage (stage_name matches or is null).
 *
 * Uses service role to bypass RLS — token validation is the only gate.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@supabase/supabase-js";

const svc = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

const err = (msg: string, status = 404) =>
  NextResponse.json({ error: msg }, { status });

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token || token.length < 32) return err("Invalid token", 400);

  const db = svc();

  // 1. Resolve token
  const { data: row, error: tokenErr } = await db
    .from("candidate_portal_tokens")
    .select("id, candidate_id, job_id, agency_id, expires_at, revoked_at, unlocked_from_stage_order")
    .eq("token", token)
    .single();

  if (tokenErr || !row) return err("Token not found");
  if (row.revoked_at)   return err("This portal link has been revoked");
  if (new Date(row.expires_at) < new Date()) return err("This portal link has expired");

  // 2. Touch last_accessed_at (fire-and-forget)
  db.from("candidate_portal_tokens")
    .update({ last_accessed_at: new Date().toISOString() })
    .eq("id", row.id)
    .then(() => {/* ignore */});

  // 3. Fetch candidate
  const { data: candidate } = await db
    .from("candidates")
    .select("id, first_name, last_name, email, current_title, current_company")
    .eq("id", row.candidate_id)
    .single();

  if (!candidate) return err("Candidate not found");

  // 4. Fetch pipeline entry (current stage) if job_id present
  let stageName: string | null = null;
  let jobTitle: string | null  = null;
  let companyName: string | null = null;
  let allStages: { name: string; position: number }[] = [];
  let currentStageOrder = 0;

  if (row.job_id) {
    const { data: entry } = await db
      .from("candidate_pipeline_entries")
      .select("stage_id")
      .eq("candidate_id", row.candidate_id)
      .eq("job_id", row.job_id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const { data: job } = await db
      .from("jobs")
      .select("id, title, companies(name), pipeline_id")
      .eq("id", row.job_id)
      .single();

    jobTitle = (job as any)?.title ?? null;
    companyName = (job as any)?.companies?.name ?? null;

    if (entry?.stage_id && (job as any)?.pipeline_id) {
      // Fetch all stages for this pipeline to build progress bar
      const { data: stages } = await db
        .from("pipeline_stages")
        .select("id, name, stage_order")
        .eq("pipeline_id", (job as any).pipeline_id)
        .order("stage_order");

      allStages = (stages ?? []).map((s) => ({ name: s.name, position: s.stage_order }));

      const currentStage = (stages ?? []).find((s) => s.id === entry.stage_id);
      stageName = currentStage?.name ?? null;
      currentStageOrder = currentStage?.stage_order ?? 0;
    }
  }

  // 5. US-241: Check stage gate — if candidate hasn't reached the required stage
  //    return a locked response so the portal page can show a coming-soon message.
  const gateOrder = (row as Record<string, unknown>).unlocked_from_stage_order as number ?? 0;
  if (gateOrder > 0 && currentStageOrder < gateOrder) {
    return NextResponse.json({
      locked:    true,
      candidate: {
        firstName:      candidate.first_name,
        lastName:       candidate.last_name,
        email:          candidate.email,
        currentTitle:   candidate.current_title,
        currentCompany: candidate.current_company,
      },
      job:       jobTitle ? { title: jobTitle, company: companyName } : null,
      pipeline:  { currentStage: stageName, currentStageOrder, stages: allStages },
      prepContent: [],
    });
  }

  // 6. Fetch prep content visible at this stage
  let prepQuery = db
    .from("prep_content")
    .select("id, title, content_type, body, url, stage_name, sort_order")
    .eq("candidate_id", row.candidate_id)
    .order("sort_order");

  if (row.job_id) {
    prepQuery = prepQuery.eq("job_id", row.job_id);
  }

  const { data: allPrep } = await prepQuery;

  // Filter: show items where stage_name is null (all stages) or matches current stage
  const prep = (allPrep ?? []).filter(
    (p) => p.stage_name === null || p.stage_name === stageName
  );

  return NextResponse.json({
    candidate: {
      firstName:   candidate.first_name,
      lastName:    candidate.last_name,
      email:       candidate.email,
      currentTitle: candidate.current_title,
      currentCompany: candidate.current_company,
    },
    job:  jobTitle  ? { title: jobTitle, company: companyName } : null,
    pipeline: {
      currentStage:      stageName,
      currentStageOrder,
      stages:            allStages,
    },
    prepContent: prep.map((p) => ({
      id:          p.id,
      title:       p.title,
      contentType: p.content_type,
      body:        p.body,
      url:         p.url,
      stageName:   p.stage_name,
    })),
  });
}
