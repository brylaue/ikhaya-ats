/**
 * GET /api/search?q=...&limit=10
 * US-374: Hybrid search — vector first, keyword RPC fallback, ilike last resort.
 *
 * When OPENAI_API_KEY is set the query is embedded and passed to the
 * search_all() pgvector RPC (cosine similarity, threshold 0.20).
 * Falls back to search_all_keyword() (pg_trgm + full-text) then plain ilike.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { embed, AiRateLimitError } from "@/lib/embeddings";

export interface SearchResultItem {
  type:       "candidate" | "job" | "client";
  id:         string;
  label:      string;
  sublabel:   string;
  href:       string;
  similarity: number;
}

export interface SearchResponse {
  results:    SearchResultItem[];
  query:      string;
  mode:       "vector" | "keyword" | "ilike";
  latency_ms: number;
}

// Map RPC row → SearchResultItem
function mapRpcRow(r: {
  entity_type: string; entity_id: string; label: string;
  sublabel: string; href: string; similarity: number;
}): SearchResultItem {
  return {
    type:       r.entity_type as SearchResultItem["type"],
    id:         r.entity_id,
    label:      r.label,
    sublabel:   r.sublabel ?? "",
    href:       r.href,
    similarity: r.similarity,
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const query = (searchParams.get("q") ?? "").trim();
  // US-332: guard against NaN/negative/zero
  const parsedLimit = parseInt(searchParams.get("limit") ?? "10", 10);
  const limit = Math.max(1, Math.min(Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 10, 25));
  const t0 = Date.now();

  if (!query || query.length < 1) {
    return NextResponse.json({ results: [], query, mode: "ilike", latency_ms: 0 } satisfies SearchResponse);
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ results: [], query, mode: "ilike", latency_ms: 0 } satisfies SearchResponse);
  }

  const { data: userRow } = await supabase
    .from("users")
    .select("agency_id")
    .eq("id", user.id)
    .single();

  const agencyId = userRow?.agency_id ?? null;
  if (!agencyId) {
    return NextResponse.json({ results: [], query, mode: "ilike", latency_ms: 0 } satisfies SearchResponse);
  }

  // ── 1. Vector search (when OpenAI key is available) ────────────────────────
  try {
    const { embedding, mode: embedMode } = await embed(query, {
      agencyId,
      userId: user.id,
      operation: "global_search_query",
    });

    if (embedMode === "openai") {
      const { data: rows, error } = await supabase.rpc("search_all", {
        query_embedding: `[${embedding.join(",")}]`,
        p_agency_id:     agencyId,
        p_limit:         limit,
        p_threshold:     0.20,
      });

      if (!error && rows && (rows as unknown[]).length > 0) {
        return NextResponse.json(
          {
            results:    (rows as Parameters<typeof mapRpcRow>[0][]).map(mapRpcRow),
            query,
            mode:       "vector",
            latency_ms: Date.now() - t0,
          } satisfies SearchResponse,
          { headers: { "Cache-Control": "private, max-age=10" } }
        );
      }
    }

    // ── 2. Keyword RPC fallback (pg_trgm + full-text) ──────────────────────
    const { data: kwRows, error: kwErr } = await supabase.rpc("search_all_keyword", {
      p_query:     query,
      p_agency_id: agencyId,
      p_limit:     limit,
    });

    if (!kwErr && kwRows && (kwRows as unknown[]).length > 0) {
      return NextResponse.json(
        {
          results:    (kwRows as Parameters<typeof mapRpcRow>[0][]).map(mapRpcRow),
          query,
          mode:       "keyword",
          latency_ms: Date.now() - t0,
        } satisfies SearchResponse,
        { headers: { "Cache-Control": "private, max-age=10" } }
      );
    }
  } catch (err) {
    if (err instanceof AiRateLimitError) {
      // US-377: agency over cap — surface 429 instead of silently
      // downgrading. The caller can then show a "limit reached" UI.
      return NextResponse.json(
        {
          results: [],
          query,
          mode: "ilike",
          latency_ms: Date.now() - t0,
          error: "AI daily cost limit reached",
        },
        { status: 429 }
      );
    }
    console.warn("[search] RPC path failed, falling back to ilike:", err);
  }

  // ── 3. ilike fallback (works without pg_trgm or pgvector) ─────────────────
  const q = query.toLowerCase();
  try {
    const [candRes, jobsRes, companiesRes] = await Promise.all([
      supabase
        .from("candidates")
        .select("id, first_name, last_name, current_title, current_company, location, status")
        .eq("agency_id", agencyId)
        .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,current_title.ilike.%${q}%,current_company.ilike.%${q}%`)
        .limit(Math.ceil(limit / 2) + 2),

      supabase
        .from("jobs")
        .select("id, title, location, status, companies(name)")
        .eq("agency_id", agencyId)
        .ilike("title", `%${q}%`)
        .limit(Math.ceil(limit / 3)),

      supabase
        .from("companies")
        .select("id, name, industry")
        .eq("agency_id", agencyId)
        .or(`name.ilike.%${q}%,industry.ilike.%${q}%`)
        .limit(Math.ceil(limit / 3)),
    ]);

    const results: SearchResultItem[] = [
      ...(candRes.data ?? []).map((c) => ({
        type:       "candidate" as const,
        id:         c.id,
        label:      `${c.first_name} ${c.last_name}`,
        sublabel:   [c.current_title, c.current_company].filter(Boolean).join(" · "),
        href:       `/candidates/${c.id}`,
        similarity: 0.9,
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(jobsRes.data ?? []).map((j: any) => ({
        type:       "job" as const,
        id:         j.id,
        label:      j.title,
        sublabel:   [j.companies?.name, j.location].filter(Boolean).join(" · "),
        href:       `/jobs/${j.id}`,
        similarity: 0.8,
      })),
      ...(companiesRes.data ?? []).map((c) => ({
        type:       "client" as const,
        id:         c.id,
        label:      c.name,
        sublabel:   c.industry ?? "",
        href:       `/clients/${c.id}`,
        similarity: 0.7,
      })),
    ].slice(0, limit);

    return NextResponse.json(
      { results, query, mode: "ilike", latency_ms: Date.now() - t0 } satisfies SearchResponse,
      { headers: { "Cache-Control": "private, max-age=10" } }
    );
  } catch (err) {
    console.error("[search] ilike fallback failed:", err);
    return NextResponse.json(
      { error: "Search failed", results: [], query, mode: "ilike", latency_ms: 0 },
      { status: 500 }
    );
  }
}
