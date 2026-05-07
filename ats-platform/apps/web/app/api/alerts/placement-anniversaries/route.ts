/**
 * GET /api/alerts/placement-anniversaries
 * US-231: List placement anniversary & backfill alerts for the caller's agency.
 *
 * Query params:
 *   - status=open|dismissed|engaged|snoozed   (default: "open")
 *   - kind=candidate_reengage|client_backfill (optional filter)
 *   - limit=N (default 100, cap 500)
 *
 * Reads from `placement_anniversaries_view` so the client gets candidate /
 * company / job names without a second query. RLS on the base table enforces
 * agency scoping — the user-scoped supabase client can only see its own.
 *
 * Snoozed alerts whose snoozed_until has passed are surfaced as "open" in the
 * UI without touching the DB — the filter below handles that transparently.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAgencyContext } from "@/lib/supabase/agency-cache";
import { requirePlan } from "@/lib/api/require-plan";

const MAX_LIMIT = 500;

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const ctx      = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // US-513: placement anniversary alerts are Pro-tier.
  const planGuard = await requirePlan(supabase, ctx.agencyId, "alerts_escalations");
  if (planGuard) return planGuard;

  const params = req.nextUrl.searchParams;
  const status = params.get("status") ?? "open";
  const kind   = params.get("kind");

  let limit = Number(params.get("limit") ?? 100);
  if (!Number.isFinite(limit) || limit <= 0) limit = 100;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  if (!["open", "dismissed", "engaged", "snoozed"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  if (kind && !["candidate_reengage", "client_backfill"].includes(kind)) {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }

  let query = supabase
    .from("placement_anniversaries_view")
    .select(`
      id, placement_id, candidate_id, company_id, job_id,
      milestone_months, alert_kind, anniversary_date, status,
      snoozed_until, rationale, created_at,
      candidate_first_name, candidate_last_name, candidate_email,
      candidate_current_title, company_name, job_title
    `)
    .eq("status", status)
    .order("anniversary_date", { ascending: false })
    .limit(limit);

  if (kind) query = query.eq("alert_kind", kind);

  // For status=open, hide rows that are currently snoozed into the future.
  // We DON'T auto-flip them back — the UI and snooze action share the same
  // semantics: "open" includes anything not deliberately hidden.
  const today = new Date().toISOString().slice(0, 10);
  if (status === "open") {
    query = query.or(`snoozed_until.is.null,snoozed_until.lte.${today}`);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[placement-anniversaries list] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Group by kind for the dashboard card — the frontend can still use the
  // flat `items` array if it wants its own grouping.
  const items = data ?? [];
  const byKind = {
    candidate_reengage: items.filter((r) => r.alert_kind === "candidate_reengage"),
    client_backfill:    items.filter((r) => r.alert_kind === "client_backfill"),
  };

  return NextResponse.json({
    items,
    byKind,
    counts: {
      total:              items.length,
      candidate_reengage: byKind.candidate_reengage.length,
      client_backfill:    byKind.client_backfill.length,
    },
  });
}
