/**
 * GET  /api/settings/notification-prefs
 * PUT  /api/settings/notification-prefs
 * US-478: Per-user notification preferences.
 *
 * Body (PUT): { prefs: Record<string, { email: boolean; inApp: boolean }> }
 *
 * `prefs` keys are notification type ids: stage_change, client_feedback,
 * task_due, outreach_reply, saved_search, placement, mention, weekly_summary,
 * new_candidate. Missing keys default to both channels = true.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@/lib/supabase/server";
import { getAgencyContext }          from "@/lib/supabase/agency-cache";
import { checkCsrf }                 from "@/lib/csrf";

export type NotificationChannelPref = { email: boolean; inApp: boolean };
export type NotificationPrefsMap    = Record<string, NotificationChannelPref>;

const NOTIFICATION_TYPES = [
  "new_candidate",
  "stage_change",
  "client_feedback",
  "task_due",
  "saved_search",
  "outreach_reply",
  "placement",
  "mention",
  "weekly_summary",
] as const;
export type NotificationType = typeof NOTIFICATION_TYPES[number];

function sanitize(input: unknown): NotificationPrefsMap {
  const out: NotificationPrefsMap = {};
  if (!input || typeof input !== "object") return out;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!(NOTIFICATION_TYPES as readonly string[]).includes(k)) continue;
    if (!v || typeof v !== "object") continue;
    const vv = v as Record<string, unknown>;
    out[k] = {
      email: vv.email !== false,  // default true when missing
      inApp: vv.inApp !== false,
    };
  }
  return out;
}

export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const ctx      = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("user_notification_prefs")
    .select("prefs, updated_at")
    .eq("user_id", ctx.userId)
    .maybeSingle();

  return NextResponse.json({
    prefs:     (data?.prefs ?? {}) as NotificationPrefsMap,
    updatedAt: data?.updated_at ?? null,
  });
}

export async function PUT(req: NextRequest) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const ctx      = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const prefs = sanitize((body as { prefs?: unknown }).prefs);

  const { data, error } = await supabase
    .from("user_notification_prefs")
    .upsert(
      { user_id: ctx.userId, agency_id: ctx.agencyId, prefs },
      { onConflict: "user_id" }
    )
    .select("prefs, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    prefs:     (data.prefs ?? {}) as NotificationPrefsMap,
    updatedAt: data.updated_at,
  });
}
