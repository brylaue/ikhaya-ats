/**
 * POST /api/ai/talent-query
 * US-116: Natural-Language Talent Pool Query.
 * US-379: Upgraded to semantic candidate search — blends OpenAI embedding
 *         cosine similarity against `candidates.embedding` with the existing
 *         filter-extraction scoring for a hybrid ranking.
 *
 * Accepts a plain-English description of the ideal candidate, uses Claude to
 * extract structured filters, then:
 *   1. Computes an embedding of the user's natural-language query.
 *   2. Calls `search_candidates_semantic` RPC → candidates ranked by vector
 *      cosine similarity (scoped by agency via the RPC's `p_agency_id`).
 *   3. Augments with filter-based ILIKE results for candidates not yet
 *      embedded (so fresh data is still reachable the moment it's written).
 *   4. Blends semantic similarity and explicit filter matches into the
 *      final `matchScore` and `matchReason`.
 *
 * Body: { query: string; limit?: number }
 * Response: {
 *   interpretation: string;
 *   appliedFilters: ExtractedFilters;
 *   mode: "semantic" | "keyword" | "hybrid";
 *   candidates: TalentQueryResult[];
 *   totalMatched: number;
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@/lib/supabase/server";
import { getAgencyContext }           from "@/lib/supabase/agency-cache";
import { checkCsrf }                  from "@/lib/csrf";
import { callClaude, AiRateLimitError } from "@/lib/ai/client";
import { embed }                      from "@/lib/embeddings";
import { requirePlan }                from "@/lib/api/require-plan";
import { sanitizeForPrompt }          from "@/lib/ai/sanitize";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExtractedFilters {
  skills:        string[];   // e.g. ["React", "TypeScript"]
  titles:        string[];   // e.g. ["Senior Engineer", "Staff Engineer"]
  locations:     string[];   // e.g. ["London", "Remote"]
  minExperience: number | null;  // years
  maxExperience: number | null;
  availability:  string[];   // "immediately" | "30days" | "60days" | "passive"
  keywords:      string[];   // free-form keywords for full-text search
}

export interface TalentQueryResult {
  id:             string;
  firstName:      string;
  lastName:       string;
  fullName:       string;
  currentTitle:   string | null;
  currentCompany: string | null;
  location:       string | null;
  skills:         string[];
  summary:        string | null;
  email:          string;
  linkedinUrl:    string | null;
  source:         string | null;
  matchReason:    string;   // Why Claude thinks this candidate matches
  matchScore:     number;   // 0-100 relevance score
  /** US-379: populated when the row came from pgvector cosine similarity. */
  semanticSimilarity?: number | null;
}

// ─── Filter extraction prompt ─────────────────────────────────────────────────

