/**
 * US-511: Variant assignment for an experiment.
 *
 * Two-phase resolution:
 *   1. Read sticky assignment from experiment_assignments. If present, return.
 *   2. Otherwise, evaluate targeting (status=running, plan match, allow/deny,
 *      rollout %), pick a variant by weighted hash, and persist.
 *
 * Sticky on (agency_id, user_id) so the same user always sees the same variant
 * across sessions and devices.
 *
 * Determinism: variant chosen by hash of (experimentId, agencyId, userId)
 * mod 100, then walked through the cumulative weight bands. This means even
 * before the row is persisted, repeated lookups for the same user produce
 * the same answer — failure to write the assignment doesn't cause flicker.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

interface Variant { key: string; weight: number }

interface Experiment {
  id:               string;
  key:              string;
  status:           "draft" | "running" | "paused" | "completed";
  variants:         Variant[];
  rollout_pct:      number;
  target_plans:     string[] | null;
  agency_allowlist: string[] | null;
  agency_denylist:  string[] | null;
}

export interface AssignmentInput {
  agencyId: string;
  userId:   string;
  plan:     string;
}

const HOLDOUT_KEY = "_holdout";  // returned when user is outside rollout %

/** Stable 0-99 bucket for (experimentId, agencyId, userId). */
function bucketOf(experimentId: string, agencyId: string, userId: string): number {
  const h = createHash("sha256").update(`${experimentId}:${agencyId}:${userId}`).digest();
  return h.readUInt32BE(0) % 100;
}

/** Pick a variant using cumulative weights and the same bucket. */
function pickVariant(variants: Variant[], bucket: number): string {
  const totalWeight = variants.reduce((s, v) => s + v.weight, 0) || 1;
  // Re-bucket inside the 0-totalWeight space.
  const target = (bucket / 100) * totalWeight;
  let cumulative = 0;
  for (const v of variants) {
    cumulative += v.weight;
    if (target < cumulative) return v.key;
  }
  return variants[variants.length - 1]?.key ?? "control";
}

export function evaluateAssignment(exp: Experiment, input: AssignmentInput): string | null {
  // Targeting gates
  if (exp.status !== "running") return null;
  if (exp.target_plans && exp.target_plans.length > 0 && !exp.target_plans.includes(input.plan)) return null;
  if (exp.agency_denylist && exp.agency_denylist.includes(input.agencyId)) return null;

  // Allowlist short-circuits rollout %
  const allowlisted = exp.agency_allowlist && exp.agency_allowlist.includes(input.agencyId);
  const bucket = bucketOf(exp.id, input.agencyId, input.userId);

  if (!allowlisted && bucket >= exp.rollout_pct) return HOLDOUT_KEY;
  return pickVariant(exp.variants, bucket);
}

/**
 * Resolve an experiment for a user, returning the variant key (or null if
 * the experiment doesn't exist / isn't running). Persists the assignment
 * on first call so future lookups are stable even if the experiment config
 * later changes.
 */
export async function resolveExperiment(
  db: SupabaseClient,
  experimentKey: string,
  input: AssignmentInput,
): Promise<string | null> {
  const { data: exp } = await db
    .from("experiments")
    .select("id, key, status, variants, rollout_pct, target_plans, agency_allowlist, agency_denylist")
    .eq("key", experimentKey)
    .maybeSingle();

  if (!exp) return null;

  // 1. Sticky assignment?
  const { data: existing } = await db
    .from("experiment_assignments")
    .select("variant_key")
    .eq("experiment_id", exp.id)
    .eq("agency_id", input.agencyId)
    .eq("user_id", input.userId)
    .maybeSingle();

  if (existing?.variant_key) return existing.variant_key;

  // 2. Compute + persist
  const variant = evaluateAssignment(exp as Experiment, input);
  if (!variant) return null;

  // Skip persisting holdouts — they're cheap to recompute and we don't want
  // to fill the table with rows for users who aren't in the experiment.
  if (variant !== HOLDOUT_KEY) {
    try {
      await db.from("experiment_assignments").insert({
        experiment_id: exp.id,
        agency_id:     input.agencyId,
        user_id:       input.userId,
        variant_key:   variant,
      }).select().maybeSingle();
    } catch {
      // unique-constraint races are fine
    }
  }

  return variant;
}
