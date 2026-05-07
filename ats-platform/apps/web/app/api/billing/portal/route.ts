/**
 * POST /api/billing/portal
 * US-469: Stripe Billing Portal — creates a portal session so customers can
 * manage their subscription (update card, cancel, download invoices, etc.).
 *
 * Response: { url: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@/lib/supabase/server";
import { getAgencyContext }           from "@/lib/supabase/agency-cache";
import { checkCsrf }                  from "@/lib/csrf";
import { stripe }                     from "@/lib/stripe/client";

export async function POST(req: NextRequest) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const ctx      = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: agency } = await supabase
    .from("agencies")
    .select("stripe_customer_id")
    .eq("id", ctx.agencyId)
    .single();

  const customerId = agency?.stripe_customer_id as string | null;
  if (!customerId) {
    return NextResponse.json(
      { error: "No Stripe customer found — please subscribe first" },
      { status: 400 }
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const session = await stripe.billingPortal.sessions.create({
    customer:    customerId,
    return_url:  `${appUrl}/settings/billing`,
  });

  return NextResponse.json({ url: session.url });
}
