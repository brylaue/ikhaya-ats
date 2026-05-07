/**
 * GET /api/analytics/pay-transparency
 * US-423: Pay Transparency Compliance Report (admin-only).
 *
 * Surfaces three things admin/compliance need to answer regulator or
 * internal-policy questions:
 *  1. Jobs where the advertised range was disclosed vs. not (from jobs.show_salary_range)
 *  2. For disclosed jobs: how closely does offered match advertised?
 *  3. For accepted offers: distribution of accepted vs offered (the "counter
 *     lift" — how much does candidate pushback move the needle?)
 *
 * Optional window: ?from=YYYY-MM-DD&to=YYYY-MM-DD (defaults: trailing 180d).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAgencyContext } from "@/lib/supabase/agency-cache";
import { requirePlan } from "@/lib/api/require-plan";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const ctx = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["admin", "owner", "compliance"].includes(ctx.role)) {
    return NextResponse.json({ error: "Admin/owner/compliance only" }, { status: 403 });
  }

  // US-513: pay transparency report is Growth-tier analytics.
  const planGuard = await requirePlan(supabase, ctx.agencyId, "analytics");
  if (planGuard) return planGuard;

  const p = req.nextUrl.searchParams;
  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 180 * 86400 * 1000);
  const from = p.get("from") && /^\d{4}-\d{2}-\d{2}$/.test(p.get("from")!) ? p.get("from")! : defaultFrom.toISOString().slice(0, 10);
  const to   = p.get("to")   && /^\d{4}-\d{2}-\d{2}$/.test(p.get("to")!)   ? p.get("to")!   : now.toISOString().slice(0, 10);

  // 1. Disclosure rate — US-505: scope to caller's agency. Without this the
  // report silently aggregated across tenants, leaking pay-band stats.
  const { data: jobs } = await supabase
    .from("jobs")
    .select("id, title, show_salary_range, salary_min, salary_max, created_at")
    .eq("agency_id", ctx.agencyId)
    .gte("created_at", from).lte("created_at", `${to}T23:59:59Z`);

  const jobsCount = (jobs ?? []).length;
  const disclosed = (jobs ?? []).filter((j) => j.show_salary_range && j.salary_min && j.salary_max).length;

  // 2 & 3. Offer-round data — we care about the "initial" vs "accepted" rounds per offer.
  // offer_rounds has no direct agency_id column, so scope via the parent offer.
  const { data: rounds } = await supabase
    .from("offer_rounds")
    .select("offer_id, round_type, offered_base_salary, accepted_base_salary, created_at, offers!inner(agency_id)")
    .eq("offers.agency_id", ctx.agencyId)
    .gte("created_at", from).lte("created_at", `${to}T23:59:59Z`);

  const byOffer = new Map<string, { initial?: number; accepted?: number }>();
  for (const r of rounds ?? []) {
    const b = byOffer.get(r.offer_id as string) ?? {};
    if (r.round_type === "initial" && typeof r.offered_base_salary === "number")      b.initial  = r.offered_base_salary as number;
    if (r.round_type === "accepted" && typeof r.accepted_base_salary === "number")    b.accepted = r.accepted_base_salary as number;
    byOffer.set(r.offer_id as string, b);
  }

  const lifts: number[] = [];
  let acceptedCount = 0;
  for (const v of byOffer.values()) {
    if (typeof v.initial === "number" && typeof v.accepted === "number" && v.initial > 0) {
      lifts.push(((v.accepted - v.initial) / v.initial) * 100);
      acceptedCount += 1;
    }
  }
  const avgLift = lifts.length
    ? Math.round((lifts.reduce((s, x) => s + x, 0) / lifts.length) * 100) / 100
    : null;

  return NextResponse.json({
    window: { from, to },
    disclosure: {
      total_jobs_in_window: jobsCount,
      disclosed_jobs: disclosed,
      disclosure_rate_pct: jobsCount > 0 ? Math.round((disclosed / jobsCount) * 100) : null,
    },
    negotiation: {
      offers_with_initial_and_accepted: acceptedCount,
      avg_counter_lift_pct: avgLift,
      max_counter_lift_pct: lifts.length ? Math.round(Math.max(...lifts) * 100) / 100 : null,
      min_counter_lift_pct: lifts.length ? Math.round(Math.min(...lifts) * 100) / 100 : null,
    },
  });
}
