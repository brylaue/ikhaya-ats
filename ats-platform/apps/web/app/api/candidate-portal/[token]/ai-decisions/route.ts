/**
 * GET /api/candidate-portal/[token]/ai-decisions
 * US-422: Candidate-facing AI transparency endpoint.
 *
 * Returns the AI decisions that shaped *this candidate's* experience —
 * match scoring against jobs, resume parse, skill normalisation, any
 * outreach drafted to them, shortlist inclusion blurbs, etc.
 *
 * Gates:
 *  - Token must be valid and unrevoked (same rules as sibling portal route).
 *  - Agency must have `ai_transparency_enabled = true`; otherwise we return
 *    `{ enabled: false, decisions: [] }` so the UI can degrade cleanly.
 *  - Only rows with `visible_to_candidate = true` are returned.
 *
 * Response shape: `{ enabled, decisions: [{ id, type, rationale, modelCardUrl,
 *                   model, provider, relatedType, relatedId, createdAt }] }`.
 *
 * No PII, no raw prompts — by design. `input_hash` is server-side only.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@supabase/supabase-js";

const svc = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

interface DecisionRow {
  id:                   string;
  decision_type:        string;
  rationale:            string | null;
  model_card_url:       string | null;
  model:                string;
  provider:             string;
  related_type:         string | null;
  related_id:           string | null;
  created_at:           string;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token || token.length < 32) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  const db = svc();

  // 1. Resolve token → candidate_id + agency_id. Same validation as the
  //    main portal endpoint so the transparency view can't outlive the
  //    portal link itself.
  const { data: tokenRow, error: tokenErr } = await db
    .from("candidate_portal_tokens")
    .select("candidate_id, agency_id, expires_at, revoked_at")
    .eq("token", token)
    .single();

  if (tokenErr || !tokenRow) {
    return NextResponse.json({ error: "Token not found" }, { status: 404 });
  }
  if (tokenRow.revoked_at) {
    return NextResponse.json({ error: "Portal link revoked" }, { status: 403 });
  }
  if (new Date(tokenRow.expires_at) < new Date()) {
    return NextResponse.json({ error: "Portal link expired" }, { status: 403 });
  }

  // 2. Honour agency transparency flag. When off, we return an empty set
  //    (internal logging continues untouched — EU AI Act requires retention
  //    regardless of candidate exposure).
  const { data: agency } = await db
    .from("agencies")
    .select("ai_transparency_enabled")
    .eq("id", tokenRow.agency_id)
    .single();

  if (!agency?.ai_transparency_enabled) {
    return NextResponse.json({ enabled: false, decisions: [] });
  }

  // 3. Fetch candidate-visible decisions. Index `ai_decisions_candidate_visible_idx`
  //    covers this exact predicate so the query is cheap.
  const { data: rows } = await db
    .from("ai_decisions")
    .select("id, decision_type, rationale, model_card_url, model, provider, related_type, related_id, created_at")
    .eq("agency_id",            tokenRow.agency_id)
    .eq("subject_type",         "candidate")
    .eq("subject_id",           tokenRow.candidate_id)
    .eq("visible_to_candidate", true)
    .order("created_at", { ascending: false })
    .limit(50);

  // 4. Optional related-job title enrichment. If a decision is related to a
  //    job, surface the title so the candidate sees "Matched against Senior
  //    Platform Engineer" instead of a raw UUID. We batch the lookup.
  const jobIds = Array.from(new Set(
    ((rows ?? []) as DecisionRow[])
      .filter((r) => r.related_type === "job" && r.related_id)
      .map((r) => r.related_id as string),
  ));

  const jobTitles = new Map<string, string>();
  if (jobIds.length > 0) {
    const { data: jobs } = await db
      .from("jobs")
      .select("id, title")
      .in("id", jobIds)
      .eq("agency_id", tokenRow.agency_id);
    for (const j of (jobs ?? []) as { id: string; title: string | null }[]) {
      if (j.title) jobTitles.set(j.id, j.title);
    }
  }

  const decisions = ((rows ?? []) as DecisionRow[]).map((r) => ({
    id:           r.id,
    type:         r.decision_type,
    rationale:    r.rationale,
    modelCardUrl: r.model_card_url,
    model:        r.model,
    provider:     r.provider,
    relatedType:  r.related_type,
    relatedId:    r.related_id,
    relatedLabel: r.related_type === "job" && r.related_id
      ? jobTitles.get(r.related_id) ?? null
      : null,
    createdAt:    r.created_at,
  }));

  return NextResponse.json({ enabled: true, decisions });
}
