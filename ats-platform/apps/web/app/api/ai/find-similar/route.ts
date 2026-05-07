/**
 * POST /api/ai/find-similar — US-495: Find More Like This
 *
 * Uses the source candidate's stored pgvector embedding to return the
 * top-N most similar candidates by cosine similarity.
 * Reuses the /api/ai/vector-search infrastructure from US-374.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAgencyContext } from "@/lib/supabase/agency-cache";
import { requirePlan } from "@/lib/api/require-plan";
import { checkCsrf } from "@/lib/csrf";

export async function POST(req: NextRequest) {
  try {
    // US-503: CSRF guard.
    const csrfErr = checkCsrf(req);
    if (csrfErr) return csrfErr;

    const supabase = await createClient();
    const ctx = await getAgencyContext(supabase);
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // US-499 / US-514: granular plan gate — ai_find_similar has its own key.
    const planGuard = await requirePlan(supabase, ctx.agencyId, "ai_find_similar");
    if (planGuard) return planGuard;

    const { candidateId, limit = 20, filters = {} } = await req.json();

    if (!candidateId) {
      return NextResponse.json({ error: "candidateId required" }, { status: 400 });
    }

    // Fetch source candidate's embedding (agency-scoped — rejects IDs from other agencies).
    const { data: source, error: sourceErr } = await supabase
      .from("candidate_embeddings")
      .select("embedding")
      .eq("candidate_id", candidateId)
      .eq("agency_id", ctx.agencyId)
      .maybeSingle();

    if (sourceErr) throw sourceErr;

    if (!source?.embedding) {
      return NextResponse.json({ error: "no_embedding", candidates: [] });
    }

    // Build base query for vector similarity search
    let query = supabase.rpc("match_candidates_by_vector", {
      query_embedding: source.embedding,
      agency_id_param: ctx.agencyId,
      match_count:     limit + 1, // +1 to exclude source
      match_threshold: 0.6,
    });

    // Apply optional filters
    if (filters.availableOnly) {
      query = query.neq("status", "placed");
    }
    if (filters.location) {
      query = query.ilike("location", `%${filters.location}%`);
    }

    const { data: results, error: searchErr } = await query;
    if (searchErr) throw searchErr;

    // Exclude the source candidate and cap results
    const candidates = (results ?? [])
      .filter((c: any) => c.id !== candidateId)
      .slice(0, limit)
      .map((c: any) => ({
        id:           c.id,
        firstName:    c.first_name,
        lastName:     c.last_name,
        headline:     c.headline,
        location:     c.location,
        status:       c.status,
        similarity:   c.similarity,
      }));

    return NextResponse.json({ candidates });
  } catch (err: any) {
    if (err?.name === "SyntaxError") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
