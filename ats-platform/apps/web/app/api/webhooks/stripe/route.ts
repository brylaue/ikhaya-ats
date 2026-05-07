/**
 * POST /api/webhooks/stripe
 * US-470: Stripe webhook handler.
 *
 * Handles:
 *   - checkout.session.completed          → activate subscription
 *   - customer.subscription.updated       → sync status / period end
 *   - customer.subscription.deleted       → mark canceled
 *   - invoice.payment_failed              → mark past_due
 *
 * Idempotency: every inbound event is recorded in `billing_events` with the
 * stripe_event_id as a UNIQUE key. A duplicate delivery returns 200 immediately
 * without reprocessing.
 *
 * NOTE: This route must be excluded from CSRF middleware because Stripe signs
 * events with its own signature scheme. Verify via stripe.webhooks.constructEvent().
 */

import { NextRequest, NextResponse } from "next/server";
import { stripe }                     from "@/lib/stripe/client";
import { planFromPriceId }            from "@/lib/stripe/plans";
import { createServiceClient }        from "@/lib/supabase/service";
import type Stripe                    from "stripe";

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";

export async function POST(req: NextRequest) {
  // ── 1. Verify Stripe signature ──────────────────────────────────────────────

  const sig = req.headers.get("stripe-signature");
  if (!sig || !WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error("[stripe-webhook] signature verification failed", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // ── 2. Idempotency check ────────────────────────────────────────────────────
  // Service role bypasses RLS — billing_events is internal-only.

  const supabase = createServiceClient();

  // Determine agency from event metadata (set on checkout.session or subscription)
  const agencyId = extractAgencyId(event);

  const { error: insertError } = await supabase
    .from("billing_events")
    .insert({
      agency_id:      agencyId,
      stripe_event_id: event.id,
      event_type:     event.type,
      payload:        event.data as unknown as Record<string, unknown>,
    });

  if (insertError) {
    // Unique constraint violation → duplicate delivery → already processed
    if (insertError.code === "23505") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.error("[stripe-webhook] billing_events insert failed", insertError);
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }

  // ── 3. Dispatch ─────────────────────────────────────────────────────────────

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(supabase, event.data.object as Stripe.Checkout.Session);
        break;

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(supabase, event.data.object as Stripe.Subscription);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(supabase, event.data.object as Stripe.Subscription);
        break;

      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(supabase, event.data.object as Stripe.Invoice);
        break;

      default:
        // Unhandled event types — logged above; no action needed
        break;
    }
  } catch (err) {
    console.error(`[stripe-webhook] handler failed for ${event.type}`, err);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractAgencyId(event: Stripe.Event): string | null {
  const obj = event.data.object as unknown as Record<string, unknown>;
  // checkout.session and subscription both carry metadata.agency_id
  const meta = obj.metadata as Record<string, string> | null;
  return meta?.agency_id ?? null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceSupabase = Awaited<ReturnType<typeof import("@/lib/supabase/service")["createServiceClient"]>>;

async function handleCheckoutCompleted(supabase: ServiceSupabase, session: Stripe.Checkout.Session) {
  const agencyId = session.metadata?.agency_id;
  if (!agencyId) {
    console.warn("[stripe-webhook] checkout.session.completed missing agency_id");
    return;
  }

  const subscriptionId = session.subscription as string | null;
  if (!subscriptionId) return;

  // Retrieve full subscription to get plan details
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const priceId = sub.items.data[0]?.price?.id ?? null;
  const plan    = (session.metadata?.plan ?? planFromPriceId(priceId ?? "")) ?? "starter";

  await supabase
    .from("agencies")
    .update({
      stripe_customer_id:      session.customer as string,
      stripe_subscription_id:  subscriptionId,
      stripe_price_id:         priceId,
      subscription_status:     sub.status,
      subscription_period_end: sub.current_period_end
        ? new Date(sub.current_period_end * 1000).toISOString()
        : null,
      cancel_at_period_end:    sub.cancel_at_period_end,
      plan,
    })
    .eq("id", agencyId);
}

async function handleSubscriptionUpdated(supabase: ServiceSupabase, sub: Stripe.Subscription) {
  const agencyId = sub.metadata?.agency_id;
  if (!agencyId) {
    // Fall back: look up agency by stripe_subscription_id
    const { data } = await supabase
      .from("agencies")
      .select("id")
      .eq("stripe_subscription_id", sub.id)
      .single();
    if (!data) return;
    await syncSubscription(supabase, data.id, sub);
    return;
  }
  await syncSubscription(supabase, agencyId, sub);
}

async function syncSubscription(supabase: ServiceSupabase, agencyId: string, sub: Stripe.Subscription) {
  const priceId = sub.items.data[0]?.price?.id ?? null;
  const plan    = planFromPriceId(priceId ?? "") ?? undefined;

  const update: Record<string, unknown> = {
    stripe_subscription_id:  sub.id,
    stripe_price_id:         priceId,
    subscription_status:     sub.status,
    subscription_period_end: sub.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null,
    cancel_at_period_end:    sub.cancel_at_period_end,
  };

  if (plan) update.plan = plan;

  await supabase.from("agencies").update(update).eq("id", agencyId);
}

async function handleSubscriptionDeleted(supabase: ServiceSupabase, sub: Stripe.Subscription) {
  // Look up by subscription_id (metadata may be absent on delete events)
  const { data } = await supabase
    .from("agencies")
    .select("id")
    .eq("stripe_subscription_id", sub.id)
    .single();

  if (!data) return;

  await supabase
    .from("agencies")
    .update({
      subscription_status:    "canceled",
      cancel_at_period_end:   false,
      plan:                   "starter",   // revert to base tier
    })
    .eq("id", data.id);
}

async function handleInvoicePaymentFailed(supabase: ServiceSupabase, invoice: Stripe.Invoice) {
  const subscriptionId = invoice.subscription as string | null;
  if (!subscriptionId) return;

  const { data } = await supabase
    .from("agencies")
    .select("id")
    .eq("stripe_subscription_id", subscriptionId)
    .single();

  if (!data) return;

  await supabase
    .from("agencies")
    .update({ subscription_status: "past_due" })
    .eq("id", data.id);
}
