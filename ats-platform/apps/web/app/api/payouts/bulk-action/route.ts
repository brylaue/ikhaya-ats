/**
 * POST /api/payouts/bulk-action
 * US-106: Admin bulk state transitions on commission_splits.
 *
 * Body: { splitIds: string[], action: "approve" | "mark_paid" | "hold" | "unhold" }
 *
 *   approve    pending → approved
 *   mark_paid  approved → paid   (sets paid_at = now)
 *   hold       pending|approved → held
 *   unhold     held → pending
 *
 * The transitions are deliberately forward-only in the typical flow so a
 * misclick can't leap multiple states in one action. (approve → paid is the
 * one "double step" we forbid — marking something paid must go through the
 * explicit approval gate first.)
 *
 * RLS on commission_splits already scopes updates to the caller's agency, so
 * the UPDATE naturally ignores any ID the caller doesn't own.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAgencyContext } from "@/lib/supabase/agency-cache";
import { checkCsrf } from "@/lib/csrf";
import { requirePlan } from "@/lib/api/require-plan";

type Action = "approve" | "mark_paid" | "hold" | "unhold";
const VALID_ACTIONS: readonly Action[] = ["approve", "mark_paid", "hold", "unhold"] as const;

// Allowed current statuses for each action. Keeps bad transitions out.
const ALLOWED_FROM: Record<Action, readonly string[]> = {
  approve:   ["pending"],
  mark_paid: ["approved"],
  hold:      ["pending", "approved"],
  unhold:    ["held"],
};

export async function POST(req: NextRequest) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const ctx      = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // US-513: commission tracking is Pro-tier.
  const planGuard = await requirePlan(supabase, ctx.agencyId, "commission_split_tracking");
  if (planGuard) return planGuard;

  if (!["admin", "owner"].includes(ctx.role)) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as { splitIds?: unknown; action?: unknown };
  const action = body.action;
  if (typeof action !== "string" || !(VALID_ACTIONS as readonly string[]).includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
  const splitIds = Array.isArray(body.splitIds)
    ? body.splitIds.filter((x): x is string => typeof x === "string")
    : [];
  if (splitIds.length === 0) {
    return NextResponse.json({ error: "splitIds must be a non-empty array" }, { status: 400 });
  }
  if (splitIds.length > 500) {
    return NextResponse.json({ error: "Too many splits in one action (max 500)" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const typedAction = action as Action;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: Record<string, any> = {};
  switch (typedAction) {
    case "approve":   patch.payout_status = "approved";                             break;
    case "mark_paid": patch.payout_status = "paid"; patch.paid_at = now;            break;
    case "hold":      patch.payout_status = "held";                                 break;
    case "unhold":    patch.payout_status = "pending"; patch.paid_at = null;        break;
  }

  const { data, error } = await supabase
    .from("commission_splits")
    .update(patch)
    .in("id", splitIds)
    .in("payout_status", ALLOWED_FROM[typedAction] as string[])
    .select("id, payout_status, paid_at");

  if (error) {
    console.error(`[payouts/bulk-action ${action}] error:`, error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  const affected = data?.length ?? 0;
  const skipped  = splitIds.length - affected;

  return NextResponse.json({
    ok: true,
    action: typedAction,
    affected,
    skipped,
    // Surface skipped IDs so the UI can explain (e.g. "3 were already paid").
    skippedIds: splitIds.filter((id) => !data?.some((d) => d.id === id)),
    updated: data ?? [],
  });
}
