/**
 * GET /api/analytics/recruiter-ramp
 * US-066: Recruiter Ramp & Cohort analytics.
 *
 * For each recruiter (grouped by hire-date cohort), compute their key
 * productivity metrics at 30/60/90/180 days since hire:
 *  - submittals, interviews, placements
 *  - fee generated
 *  - activity count (calls + emails + meetings)
 *
 * Cohort window is set by ?cohort_month=YYYY-MM (optional — defaults to all).
 * Results support the "does the new-hire class of Feb 2026 ramp faster than
 * Nov 2025?" question agency ops lead keeps asking.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAgencyContext } from "@/lib/supabase/agency-cache";
import { requirePlan } from "@/lib/api/require-plan";

const MILESTONES = [30, 60, 90, 180] as const;

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const ctx = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // US-513: analytics endpoints are Growth-tier.
  const planGuard = await requirePlan(supabase, ctx.agencyId, "analytics");
  if (planGuard) return planGuard;

  const cohortMonth = req.nextUrl.searchParams.get("cohort_month"); // "2025-11"

  let usersQ = supabase
    .from("users")
    .select("id, first_name, last_name, email, hired_at, role")
    .eq("agency_id", ctx.agencyId)
    .not("hired_at", "is", null);
  if (cohortMonth && /^\d{4}-\d{2}$/.test(cohortMonth)) {
    usersQ = usersQ.gte("hired_at", `${cohortMonth}-01`).lt("hired_at", `${cohortMonth}-31`);
  }
  const { data: users, error: uerr } = await usersQ;
  if (uerr) return NextResponse.json({ error: uerr.message }, { status: 500 });

  const results = [];
  for (const u of users ?? []) {
    const hiredMs = new Date(u.hired_at as string).getTime();
    const milestones: Record<string, Record<string, number>> = {};

    for (const days of MILESTONES) {
      const endMs = hiredMs + days * 86400 * 1000;
      if (endMs > Date.now()) { milestones[`d${days}`] = { tenure_days: days, pending: 1 }; continue; }
      const start = new Date(hiredMs).toISOString();
      const end   = new Date(endMs).toISOString();

      const [subR, intR, plcR, actR] = await Promise.all([
        supabase.from("applications")
          .select("id", { count: "exact", head: true })
          .eq("submitted_by", u.id).gte("submitted_at", start).lte("submitted_at", end),
        supabase.from("scheduled_events")
          .select("id", { count: "exact", head: true })
          .eq("organizer_user_id", u.id).eq("event_type", "interview")
          .gte("start_time", start).lte("start_time", end),
        supabase.from("placements")
          .select("fee_amount", { count: "exact" })
          .eq("recruiter_user_id", u.id).gte("placed_at", start).lte("placed_at", end),
        supabase.from("activities")
          .select("id", { count: "exact", head: true })
          .eq("created_by", u.id).gte("created_at", start).lte("created_at", end),
      ]);

      const fee = (plcR.data ?? []).reduce((s, r) => s + Number(r.fee_amount ?? 0), 0);

      milestones[`d${days}`] = {
        tenure_days: days,
        submittals:  subR.count ?? 0,
        interviews:  intR.count ?? 0,
        placements:  plcR.count ?? 0,
        activities:  actR.count ?? 0,
        fee_generated: fee,
      };
    }

    results.push({
      user_id: u.id,
      name: `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || u.email,
      email: u.email,
      hired_at: u.hired_at,
      cohort_month: (u.hired_at as string)?.slice(0, 7),
      milestones,
    });
  }

  return NextResponse.json({ recruiters: results, cohort_month: cohortMonth });
}
