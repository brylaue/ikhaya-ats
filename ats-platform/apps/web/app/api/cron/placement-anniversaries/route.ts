/**
 * GET /api/cron/placement-anniversaries
 * US-231: Nightly materialiser for placement-anniversary & backfill alerts.
 *
 * For every active placement whose start_date is exactly N months ago (for
 * N in 18, 24, 36) we upsert TWO rows into placement_anniversaries:
 *
 *   - candidate_reengage  → "Jane was placed at Acme 24mo ago; prime window
 *                           to ask if she's thinking about her next move"
 *   - client_backfill     → "Jane is ~18mo into Acme; agencies who line up a
 *                           backfill before she churns win the requisition"
 *
 * The UNIQUE (placement_id, milestone_months, alert_kind) constraint in
 * migration 065 keeps this idempotent — re-running the cron the same day
 * (or re-running after a missed window) will ON CONFLICT DO NOTHING, so a
 * recruiter's dismissed/snoozed state never gets clobbered.
 *
 * Protected by CRON_SECRET bearer token (same pattern as other cron routes).
 * Schedule: once per day, ideally 06:00 local so alerts are on the dashboard
 * before recruiters start their day.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@supabase/supabase-js";

const MILESTONES_MONTHS = [18, 24, 36] as const;

// Placements marked as falloff or whose guarantee already breached don't
// belong in re-engagement campaigns — they're already a failed relationship.
// The cron skips them via filters below.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function checkCronSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail-closed
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

interface PlacementRow {
  id:            string;
  agency_id:     string;
  candidate_id:  string;
  job_id:        string | null;
  start_date:    string | null;
  // from joined jobs
  jobs: { company_id: string | null; title: string | null } | null;
  // from joined candidates
  candidates: { first_name: string | null; last_name: string | null } | null;
  // from joined companies (via job)
  company_name?: string;
}

type AlertKind = "candidate_reengage" | "client_backfill";

function buildRationale(kind: AlertKind, months: number, candidateName: string, companyName: string): string {
  if (kind === "candidate_reengage") {
    // Candidate-side framing: call the recruiter's attention to a
    // historically high-churn window in the candidate's tenure.
    if (months === 18) return `${candidateName} is ~18mo into ${companyName} — the first "itch to move" window opens now. Worth a warm check-in before a competitor reaches out.`;
    if (months === 24) return `${candidateName} hit the 2-year mark at ${companyName}. This is peak re-engagement territory — equity vests, role fatigue, prime market value all align.`;
    if (months === 36) return `${candidateName} is 3 years into ${companyName}. Deep tenure = deep network, but also increasing likelihood of a quiet exit. Good time to say hello.`;
    return `${candidateName} hit the ${months}-month mark at ${companyName}.`;
  }
  // client_backfill framing: recruiter's revenue opportunity at the employer.
  if (months === 18) return `Line up a potential backfill at ${companyName} — ${candidateName} is entering a higher-turnover window. Being first to the req if they leave is worth a proactive conversation with the hiring manager.`;
  if (months === 24) return `${candidateName} is at 2 years at ${companyName}. Industry churn data says there's meaningful probability of departure in the next 6-12 months. Offer ${companyName} a pre-emptive backfill slate.`;
  if (months === 36) return `${candidateName} has 3 years at ${companyName}. Talk to the hiring manager about succession planning — turnover this deep almost always creates a req within 12 months.`;
  return `Backfill opportunity at ${companyName} — ${candidateName} is ${months} months in.`;
}

export async function GET(req: NextRequest) {
  if (!checkCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  // Today's date (UTC). Using UTC for the match is fine because placements
  // are date-only (no wall-clock component) — the worst case is an alert
  // firing a few hours early/late relative to the agency's local timezone,
  // which is imperceptible for a monthly-cadence surface.
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10); // YYYY-MM-DD

  const targetDates = MILESTONES_MONTHS.map((m) => {
    // Compute start_date = todayIso - m months.
    // Day-of-month drift at month-ends (e.g. Aug 31 + 6 months) is acceptable
    // — we snap to the last day of the target month via Date() semantics.
    const d = new Date(today);
    d.setMonth(d.getMonth() - m);
    return { months: m, startDate: d.toISOString().slice(0, 10) };
  });

  let totalInserted = 0;
  const perMilestone: { milestone: number; matched: number; inserted: number }[] = [];

  for (const { months, startDate } of targetDates) {
    // Fetch placements that started exactly `startDate` and are healthy.
    // Join candidate + job (for company_id + title) via nested selects —
    // PostgREST can resolve these via the FK graph.
    const { data: rows, error } = await db
      .from("placements")
      .select(`
        id, agency_id, candidate_id, job_id, start_date,
        is_falloff, guarantee_status,
        candidates!inner(first_name, last_name),
        jobs(company_id, title, companies(name))
      `)
      .eq("start_date", startDate)
      .eq("is_falloff", false);

    if (error) {
      console.error(`[placement-anniv] query error (m=${months}):`, error);
      continue;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const placements = (rows ?? []) as any[];
    perMilestone.push({ milestone: months, matched: placements.length, inserted: 0 });

    if (placements.length === 0) continue;

    // Build both alert kinds for every matched placement.
    const alertRows: Array<{
      agency_id:        string;
      placement_id:     string;
      candidate_id:     string;
      job_id:           string | null;
      company_id:       string | null;
      milestone_months: number;
      alert_kind:       AlertKind;
      anniversary_date: string;
      rationale:        string;
    }> = [];

    for (const p of placements) {
      const candidateName = `${p.candidates?.first_name ?? ""} ${p.candidates?.last_name ?? ""}`.trim() || "This candidate";
      const companyName   = p.jobs?.companies?.name ?? p.jobs?.title ?? "the client";
      const companyId     = p.jobs?.company_id ?? null;

      for (const kind of ["candidate_reengage", "client_backfill"] as const) {
        alertRows.push({
          agency_id:        p.agency_id,
          placement_id:     p.id,
          candidate_id:     p.candidate_id,
          job_id:           p.job_id,
          company_id:       companyId,
          milestone_months: months,
          alert_kind:       kind,
          anniversary_date: todayIso,
          rationale:        buildRationale(kind, months, candidateName, companyName),
        });
      }
    }

    if (alertRows.length === 0) continue;

    // Idempotent upsert keyed on the UNIQUE (placement_id, milestone, kind).
    // onConflict ignores — we never want to overwrite a recruiter's
    // dismissed/engaged/snoozed state once the row exists.
    const { data: upserted, error: upsertErr } = await db
      .from("placement_anniversaries")
      .upsert(alertRows, {
        onConflict: "placement_id,milestone_months,alert_kind",
        ignoreDuplicates: true,
      })
      .select("id");

    if (upsertErr) {
      console.error(`[placement-anniv] upsert error (m=${months}):`, upsertErr);
      continue;
    }

    const inserted = upserted?.length ?? 0;
    totalInserted += inserted;
    perMilestone[perMilestone.length - 1].inserted = inserted;
  }

  console.info(`[placement-anniv] done: ${totalInserted} new alerts`, perMilestone);

  return NextResponse.json({
    ok: true,
    totalInserted,
    perMilestone,
    date: todayIso,
  });
}
