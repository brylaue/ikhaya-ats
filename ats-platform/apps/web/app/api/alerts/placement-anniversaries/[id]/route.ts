/**
 * POST /api/alerts/placement-anniversaries/[id]
 * US-231: Recruiter actions on a placement anniversary alert.
 *
 * Body: { action: "dismiss" | "engage" | "snooze", snoozeDays?: number }
 *
 *   - dismiss  → status = 'dismissed', dismissed_at = now()
 *                (recruiter saw it, decided not worth acting on)
 *   - engage   → status = 'engaged',   engaged_at   = now(), engaged_by = user
 *                (recruiter started an outreach / created a task from it)
 *   - snooze   → status = 'snoozed',   snoozed_until = today + snoozeDays
 *                (not now — remind me in N days; defaults to 30)
 *
 * RLS update policy (from migration 065) enforces `agency_id = current_agency_id()`
 * so we don't need to re-check the caller's agency here. CSRF guard is applied.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAgencyContext } from "@/lib/supabase/agency-cache";
import { checkCsrf }    from "@/lib/csrf";
import { requirePlan }  from "@/lib/api/require-plan";

const VALID_ACTIONS = ["dismiss", "engage", "snooze"] as const;
type Action = (typeof VALID_ACTIONS)[number];

function isAction(v: unknown): v is Action {
  return typeof v === "string" && (VALID_ACTIONS as readonly string[]).includes(v);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const ctx      = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // US-513: placement anniversary alerts are Pro-tier.
  const planGuard = await requirePlan(supabase, ctx.agencyId, "alerts_escalations");
  if (planGuard) return planGuard;

  const { id } = await params;

  let body: { action?: unknown; snoozeDays?: unknown } = {};
  try { body = await req.json(); } catch { /* empty body ok */ }

  const action = body.action;
  if (!isAction(action)) {
    return NextResponse.json({ error: "action must be dismiss|engage|snooze" }, { status: 400 });
  }

  const now = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: Record<string, any> = {};

  if (action === "dismiss") {
    patch.status       = "dismissed";
    patch.dismissed_at = now;
  } else if (action === "engage") {
    patch.status     = "engaged";
    patch.engaged_at = now;
    patch.engaged_by = ctx.userId;
  } else {
    const snoozeDaysRaw = Number(body.snoozeDays ?? 30);
    const snoozeDays    = Number.isFinite(snoozeDaysRaw)
      ? Math.min(365, Math.max(1, Math.floor(snoozeDaysRaw)))
      : 30;
    const snoozedUntil = new Date(Date.now() + snoozeDays * 86_400_000)
      .toISOString().slice(0, 10);
    patch.status        = "snoozed";
    patch.snoozed_until = snoozedUntil;
  }

  const { data, error } = await supabase
    .from("placement_anniversaries")
    .update(patch)
    .eq("id", id)
    .select("id, status, snoozed_until, dismissed_at, engaged_at, engaged_by")
    .single();

  if (error) {
    // RLS mismatch, row missing, or schema drift all bubble up here —
    // return 404-ish rather than leaking the DB detail.
    console.error(`[placement-anniv action=${action}] error:`, error);
    return NextResponse.json({ error: "Could not update alert" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, alert: data });
}
