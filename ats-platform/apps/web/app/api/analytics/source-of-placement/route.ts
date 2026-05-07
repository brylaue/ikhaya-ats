/**
 * GET /api/analytics/source-of-placement
 * US-065: Source-of-Placement analytics.
 *
 * Breaks down placements by the `source` recorded on the candidate. This is
 * the real ROI question — "are LinkedIn Recruiter placements actually worth
 * the seat cost, or is referral cheaper per hire?".
 *
 * Query: from, to (dates). Optional: company_id, owner_user_id.
 * Returns per-source: placements_count, total_fee, avg_time_to_placement_days,
 * and retention_gt_90 (placements still active after 90 days).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAgencyContext } from "@/lib/supabase/agency-cache";
import { requirePlan } from "@/lib/api/require-plan";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const ctx = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // US-513: analytics endpoints are Growth-tier.
  const planGuard = await requirePlan(supabase, ctx.agencyId, "analytics");
  if (planGuard) return planGuard;

  const p = req.nextUrl.searchParams;
  const from = p.get("from");
  const to   = p.get("to");

  let q = supabase.from("placements")
    .select(`
      id, placed_at, start_date, ended_at, fee_amount,
      candidate:candidates(id, source),
      job:jobs(id, company_id, owner_user_id)
    `);

  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) q = q.gte("placed_at", from);
  if (to   && /^\d{4}-\d{2}-\d{2}$/.test(to))   q = q.lte("placed_at", to);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const companyFilter = p.get("company_id");
  const ownerFilter   = p.get("owner_user_id");
  const ninetyDaysMs  = 90 * 86400 * 1000;

  type Bucket = {
    source: string;
    placements_count: number;
    total_fee: number;
    time_to_placement_days: number[];
    retention_gt_90: number;
    eligible_for_retention: number;
  };
  const bySource = new Map<string, Bucket>();

  for (const pl of data ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const job = pl.job as any;
    if (companyFilter && job?.company_id !== companyFilter) continue;
    if (ownerFilter   && job?.owner_user_id !== ownerFilter) continue;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const source = ((pl.candidate as any)?.source || "unknown") as string;
    const b = bySource.get(source) ?? {
      source, placements_count: 0, total_fee: 0,
      time_to_placement_days: [],
      retention_gt_90: 0, eligible_for_retention: 0,
    };
    b.placements_count += 1;
    b.total_fee += Number(pl.fee_amount ?? 0);

    if (pl.placed_at && pl.start_date) {
      const d = (new Date(pl.start_date as string).getTime() - new Date(pl.placed_at as string).getTime()) / 86400_000;
      if (Number.isFinite(d) && d >= 0) b.time_to_placement_days.push(d);
    }

    // Retention: 90 days after start_date, not ended or ended after day 90
    if (pl.start_date) {
      const startMs = new Date(pl.start_date as string).getTime();
      const age = Date.now() - startMs;
      if (age >= ninetyDaysMs) {
        b.eligible_for_retention += 1;
        if (!pl.ended_at || new Date(pl.ended_at as string).getTime() - startMs >= ninetyDaysMs) {
          b.retention_gt_90 += 1;
        }
      }
    }

    bySource.set(source, b);
  }

  const summary = Array.from(bySource.values())
    .map((b) => ({
      source: b.source,
      placements_count: b.placements_count,
      total_fee: b.total_fee,
      avg_time_to_placement_days: b.time_to_placement_days.length
        ? Math.round(b.time_to_placement_days.reduce((s, x) => s + x, 0) / b.time_to_placement_days.length)
        : null,
      retention_gt_90_pct: b.eligible_for_retention > 0
        ? Math.round((b.retention_gt_90 / b.eligible_for_retention) * 100)
        : null,
      retention_eligible_count: b.eligible_for_retention,
    }))
    .sort((a, b) => b.total_fee - a.total_fee);

  return NextResponse.json({ summary, window: { from, to } });
}
