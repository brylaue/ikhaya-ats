/**
 * GET /api/super-admin/health
 * US-465: Latest health score per tenant.
 *
 * Reads tenant_health_latest view. If no snapshot exists yet for an agency,
 * the agency is included with nulls so super-admin can spot it and trigger
 * a recompute.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const SUPER_ADMIN_EMAILS = (process.env.SUPER_ADMIN_EMAILS ?? "")
  .split(",").map(e => e.trim().toLowerCase()).filter(Boolean);

export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email || !SUPER_ADMIN_EMAILS.includes(user.email.toLowerCase())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = createServiceClient();
  const [agenciesRes, snapshotsRes] = await Promise.all([
    db.from("agencies").select("id, name, plan, subscription_status").order("name"),
    db.from("tenant_health_latest").select("*"),
  ]);

  const byAgency = new Map<string, any>();
  for (const s of snapshotsRes.data ?? []) byAgency.set(s.agency_id, s);

  const rows = (agenciesRes.data ?? []).map((a: any) => {
    const s = byAgency.get(a.id);
    return {
      agencyId:    a.id,
      name:        a.name,
      plan:        a.plan,
      computedAt:  s?.computed_at ?? null,
      activity:    s?.activity_score    ?? null,
      adoption:    s?.adoption_score    ?? null,
      reliability: s?.reliability_score ?? null,
      payment:     s?.payment_score     ?? null,
      overall:     s?.overall_score     ?? null,
      band:        s?.risk_band         ?? "unknown",
    };
  });

  const distribution = {
    healthy:   rows.filter(r => r.band === "healthy").length,
    watch:     rows.filter(r => r.band === "watch").length,
    at_risk:   rows.filter(r => r.band === "at_risk").length,
    critical:  rows.filter(r => r.band === "critical").length,
    unknown:   rows.filter(r => r.band === "unknown").length,
  };

  return NextResponse.json({ rows, distribution });
}
