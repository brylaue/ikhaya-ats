/**
 * POST /api/candidates/[id]/match-score/[jobId]
 * US-110: Compute (or refresh) an explainable match score between this
 * candidate and job.
 *
 * Returns:
 *   {
 *     score: number,            // 0-100 overall
 *     breakdown: MatchBreakdown,
 *     rationale: string,
 *     confidence: number,       // 0-1 — UI flags < 0.6 for review
 *     generatedBy: string,      // model id
 *     cached: boolean,          // true if returned from the row without recompute
 *   }
 *
 * Behaviour:
 *   - Looks up any existing ai_match_scores row. If `explained_at` is recent
 *     (< 7 days) we return the cached breakdown directly — match explanations
 *     are expensive (≈ 800 output tokens each) and rarely change meaningfully
 *     unless the underlying candidate/job changes.
 *   - Set `?refresh=1` to force recomputation.
 *
 * GET is also supported — returns the cached row WITHOUT triggering an LLM call.
 * If no row exists, returns 404 so the UI can show the "compute score" button.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@/lib/supabase/server";
import { getAgencyContext }          from "@/lib/supabase/agency-cache";
import { checkCsrf }                 from "@/lib/csrf";
import { explainMatchScore }         from "@/lib/ai/match-score";
import { AiRateLimitError, AiMalformedOutputError } from "@/lib/ai/client";
import { requirePlan }               from "@/lib/api/require-plan";

const CACHE_TTL_DAYS = 7;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; jobId: string }> },
) {
  const supabase = await createClient();
  const ctx      = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: candidateId, jobId } = await params;

  // Scope the lookup by agency to prevent cross-tenant ID probing.
  const { data: row } = await supabase
    .from("ai_match_scores")
    .select("id, score, breakdown, rationale, confidence, generated_by, explained_at, computed_at")
    .eq("candidate_id", candidateId)
    .eq("job_id", jobId)
    .eq("agency_id", ctx.agencyId)
    .maybeSingle();

  if (!row) return NextResponse.json({ error: "No score computed yet" }, { status: 404 });

  return NextResponse.json({
    matchScoreId: row.id,
    score:        Number(row.score ?? 0),
    breakdown:    row.breakdown ?? null,
    rationale:    row.rationale ?? null,
    confidence:   row.confidence != null ? Number(row.confidence) : null,
    generatedBy:  row.generated_by ?? null,
    explainedAt:  row.explained_at,
    computedAt:   row.computed_at,
    hasExplanation: row.breakdown != null,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; jobId: string }> },
) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const ctx      = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // US-499: plan gate — AI match scoring is a Growth feature.
  const planGuard = await requirePlan(supabase, ctx.agencyId, "ai_match_scoring");
  if (planGuard) return planGuard;

  const { id: candidateId, jobId } = await params;
  const url     = new URL(req.url);
  const refresh = url.searchParams.get("refresh") === "1";

  // ── Cache path: recent explanation exists, not asking for refresh ────────────
  // Agency-scoped lookup prevents a caller from forcing a recompute against
  // a match score owned by another tenant.
  const { data: existing } = await supabase
    .from("ai_match_scores")
    .select("id, score, breakdown, rationale, confidence, generated_by, explained_at")
    .eq("candidate_id", candidateId)
    .eq("job_id", jobId)
    .eq("agency_id", ctx.agencyId)
    .maybeSingle();

  if (!refresh && existing?.breakdown && existing.explained_at) {
    const ageMs = Date.now() - new Date(existing.explained_at as string).getTime();
    if (ageMs < CACHE_TTL_DAYS * 24 * 60 * 60 * 1000) {
      return NextResponse.json({
        matchScoreId: existing.id,
        score:        Number(existing.score ?? 0),
        breakdown:    existing.breakdown,
        rationale:    existing.rationale,
        confidence:   existing.confidence != null ? Number(existing.confidence) : null,
        generatedBy:  existing.generated_by,
        cached:       true,
      });
    }
  }

  // ── Fresh explanation via LLM ────────────────────────────────────────────────
  try {
    const explanation = await explainMatchScore({
      agencyId:      ctx.agencyId,
      userId:        ctx.userId,
      candidateId,
      jobId,
      supabase,
      existingScore: existing?.score != null ? Number(existing.score) : null,
    });

    return NextResponse.json({ ...explanation, cached: false });
  } catch (err) {
    if (err instanceof AiRateLimitError) {
      return NextResponse.json(
        { error: "AI daily cost limit reached", retryAfter: "24h" },
        { status: 429 },
      );
    }
    // US-504: malformed model output → structured 502 with a retry-friendly
    // message rather than a 500 with the raw error bubble.
    if (err instanceof AiMalformedOutputError) {
      return NextResponse.json(
        { error: "AI returned malformed output — try again" },
        { status: 502 },
      );
    }
    console.error("[match-score/:candidateId/:jobId] explain failed", err);
    return NextResponse.json(
      { error: (err as Error).message || "Match scoring failed" },
      { status: 502 },
    );
  }
}
