/**
 * lib/api/require-plan.ts
 * US-512: Server-side plan-tier enforcement for gated API routes.
 *
 * Usage (inside an App Router route handler):
 *
 *   const ctx = await getAgencyContext(supabase);
 *   if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 *
 *   const guard = await requirePlan(supabase, ctx.agencyId, "ai_match_scoring");
 *   if (guard) return guard;   // 403 response — short-circuit
 *
 *   // …the caller's plan is entitled to this feature, proceed.
 *
 * Why this pattern: returning the Response directly keeps route handlers a
 * single line of guard. Returning `null` on success means the happy path
 * reads naturally.
 *
 * Resolution order:
 *   1. Per-agency `feature_overrides[feature] === true`  → entitled
 *   2. Per-agency `feature_overrides[feature] === false` → denied
 *   3. planAtLeast(agency.plan, FEATURES[feature].minPlan)
 */
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FEATURES, hasFeature, type FeatureKey, type Plan } from "@/lib/feature-flags";

type AgencyPlanRow = {
  plan:              Plan | null;
  feature_overrides: Record<string, boolean> | null;
};

/**
 * Returns a 403 Response if the agency's plan (or feature_overrides) does not
 * entitle them to `feature`; returns `null` to signal the caller may proceed.
 *
 * Never throws on DB errors — on failure we fail CLOSED (deny) because this
 * is the billing gate and treating missing plan data as Enterprise would be
 * worse than the occasional false 403 during an outage.
 */
export async function requirePlan(
  supabase: SupabaseClient,
  agencyId: string,
  feature:  FeatureKey,
): Promise<Response | null> {
  const def = FEATURES[feature];
  if (!def) {
    // Unknown feature keys are treated as denied — developer mistake, but
    // don't silently grant access.
    return NextResponse.json(
      { error: "unknown_feature", feature },
      { status: 500 },
    );
  }

  const { data, error } = await supabase
    .from("agencies")
    .select("plan, feature_overrides")
    .eq("id", agencyId)
    .maybeSingle<AgencyPlanRow>();

  if (error || !data) {
    return NextResponse.json(
      {
        error:        "plan_lookup_failed",
        feature,
        requiredPlan: def.minPlan,
      },
      { status: 403 },
    );
  }

  const ok = hasFeature(data.plan, feature, data.feature_overrides ?? undefined);
  if (ok) return null;

  return NextResponse.json(
    {
      error:        "upgrade_required",
      feature,
      requiredPlan: def.minPlan,
      upgradeNote:  def.upgradeNote ?? null,
      // Matching FeatureGate's expected payload so the client can present a
      // consistent upgrade CTA whether the block came from UI or API.
      upgrade_required: true,
    },
    { status: 403 },
  );
}

/**
 * Convenience wrapper that looks up both context and plan in one call.
 * Useful when every enforcement point needs both the agency context AND the
 * plan check.
 */
export async function requireContextAndPlan(
  supabase: SupabaseClient,
  feature:  FeatureKey,
): Promise<
  | { ok: true;  agencyId: string; userId: string; role: string }
  | { ok: false; response: Response }
> {
  // Intentional local import to avoid a cycle if agency-cache ever pulls this in.
  const { getAgencyContext } = await import("@/lib/supabase/agency-cache");

  const ctx = await getAgencyContext(supabase);
  if (!ctx) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const guard = await requirePlan(supabase, ctx.agencyId, feature);
  if (guard) return { ok: false, response: guard };

  return { ok: true, ...ctx };
}
