/**
 * POST /api/super-admin/health/recompute
 * US-465: Recompute health snapshot for one tenant or all tenants.
 *
 * Body: { agencyId?: string }  — omit agencyId to recompute every tenant.
 * Should also be wired to nightly cron; this endpoint exists for ad-hoc
 * Refresh from the super-admin UI and for incident response.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { computeHealthForAgency } from "@/lib/super-admin/health-score";

const SUPER_ADMIN_EMAILS = (process.env.SUPER_ADMIN_EMAILS ?? "")
  .split(",").map(e => e.trim().toLowerCase()).filter(Boolean);

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email || !SUPER_ADMIN_EMAILS.includes(user.email.toLowerCase())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { agencyId?: string } = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }

  const db = createServiceClient();

  let agencies: { id: string; plan: string; subscription_status: string | null }[];
  if (body.agencyId) {
    const { data, error } = await db.from("agencies")
      .select("id, plan, subscription_status").eq("id", body.agencyId).single();
    if (error || !data) return NextResponse.json({ error: "Agency not found" }, { status: 404 });
    agencies = [data];
  } else {
    const { data, error } = await db.from("agencies").select("id, plan, subscription_status");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    agencies = data ?? [];
  }

  // Compute serially to avoid hammering the DB; small N (~hundreds) so OK.
  const inserts: any[] = [];
  for (const a of agencies) {
    const r = await computeHealthForAgency(db, a);
    inserts.push({
      agency_id:          r.agencyId,
      activity_score:     r.activityScore,
      adoption_score:     r.adoptionScore,
      reliability_score:  r.reliabilityScore,
      payment_score:      r.paymentScore,
      overall_score:      r.overallScore,
      risk_band:          r.riskBand,
      detail:             r.detail,
    });
  }

  const { error: insertErr } = await db.from("tenant_health_snapshots").insert(inserts);
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, recomputed: inserts.length });
}
