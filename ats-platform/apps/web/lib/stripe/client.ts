/**
 * Stripe SDK singleton.
 * Import `stripe` for server-side Stripe API calls.
 * Import `getStripePublicKey` for client-side Stripe.js initialization.
 *
 * The Stripe client is created lazily on first use so that build-time page
 * data collection (which loads route modules without runtime env vars) does
 * not throw. Existing call sites continue to use `stripe.<method>()` exactly
 * as before via the proxy.
 */

import Stripe from "stripe";

let _stripe: Stripe | null = null;

function getStripeClient(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY environment variable is not set");
  }
  _stripe = new Stripe(key, {
    apiVersion: "2025-02-24.acacia",
    typescript: true,
  });
  return _stripe;
}

export const stripe = new Proxy({} as Stripe, {
  get(_target, prop, receiver) {
    const client = getStripeClient();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export function getStripePublicKey(): string {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!key) throw new Error("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set");
  return key;
}
