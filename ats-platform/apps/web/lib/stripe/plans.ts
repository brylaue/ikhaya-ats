/**
 * Plan → Stripe Price ID mapping.
 *
 * Price IDs are stored in environment variables so they can differ between
 * test and production Stripe environments without code changes.
 *
 * ENV vars expected:
 *   STRIPE_PRICE_STARTER_MONTHLY
 *   STRIPE_PRICE_GROWTH_MONTHLY
 *   STRIPE_PRICE_PRO_MONTHLY
 *   STRIPE_PRICE_ENTERPRISE_MONTHLY
 *
 * Plan names must match the `plan` column CHECK constraint on `agencies`.
 */

export type PlanKey = "starter" | "growth" | "pro" | "enterprise";

export interface PlanMeta {
  label:         string;
  priceMonthly:  number;   // display price in USD cents
  seats:         number;   // -1 = unlimited
  features:      string[];
}

export const PLAN_META: Record<PlanKey, PlanMeta> = {
  starter: {
    label:        "Starter",
    priceMonthly: 4900,
    seats:        3,
    features: [
      "Up to 3 team members",
      "Unlimited job postings",
      "Candidate pipeline",
      "Email integration",
      "Chrome extension",
    ],
  },
  growth: {
    label:        "Growth",
    priceMonthly: 9900,
    seats:        10,
    features: [
      "Up to 10 team members",
      "Everything in Starter",
      "AI talent search",
      "Interview prep AI",
      "Custom email domain",
      "Client portal",
    ],
  },
  pro: {
    label:        "Pro",
    priceMonthly: 19900,
    seats:        -1,
    features: [
      "Unlimited team members",
      "Everything in Growth",
      "BYO AI model",
      "Zapier / Make integration",
      "Advanced analytics",
      "Priority support",
    ],
  },
  enterprise: {
    label:        "Enterprise",
    priceMonthly: 0,   // custom pricing
    seats:        -1,
    features: [
      "Everything in Pro",
      "SSO / SAML",
      "SCIM provisioning",
      "Custom SLA",
      "Dedicated CSM",
    ],
  },
};

/** Returns the Stripe monthly Price ID for a given plan. */
export function getStripePriceId(plan: PlanKey): string {
  const envKey = `STRIPE_PRICE_${plan.toUpperCase()}_MONTHLY`;
  const priceId = process.env[envKey];
  if (!priceId) throw new Error(`${envKey} environment variable is not set`);
  return priceId;
}

/** Resolves a Stripe Price ID back to a plan key. Returns null if unknown. */
export function planFromPriceId(priceId: string): PlanKey | null {
  const plans: PlanKey[] = ["starter", "growth", "pro", "enterprise"];
  for (const p of plans) {
    try {
      if (getStripePriceId(p) === priceId) return p;
    } catch {
      // env var not set — skip
    }
  }
  return null;
}
