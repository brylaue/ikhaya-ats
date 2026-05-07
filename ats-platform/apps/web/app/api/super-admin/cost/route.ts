/**
 * GET /api/super-admin/cost
 * US-463: Per-tenant cost attribution.
 *
 * Aggregates three cost vectors per agency over a window (default 30d):
 *  • AI spend     — sum of ai_usage_events.estimated_cost_usd
 *  • Storage GB   — latest tenant_storage_snapshots.total_bytes
 *  • Seat count   — users (used to estimate seat cost from plan price)
 *
 * Plan-price lookup is in code (PLAN_SEAT_PRICE_USD) because Stripe is the
 * source of truth and these numbers are only ever a rough internal estimate.
 *
 * Optional ?days=N (default 30, max 90).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const SUPER_ADMIN_EMAILS = (process.env.SUPER_ADMIN_EMAILS ?? "")
  .split(",").map(e => e.trim().toLowerCase()).filter(Boolean);

// Rough internal estimate. Stripe invoice is authoritative — this is for
// at-a-glance "is this tenant profitable" attribution only.
const PLAN_SEAT_PRICE_USD: Record<string, number> = {
  starter:    49,
  growth:     99,
  pro:       199,
  enterprise: 399,
};
const STORAGE_PRICE_PER_GB_USD = 0.023;  // S3 standard, rough

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email || !SUPER_ADMIN_EMAILS.includes(user.email.toLowerCase())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const days = Math.min(90, Math.max(1, parseInt(req.nextUrl.searchParams.get("days") ?? "30", 10) || 30));
  const since = new Date(Date.now() - days * 86400 * 1000).toISOString();

  const db = createServiceClient();

  const [agenciesRes, usersRes, aiRes, storageRes] = await Promise.all([
    db.from("agencies").select("id, name, plan").order("name", { ascending: true }),
    db.from("users").select("agency_id"),
    db.from("ai_usage_events").select("agency_id, estimated_cost_usd, occurred_at")
      .gte("occurred_at", since),
    db.from("tenant_storage_snapshots").select("agency_id, total_bytes, snapshot_date")
      .order("snapshot_date", { ascending: false }),
  ]);

  if (agenciesRes.error) {
    return NextResponse.json({ error: agenciesRes.error.message }, { status: 500 });
  }

  const seatCount: Record<string, number> = {};
  for (const u of usersRes.data ?? []) {
    seatCount[u.agency_id] = (seatCount[u.agency_id] ?? 0) + 1;
  }

  const aiCost: Record<string, number> = {};
  for (const e of aiRes.data ?? []) {
    aiCost[e.agency_id] = (aiCost[e.agency_id] ?? 0) + Number(e.estimated_cost_usd ?? 0);
  }

  // pick first (newest) row per agency for storage
  const storageBytes: Record<string, number> = {};
  for (const s of storageRes.data ?? []) {
    if (!(s.agency_id in storageBytes)) storageBytes[s.agency_id] = Number(s.total_bytes ?? 0);
  }

  const rows = (agenciesRes.data ?? []).map((a: { id: string; name: string; plan: string }) => {
    const seats        = seatCount[a.id] ?? 0;
    const seatCost     = seats * (PLAN_SEAT_PRICE_USD[a.plan] ?? 0);
    const ai           = Math.round((aiCost[a.id] ?? 0) * 100) / 100;
    const storageGb    = (storageBytes[a.id] ?? 0) / 1_000_000_000;
    const storageCost  = Math.round(storageGb * STORAGE_PRICE_PER_GB_USD * 100) / 100;
    const totalCost    = Math.round((seatCost + ai + storageCost) * 100) / 100;
    // rev is monthly seat charge; cost is per-window AI+storage. Margin is
    // a rough ratio for prioritising "is this tenant under-water" investigation.
    const margin       = seatCost > 0 ? Math.round(((seatCost - ai - storageCost) / seatCost) * 100) : null;
    return {
      agencyId: a.id,
      name:     a.name,
      plan:     a.plan,
      seats,
      seatRevenueUsd: seatCost,
      aiCostUsd:      ai,
      storageGb:      Math.round(storageGb * 100) / 100,
      storageCostUsd: storageCost,
      totalCostUsd:   totalCost,
      marginPct:      margin,
    };
  });

  return NextResponse.json({ windowDays: days, rows });
}
