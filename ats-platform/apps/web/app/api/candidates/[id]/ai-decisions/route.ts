/**
 * GET /api/candidates/[id]/ai-decisions
 * US-422: Recruiter-facing AI decision history for a single candidate.
 *
 * Unlike the candidate-portal sibling, this includes *all* decisions
 * (visible_to_candidate true and false) — internal tooling like auto-tag,
 * boolean-search scaffolding etc. is fair game for the recruiter.
 *
 * Output is pulled from `ai_decisions_enriched` so we get actor email and
 * cost/latency from the joined ai_usage_event in a single round trip.
 *
 * RLS on the underlying table enforces agency scoping — the user-scoped
 * supabase client will only see rows for the caller's agency.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Confirm the candidate is visible to the caller. RLS already enforces
  // this on the candidates table; the select acts as our 404 gate.
  const { data: candidate } = await supabase
    .from("candidates")
    .select("id, agency_id")
    .eq("id", id)
    .maybeSingle();
  if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("ai_decisions_enriched")
    .select(`
      id, decision_type, subject_type, subject_id, related_type, related_id,
      provider, model, model_version, model_card_url, rationale,
      visible_to_candidate, created_at,
      user_email, user_name,
      input_tokens, output_tokens, estimated_cost_usd, latency_ms
    `)
    .eq("subject_type", "candidate")
    .eq("subject_id", id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[candidates/:id/ai-decisions] query error:", error);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  return NextResponse.json({ decisions: data ?? [] });
}
