/**
 * GET /api/super-admin/billing
 * US-466: Per-tenant billing snapshot.
 *
 * For each tenant returns plan, subscription status, period end, MRR estimate
 * (from PLAN_MRR_USD), trial status, and recent webhook events.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const SUPER_ADMIN_EMAILS = (process.env.SUPER_ADMIN_EMAILS ?? "")
  .split(",").map(e => e.trim().toLowerCase()).filter(Boolean);

const PLAN_MRR_USD: Record<string, number> = {
  starter:    49,
  growth:     99,
  pro:       199,
  enterprise: 399,
};

export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email || !SUPER_ADMIN_EMAILS.includes(user.email.toLowerCase())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = createServiceClient();
  const [agenciesRes, usersRes, eventsRes] = await Promise.all([
    db.from("agencies").select(
      "id, name, plan, subscription_status, subscription_period_end, trial_ends_at, " +
      "stripe_customer_id, stripe_subscription_id, cancel_at_period_end, plan_expires_at"
    ).order("name"),
    db.from("users").select("agency_id"),
    db.from("billing_events").select("agency_id, event_type, processed_at")
      .order("processed_at", { ascending: false }).limit(500),
  ]);

  if (agenciesRes.error) return NextResponse.json({ error: agenciesRes.error.message }, { status: 500 });

  const seats: Record<string, number> = {};
  for (const u of usersRes.data ?? []) seats[u.agency_id] = (seats[u.agency_id] ?? 0) + 1;

  const eventsByAgency: Record<string, { event_type: string; processed_at: string }[]> = {};
  for (const e of eventsRes.data ?? []) {
    if (!e.agency_id) continue;
    eventsByAgency[e.agency_id] = eventsByAgency[e.agency_id] ?? [];
    if (eventsByAgency[e.agency_id].length < 5) {
      eventsByAgency[e.agency_id].push({ event_type: e.event_type, processed_at: e.processed_at });
    }
  }

  const rows = (agenciesRes.data ?? []).map((a: any) => {
    const seatCount = seats[a.id] ?? 0;
    const seatPrice = PLAN_MRR_USD[a.plan] ?? 0;
    const mrr = seatCount * seatPrice;
    return {
      agencyId:           a.id,
      name:               a.name,
      plan:               a.plan,
      seats:              seatCount,
      mrrUsd:             mrr,
      subscriptionStatus: a.subscription_status,
      stripeCustomerId:   a.stripe_customer_id,
      hasSubscription:    !!a.stripe_subscription_id,
      trialEndsAt:        a.trial_ends_at,
      periodEndsAt:       a.subscription_period_end,
      cancelAtPeriodEnd:  a.cancel_at_period_end,
      planExpiresAt:      a.plan_expires_at,
      recentEvents:       eventsByAgency[a.id] ?? [],
    };
  });

  // Aggregates
  const totalMrr = rows.reduce((s, r) => s + r.mrrUsd, 0);
  const buckets = rows.reduce((acc: Record<string, number>, r) => {
    const k = r.subscriptionStatus ?? "unknown";
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({ rows, totalMrr, statusCounts: buckets });
}
