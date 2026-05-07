/**
 * POST /api/billing/checkout
 * US-468: Stripe Checkout — creates a Checkout Session for a plan upgrade.
 *
 * Body: { plan: "starter" | "growth" | "pro" | "enterprise" }
 * Response: { url: string }  — redirect to Stripe-hosted checkout page
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@/lib/supabase/server";
import { getAgencyContext }           from "@/lib/supabase/agency-cache";
import { checkCsrf }                  from "@/lib/csrf";
import { stripe }                     from "@/lib/stripe/client";
import { getStripePriceId, PLAN_META, type PlanKey } from "@/lib/stripe/plans";

const VALID_PLANS: PlanKey[] = ["starter", "growth", "pro"];

export async function POST(req: NextRequest) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const ctx      = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { plan?: string };
  const plan = (body.plan ?? "") as PlanKey;

  if (!VALID_PLANS.includes(plan)) {
    return NextResponse.json(
      { error: `plan must be one of: ${VALID_PLANS.join(", ")}` },
      { status: 400 }
    );
  }

  // Load existing agency Stripe state
  const { data: agency, error: agencyErr } = await supabase
    .from("agencies")
    .select("stripe_customer_id, subscription_status, name")
    .eq("id", ctx.agencyId)
    .single();

  if (agencyErr || !agency) {
    return NextResponse.json({ error: "Agency not found" }, { status: 404 });
  }

  // Get the user's email for Stripe customer
  const { data: { user } } = await supabase.auth.getUser();
  const email = user?.email ?? ctx.userId;

  let customerId = agency.stripe_customer_id as string | null;

  // Create Stripe customer if this agency doesn't have one yet
  if (!customerId) {
    const customer = await stripe.customers.create({
      email,
      name:     agency.name as string,
      metadata: { agency_id: ctx.agencyId },
    });
    customerId = customer.id;

    // Persist immediately so other requests can find it
    await supabase
      .from("agencies")
      .update({ stripe_customer_id: customerId })
      .eq("id", ctx.agencyId);
  }

  const priceId = getStripePriceId(plan);
  const appUrl  = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const session = await stripe.checkout.sessions.create({
    customer:             customerId,
    mode:                 "subscription",
    line_items:           [{ price: priceId, quantity: 1 }],
    success_url:          `${appUrl}/settings/billing?checkout=success`,
    cancel_url:           `${appUrl}/settings/billing?checkout=cancelled`,
    allow_promotion_codes: true,
    subscription_data: {
      metadata: { agency_id: ctx.agencyId, plan },
    },
    metadata: { agency_id: ctx.agencyId, plan },
  });

  if (!session.url) {
    return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 });
  }

  return NextResponse.json({ url: session.url });
}
