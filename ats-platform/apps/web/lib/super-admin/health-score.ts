/**
 * US-465: Tenant health score calculation.
 *
 * Composite of four sub-scores, weighted mean:
 *   • activity   (35%) — recent logins, jobs, placements
 *   • adoption   (25%) — % of plan features actually used
 *   • reliability(20%) — inverse of recent error rate
 *   • payment    (20%) — subscription status
 *
 * All sub-scores are 0-100, higher = healthier. Risk band is auto-derived
 * from overall_score via banding thresholds.
 *
 * Invoked nightly by /api/super-admin/health/recompute (cron) and on-demand
 * by /super-admin/health page Refresh button.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const W_ACTIVITY    = 0.35;
const W_ADOPTION    = 0.25;
const W_RELIABILITY = 0.20;
const W_PAYMENT     = 0.20;

const PAYMENT_SCORE: Record<string, number> = {
  active:     100,
  trialing:    85,
  past_due:    40,
  unpaid:      20,
  incomplete:  60,
  paused:      50,
  canceled:    10,
};

export type RiskBand = "healthy" | "watch" | "at_risk" | "critical";

export function bandFor(score: number): RiskBand {
  if (score >= 80) return "healthy";
  if (score >= 60) return "watch";
  if (score >= 40) return "at_risk";
  return "critical";
}

export interface ComputeResult {
  agencyId:          string;
  activityScore:     number;
  adoptionScore:     number;
  reliabilityScore:  number;
  paymentScore:      number;
  overallScore:      number;
  riskBand:          RiskBand;
  detail:            Record<string, unknown>;
}

export async function computeHealthForAgency(
  db: SupabaseClient,
  agency: { id: string; plan: string; subscription_status: string | null },
): Promise<ComputeResult> {
  const sevenDaysAgo  = new Date(Date.now() - 7  * 86400 * 1000).toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400 * 1000).toISOString();

  // ── Activity ──────────────────────────────────────────────────────────────
  const [loginsRes, jobsRes, placementsRes] = await Promise.all([
    db.from("user_sessions").select("id", { count: "exact", head: true })
      .eq("agency_id", agency.id).gte("last_active", sevenDaysAgo),
    db.from("jobs").select("id", { count: "exact", head: true })
      .eq("agency_id", agency.id).gte("created_at", thirtyDaysAgo),
    db.from("placements").select("id", { count: "exact", head: true })
      .eq("agency_id", agency.id).gte("created_at", thirtyDaysAgo),
  ]);
  const logins7d  = loginsRes.count ?? 0;
  const jobs30d   = jobsRes.count ?? 0;
  const place30d  = placementsRes.count ?? 0;
  // Cap each contributor and weight: 50pt logins (1pt per session up to 50),
  // 30pt jobs (3pt per job up to 30), 20pt placements (5pt per placement up to 20).
  const activityScore = Math.min(100,
    Math.min(50, logins7d) +
    Math.min(30, jobs30d * 3) +
    Math.min(20, place30d * 5));

  // ── Adoption ──────────────────────────────────────────────────────────────
  const [connectorsRes, customReportsRes, mcpRes] = await Promise.all([
    db.from("agency_connectors").select("connector_key").eq("agency_id", agency.id).eq("enabled", true),
    db.from("custom_reports").select("id", { count: "exact", head: true }).eq("agency_id", agency.id),
    db.from("mcp_oauth_clients").select("id", { count: "exact", head: true }).eq("agency_id", agency.id),
  ]);
  const featuresUsed = (connectorsRes.data?.length ?? 0)
    + ((customReportsRes.count ?? 0) > 0 ? 1 : 0)
    + ((mcpRes.count ?? 0) > 0 ? 1 : 0);
  // 10pt per used feature, capped at 100.
  const adoptionScore = Math.min(100, featuresUsed * 10);

  // ── Reliability ───────────────────────────────────────────────────────────
  const [aiErrorsRes, syncErrorsRes] = await Promise.all([
    db.from("ai_usage_events").select("id", { count: "exact", head: true })
      .eq("agency_id", agency.id).not("error", "is", null).gte("occurred_at", sevenDaysAgo),
    db.from("agency_connectors").select("error_count_7d").eq("agency_id", agency.id),
  ]);
  const aiErrors7d   = aiErrorsRes.count ?? 0;
  const syncErrors7d = (syncErrorsRes.data ?? []).reduce((s, r) => s + (r.error_count_7d ?? 0), 0);
  // Start at 100, lose 2 per error, floor at 0.
  const reliabilityScore = Math.max(0, 100 - (aiErrors7d + syncErrors7d) * 2);

  // ── Payment ───────────────────────────────────────────────────────────────
  const paymentScore = PAYMENT_SCORE[agency.subscription_status ?? "trialing"] ?? 50;

  // ── Composite ─────────────────────────────────────────────────────────────
  const overallScore = Math.round(
    activityScore    * W_ACTIVITY +
    adoptionScore    * W_ADOPTION +
    reliabilityScore * W_RELIABILITY +
    paymentScore     * W_PAYMENT
  );

  return {
    agencyId:          agency.id,
    activityScore,
    adoptionScore,
    reliabilityScore,
    paymentScore,
    overallScore,
    riskBand:          bandFor(overallScore),
    detail: {
      logins7d, jobs30d, place30d, featuresUsed,
      aiErrors7d, syncErrors7d,
      subscriptionStatus: agency.subscription_status,
    },
  };
}
