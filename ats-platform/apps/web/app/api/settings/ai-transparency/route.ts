/**
 * /api/settings/ai-transparency
 *
 * US-422: AI transparency admin surface.
 *
 *  GET   → { enabled, decisions, summary }
 *         - `decisions`: most-recent 200 rows from ai_decisions_enriched,
 *           filtered by ?type=, ?user=, ?from=, ?to=
 *         - `summary`: grouped counts by decision_type over the same window,
 *           useful for a "what's the LLM actually doing" at-a-glance
 *
 *  PATCH → { enabled }
 *         - Toggle agency-level `ai_transparency_enabled` flag.
 *         - Admins only (role check via agency-cache).
 *
 * Tenant scoping is enforced by RLS on ai_decisions + the user-scoped
 * client. We still double-check the agency id on the agency update so a
 * mis-scoped policy can't accidentally flip another tenant's flag.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@/lib/supabase/server";
import { getAgencyContext }           from "@/lib/supabase/agency-cache";
import { checkCsrf }                  from "@/lib/csrf";

const MAX_ROWS = 200;

// ── GET ─────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const ctx      = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const userFilter = searchParams.get("user");        // user_id uuid
  const fromRaw = searchParams.get("from");           // ISO date
  const toRaw   = searchParams.get("to");

  // Parallel: flag + rows + summary
  const [agencyRes, rowsRes, summaryRes] = await Promise.all([
    supabase
      .from("agencies")
      .select("ai_transparency_enabled")
      .eq("id", ctx.agencyId)
      .single(),
    (() => {
      let q = supabase
        .from("ai_decisions_enriched")
        .select(`
          id, decision_type, subject_type, subject_id, related_type, related_id,
          provider, model, model_card_url, rationale,
          visible_to_candidate, created_at,
          user_id, user_email, user_name,
          input_tokens, output_tokens, estimated_cost_usd, latency_ms
        `)
        .eq("agency_id", ctx.agencyId)
        .order("created_at", { ascending: false })
        .limit(MAX_ROWS);
      if (type)       q = q.eq("decision_type", type);
      if (userFilter) q = q.eq("user_id", userFilter);
      if (fromRaw)    q = q.gte("created_at", fromRaw);
      if (toRaw)      q = q.lte("created_at", toRaw);
      return q;
    })(),
    // Summary counts: group by decision_type via RPC would be ideal; we
    // fall back to a lightweight per-type count bundle using the last 30d.
    supabase
      .from("ai_decisions")
      .select("decision_type", { count: "exact", head: false })
      .eq("agency_id", ctx.agencyId)
      .gte("created_at", new Date(Date.now() - 30 * 86400_000).toISOString()),
  ]);

  if (rowsRes.error) {
    console.error("[ai-transparency GET] rows error:", rowsRes.error);
  }

  const counts: Record<string, number> = {};
  for (const r of (summaryRes.data ?? []) as { decision_type: string }[]) {
    counts[r.decision_type] = (counts[r.decision_type] ?? 0) + 1;
  }

  return NextResponse.json({
    enabled:   agencyRes.data?.ai_transparency_enabled ?? true,
    decisions: rowsRes.data ?? [],
    summary:   {
      window: "30d",
      countsByType: counts,
      total: (summaryRes.data ?? []).length,
    },
  });
}

// ── PATCH ────────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const ctx      = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Admins only — aligns with other agency-wide toggles (compliance, billing).
  if (ctx.role !== "admin" && ctx.role !== "owner") {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as { enabled?: boolean };
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled must be boolean" }, { status: 400 });
  }

  const { error } = await supabase
    .from("agencies")
    .update({ ai_transparency_enabled: body.enabled })
    .eq("id", ctx.agencyId);

  if (error) {
    console.error("[ai-transparency PATCH] update error:", error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ enabled: body.enabled });
}
