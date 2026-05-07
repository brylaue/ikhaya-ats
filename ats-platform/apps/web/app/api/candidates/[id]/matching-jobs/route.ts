/**
 * GET /api/candidates/[id]/matching-jobs
 * US-382: Best-Fit Job Matching — reverse lookup from candidate.
 *
 * Returns the top N open jobs for a given candidate, ranked by AI match score.
 *
 * Strategy:
 * 1. Try ai_match_scores table (pre-computed by embedding pipeline) via
 *    top_matches_for_candidate() RPC — fastest, already scored.
 * 2. If no scores exist yet (embeddings not yet generated), fall back to
 *    search_jobs_semantic() using the candidate's own embedding as the query.
 * 3. If neither is available, return empty list (client shows "scores pending" state).
 *
 * Returns: { jobs: MatchingJob[]; mode: "scored" | "vector" | "pending" }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@/lib/supabase/server";

export interface MatchingJob {
  id:          string;
  title:       string;
  company:     string | null;
  companyId:   string | null;
  location:    string | null;
  status:      string;
  score:       number;           // 0–100
  mode:        "scored" | "vector";
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: candidateId } = await params;

  const { data: userRow } = await supabase
    .from("users").select("agency_id").eq("id", user.id).single();
  const agencyId = userRow?.agency_id;
  if (!agencyId) return NextResponse.json({ error: "No agency" }, { status: 403 });

  // Verify candidate belongs to this agency
  const { data: candidate } = await supabase
    .from("candidates")
    .select("id, embedding")
    .eq("id", candidateId)
    .eq("agency_id", agencyId)
    .single();

  if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const limit = Math.min(parseInt(new URL(req.url).searchParams.get("limit") ?? "5"), 10);

  // ── Strategy 1: pre-computed match scores ────────────────────────────────────
  const { data: scoreRows } = await supabase.rpc("top_matches_for_candidate", {
    p_candidate_id: candidateId,
    p_limit:        limit,
  }) as { data: { job_id: string; score: number }[] | null };

  if (scoreRows && scoreRows.length > 0) {
    // Hydrate with job details
    const jobIds = scoreRows.map((r) => r.job_id);
    const { data: jobs } = await supabase
      .from("jobs")
      .select("id, title, location, status, company_id, companies(name)")
      .in("id", jobIds);

    const jobMap = new Map((jobs ?? []).map((j) => [j.id, j]));
    const matched: MatchingJob[] = scoreRows
      .map((r) => {
        const j = jobMap.get(r.job_id);
        if (!j) return null;
        return {
          id:        j.id,
          title:     j.title,
          company:   (Array.isArray(j.companies) ? j.companies[0]?.name : (j.companies as { name?: string } | null)?.name) ?? null,
          companyId: j.company_id,
          location:  j.location ?? null,
          status:    j.status,
          score:     Number(r.score),
          mode:      "scored" as const,
        };
      })
      .filter(Boolean) as MatchingJob[];

    return NextResponse.json({ jobs: matched, mode: "scored" });
  }

  // ── Strategy 2: live vector similarity (embeddings not yet scored) ───────────
  if (candidate.embedding) {
    const { data: vectorRows } = await supabase.rpc("search_jobs_semantic", {
      query_embedding: candidate.embedding,
      p_agency_id:     agencyId,
      p_limit:         limit,
      p_threshold:     0.3,
    }) as { data: { job_id: string; title: string; company: string | null; location: string | null; status: string; similarity: number }[] | null };

    if (vectorRows && vectorRows.length > 0) {
      const matched: MatchingJob[] = vectorRows.map((r) => ({
        id:        r.job_id,
        title:     r.title,
        company:   r.company,
        companyId: null,
        location:  r.location,
        status:    r.status,
        score:     Math.round(r.similarity * 100),
        mode:      "vector" as const,
      }));
      return NextResponse.json({ jobs: matched, mode: "vector" });
    }
  }

  // ── Strategy 3: nothing available yet ────────────────────────────────────────
  return NextResponse.json({ jobs: [], mode: "pending" });
}