const EXTRACT_SYSTEM = `You are a recruiting search expert. Given a natural language query about ideal candidates, extract structured search filters.

Respond in JSON only — no markdown fences:
{
  "interpretation": "one-sentence plain-English summary of what the recruiter is looking for",
  "skills": ["skill1", "skill2"],          // normalized skill names, empty if not mentioned
  "titles": ["title1", "title2"],          // job title keywords to match, empty if not mentioned
  "locations": ["city1", "region1"],       // locations mentioned, empty if not mentioned
  "minExperience": null,                   // minimum years of experience, null if not mentioned
  "maxExperience": null,                   // maximum years, null if not mentioned
  "availability": [],                      // array of: "immediately", "30days", "60days", "passive" — empty if not mentioned
  "keywords": ["keyword1"]                 // other relevant keywords for full-text matching
}`;

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const ctx      = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // US-499 / US-514: granular plan gate — ai_talent_query has its own key.
  const planGuard = await requirePlan(supabase, ctx.agencyId, "ai_talent_query");
  if (planGuard) return planGuard;

  const body = await req.json().catch(() => ({})) as { query?: string; limit?: number };
  const query = (body.query ?? "").trim();
  if (!query) return NextResponse.json({ error: "query is required" }, { status: 400 });

  // US-502: sanitize NL query before sending to Claude (filter-extract step).
  const safeQuery = sanitizeForPrompt(query, { maxLen: 2000 });

  const limit = Math.min(Math.max(body.limit ?? 20, 1), 100);

  // ── Step 1: Extract structured filters from NL query ──────────────────────

  let parsed: { interpretation: string } & ExtractedFilters;
  try {
    const raw = await callClaude(
      EXTRACT_SYSTEM,
      [{ role: "user", content: `Recruiter query: "${safeQuery}"` }],
      512,
      { agencyId: ctx.agencyId, userId: ctx.userId, operation: "nl_filter_extract" }
    );

    // US-504: defensive JSON.parse — malformed output → 502 instead of 500.
    const cleaned = raw.replace(/^```json\n?|```$/g, "").trim();
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("[talent-query] model returned non-JSON:", cleaned.slice(0, 200));
      return NextResponse.json(
        { error: "AI returned malformed output — try again" },
        { status: 502 }
      );
    }
  } catch (e) {
    if (e instanceof AiRateLimitError) {
      return NextResponse.json({ error: e.message }, { status: 429 });
    }
    console.error("[talent-query] filter extract failed", e);
    return NextResponse.json({ error: "Failed to parse query" }, { status: 500 });
  }

  const filters: ExtractedFilters = {
    skills:        parsed.skills        ?? [],
    titles:        parsed.titles        ?? [],
    locations:     parsed.locations     ?? [],
    minExperience: parsed.minExperience ?? null,
    maxExperience: parsed.maxExperience ?? null,
    availability:  parsed.availability  ?? [],
    keywords:      parsed.keywords      ?? [],
  };

  // ── Step 2a: Semantic vector search (US-379) ──────────────────────────────
  //
  // Build a representative text to embed: the original query plus any
  // extracted filters. That gives the LLM-extracted context weight in the
  // vector space even for very short user queries like "react senior".
  // On OPENAI_API_KEY absence embeddings.ts falls back to a deterministic
  // keyword vector — semantic scores will be weaker but the route still
  // returns results, so dev envs keep working.

  const semanticSeed = [
    query,
    filters.skills.length    ? `skills: ${filters.skills.join(", ")}`       : null,
    filters.titles.length    ? `titles: ${filters.titles.join(", ")}`       : null,
    filters.locations.length ? `locations: ${filters.locations.join(", ")}` : null,
    filters.keywords.length  ? `keywords: ${filters.keywords.join(", ")}`   : null,
  ].filter(Boolean).join(". ");

  type SemanticRow = {
    id: string;
    first_name: string;
    last_name: string;
    current_title: string | null;
    current_company: string | null;
    location: string | null;
    status: string | null;
    skills: string[] | null;
    similarity: number;
  };

  const similarityByCandidate = new Map<string, number>();
  let mode: "semantic" | "keyword" | "hybrid" = "keyword";

  try {
    const embedding = await embed(semanticSeed, {
      agencyId:  ctx.agencyId,
      userId:    ctx.userId,
      operation: "nl_talent_query",
    });

    const { data: semanticRows, error: semErr } = await supabase.rpc(
      "search_candidates_semantic",
      {
        query_embedding: embedding.embedding as unknown as string,
        p_agency_id:     ctx.agencyId,
        p_limit:         limit * 4,
        p_threshold:     0.20,
      },
    );

    if (!semErr && Array.isArray(semanticRows)) {
      mode = "semantic";
      for (const r of semanticRows as SemanticRow[]) {
        // Cosine similarity from the RPC is already in [0, 1].
        similarityByCandidate.set(r.id, r.similarity);
      }
    } else if (semErr) {
      console.warn("[talent-query] semantic RPC failed — falling back to keyword", semErr);
    }
  } catch (err) {
    if (err instanceof AiRateLimitError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    // Embedding failures are non-fatal — we just drop to keyword mode.
    console.warn("[talent-query] embedding failed — falling back to keyword", err);
  }

  // ── Step 2b: Keyword/filter ILIKE pass (always runs) ──────────────────────
  //
  // This catches newly-inserted candidates that haven't been embedded yet
  // (embedding_jobs processes asynchronously) and anything the vector space
  // missed because the query mentions exact tokens (company names, acronyms).

  let q = supabase
    .from("candidates")
    .select("id, first_name, last_name, current_title, current_company, location, skills, summary, email, linkedin_url, source")
    .eq("agency_id", ctx.agencyId)
    .eq("status", "active");

  // Full-text: search name + title + company against all keywords + query
  const allTerms = [...filters.skills, ...filters.titles, ...filters.keywords, query].filter(Boolean);
  if (allTerms.length > 0) {
    // Escape commas/parens for PostgREST .or() syntax — otherwise they get
    // parsed as separators and the query 500s.
    const safe = query.replace(/[,()]/g, " ");
    q = q.or(
      `first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,current_title.ilike.%${safe}%,current_company.ilike.%${safe}%`
    );
  }

  // Location filter: match any mentioned location
  if (filters.locations.length > 0) {
    const locOr = filters.locations
      .map(l => `location->>city.ilike.%${l.replace(/[,()]/g, " ")}%`)
      .join(",");
    q = q.or(locOr);
  }

  q = q.limit(limit * 3); // Fetch 3x and rank/trim below

  const { data: rawRows, error: dbError } = await q;

  if (dbError) {
    console.error("[talent-query] DB query failed", dbError);
    return NextResponse.json({ error: "Database query failed" }, { status: 500 });
  }

  // ── Step 2c: If the vector hits contain IDs missing from the ILIKE pass,
  //            hydrate them so final ranking sees all candidates.
  const rawById = new Map<string, { id: string; first_name: string; last_name: string;
    current_title: string | null; current_company: string | null;
    location: Record<string, string> | null; skills: string[] | null;
    summary: string | null; email: string; linkedin_url: string | null; source: string | null; }>();

  for (const row of rawRows ?? []) {
    rawById.set((row as { id: string }).id, row as never);
  }

  const semanticOnlyIds = Array.from(similarityByCandidate.keys())
    .filter((id) => !rawById.has(id));

  if (semanticOnlyIds.length > 0) {
    const { data: hydrated, error: hydrErr } = await supabase
      .from("candidates")
      .select("id, first_name, last_name, current_title, current_company, location, skills, summary, email, linkedin_url, source")
      .eq("agency_id", ctx.agencyId)
      .eq("status", "active")
      .in("id", semanticOnlyIds);

    if (hydrErr) {
      console.warn("[talent-query] hydrate failed", hydrErr);
    }
    for (const row of hydrated ?? []) {
      rawById.set((row as { id: string }).id, row as never);
    }
  }

  if (similarityByCandidate.size > 0 && (rawRows?.length ?? 0) > 0) mode = "hybrid";

  // ── Step 3: Client-side skill/title matching + scoring ────────────────────

  const rows = Array.from(rawById.values());

  const scored: Array<TalentQueryResult & { _score: number }> = rows.map((row) => {
    const candidateSkills = (row.skills ?? []).map((s: string) => s.toLowerCase());
    const titleLower = (row.current_title ?? "").toLowerCase();
    const companyLower = (row.current_company ?? "").toLowerCase();
    const summaryLower = (row.summary ?? "").toLowerCase();

    // Filter-based score (legacy US-116 path) — normalised to 0..100.
    let filterScore = 0;

    const skillMatches = filters.skills.filter(fs =>
      candidateSkills.some(cs => cs.includes(fs.toLowerCase()) || fs.toLowerCase().includes(cs))
    );
    filterScore += skillMatches.length * 20;

    const titleMatchCount = filters.titles.filter(t => titleLower.includes(t.toLowerCase())).length;
    filterScore += titleMatchCount * 15;

    const kwMatches = [...filters.keywords, ...filters.titles].filter(kw => {
      const k = kw.toLowerCase();
      return titleLower.includes(k) || companyLower.includes(k) || summaryLower.includes(k);
    });
    filterScore += kwMatches.length * 5;

    filterScore = Math.max(0, Math.min(100, filterScore));

    // Semantic score (US-379) — RPC returns similarity in [0, 1]; map to [0, 100].
    const sim = similarityByCandidate.get(row.id) ?? null;
    const semanticScore = sim != null ? Math.round(sim * 100) : null;

    // Blend: if both signals are present, take a weighted mean with stronger
    // weight on the larger signal (so a strong semantic match isn't diluted
    // by a cold filter score, and vice versa). If only one is present, use it.
    let blended: number;
    if (semanticScore != null && filterScore > 0) {
      blended = Math.round(0.6 * Math.max(semanticScore, filterScore) +
                           0.4 * Math.min(semanticScore, filterScore));
    } else if (semanticScore != null) {
      blended = semanticScore;
    } else {
      blended = filterScore > 0 ? filterScore : 30; // baseline for ILIKE hits
    }
    blended = Math.max(0, Math.min(100, blended));

    // Build human-readable rationale
    const matchParts: string[] = [];
    if (semanticScore != null) matchParts.push(`semantic match ${semanticScore}%`);
    if (skillMatches.length > 0) matchParts.push(`skills: ${skillMatches.join(", ")}`);
    if (titleMatchCount > 0) matchParts.push(`title aligns with "${filters.titles.join(" / ")}"`);
    if (matchParts.length === 0) matchParts.push("matches your search terms");

    const city = row.location && typeof row.location === "object" ? (row.location as Record<string, string>).city ?? null : null;

    return {
      id:             row.id,
      firstName:      row.first_name,
      lastName:       row.last_name,
      fullName:       `${row.first_name} ${row.last_name}`,
      currentTitle:   row.current_title,
      currentCompany: row.current_company,
      location:       city,
      skills:         row.skills ?? [],
      summary:        row.summary,
      email:          row.email,
      linkedinUrl:    row.linkedin_url,
      source:         row.source,
      matchReason:    matchParts.join("; "),
      matchScore:     blended,
      semanticSimilarity: sim,
      _score:         blended,
    };
  });

  // Sort by score descending, take top limit
  scored.sort((a, b) => b._score - a._score);
  const topN = scored.slice(0, limit);

  return NextResponse.json({
    interpretation:  parsed.interpretation,
    appliedFilters:  filters,
    mode,
    candidates:      topN.map(({ _score: _s, ...rest }) => rest),
    totalMatched:    scored.length,
  });
}
