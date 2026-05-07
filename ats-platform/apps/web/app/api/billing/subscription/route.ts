/**
 * GET /api/billing/subscription
 * US-468/469: Returns current subscription state for the agency's billing UI.
 *
 * Response: {
 *   plan: string;
 *   subscriptionStatus: string;
 *   subscriptionPeriodEnd: string | null;
 *   trialEndsAt: string | null;
 *   cancelAtPeriodEnd: boolean;
 *   stripeCustomerId: string | null;
 *   hasSubscription: boolean;
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@/lib/supabase/server";
import { getAgencyContext }           from "@/lib/supabase/agency-cache";

export async function GET(req: NextRequest) {
  void req; // unused but required by Next.js
  const supabase = await createClient();
  const ctx      = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: agency, error } = await supabase
    .from("agencies")
    .select(
      "plan, subscription_status, subscription_period_end, trial_ends_at, cancel_at_period_end, stripe_customer_id, stripe_subscription_id"
    )
    .eq("id", ctx.agencyId)
    .single();

  if (error || !agency) {
    return NextResponse.json({ error: "Agency not found" }, { status: 404 });
  }

  return NextResponse.json({
    plan:                  agency.plan ?? "trialing",
    subscriptionStatus:    agency.subscription_status,
    subscriptionPeriodEnd: agency.subscription_period_end ?? null,
    trialEndsAt:           agency.trial_ends_at ?? null,
    cancelAtPeriodEnd:     agency.cancel_at_period_end ?? false,
    stripeCustomerId:      agency.stripe_customer_id ?? null,
    hasSubscription:       !!agency.stripe_subscription_id,
  });
}
