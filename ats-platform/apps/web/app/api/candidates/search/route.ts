/**
 * POST /api/candidates/search
 * US-379: Semantic natural language candidate search.
 *
 * Accepts a free-text query ("senior React engineers in NYC with fintech"),
 * embeds it via OpenAI, and runs cosine similarity against candidates.embedding
 * using the search_candidates_semantic() pgvector RPC.
 *
 * Falls back to ilike when embeddings aren't available.
 *
 * Body: { query: string; limit?: number; threshold?: number }
 * Returns: { candidates: CandidateSearchResult[]; mode: "vector" | "ilike" }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@/lib/supabase/server";
import { embed, AiRateLimitError }   from "@/lib/embeddings";
import { checkCsrf }                 from "@/lib/csrf";

export interface CandidateSearchResult {
  id:             string;
  fullName:       string;
  currentTitle:   string | null;
  currentCompany: string | null;
  location:       string | null;
  status:         string | null;
  skills:         string[];
  similarity:     number;
}

export async function POST(req: NextRequest) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: userRow } = await supabase
    .from("users").select("agency_id").eq("id", user.id).single();
  const agencyId = userRow?.agency_id;
  if (!agencyId) return NextResponse.json({ error: "No agency" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const query     = (body.query ?? "").trim();
  const limit     = Math.min(Number.isFinite(body.limit) ? body.limit : 20, 50);
  const threshold = body.threshold ?? 0.18;

  if (!query) return NextResponse.json({ candidates: [], mode: "ilike" });

  // ── 1. Vector search ──────────────────────────────────────────────────────
  try {
    const { embedding, mode: embedMode } = await embed(query, {
      agencyId,
      userId: user.id,
      operation: "candidate_search_query",
    });

    if (embedMode === "openai") {
      const { data: rows, error } = await supabase.rpc("search_candidates_semantic", {
        query_embedding: `[${embedding.join(",")}]`,
        p_agency_id:     agencyId,
        p_limit:         limit,
        p_threshold:     threshold,
      });

      if (!error && rows && (rows as unknown[]).length > 0) {
        const candidates: CandidateSearchResult[] = (rows as {
          id: string; first_name: string; last_name: string;
          current_title: string | null; current_company: string | null;
          location: string | null; status: string | null;
          skills: string[] | null; similarity: number;
        }[]).map((r) => ({
          id:             r.id,
          fullName:       `${r.first_name} ${r.last_name}`,
          currentTitle:   r.current_title,
          currentCompany: r.current_company,
          location:       r.location,
          status:         r.status,
          skills:         r.skills ?? [],
          similarity:     Math.round(r.similarity * 100),
        }));

        return NextResponse.json({ candidates, mode: "vector" });
      }
    }
  } catch (err) {
    if (err instanceof AiRateLimitError) {
      // US-377: agency over cap — fail hard so they get visibility rather
      // than silently degrading to ilike under the hood.
      return NextResponse.json(
        { error: "AI daily cost limit reached", retryAfter: "24h" },
        { status: 429 }
      );
    }
    console.warn("[candidates/search] vector search failed, falling back:", err);
  }

  // ── 2. ilike fallback ─────────────────────────────────────────────────────
  const q = query.toLowerCase();
  const { data: rows } = await supabase
    .from("candidates")
    .select("id, first_name, last_name, current_title, current_company, location, status, skills")
    .eq("agency_id", agencyId)
    .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,current_title.ilike.%${q}%,current_company.ilike.%${q}%`)
    .limit(limit);

  const candidates: CandidateSearchResult[] = (rows ?? []).map((r) => ({
    id:             r.id,
    fullName:       `${r.first_name} ${r.last_name}`,
    currentTitle:   r.current_title,
    currentCompany: r.current_company,
    location:       r.location,
    status:         r.status,
    skills:         (r.skills ?? []) as string[],
    similarity:     70,
  }));

  return NextResponse.json({ candidates, mode: "ilike" });
}
