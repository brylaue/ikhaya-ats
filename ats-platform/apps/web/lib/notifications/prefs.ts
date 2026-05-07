/**
 * Notification pref helpers (US-478)
 *
 * Intended to be called from any future server-side notification dispatcher
 * (cron, route handler, edge function) before emitting email or in-app rows.
 *
 * Fail-open: if prefs row is missing or the read errors, default to allowed.
 * The alternative would risk silently dropping notifications during an outage.
 */

import { createServiceClient } from "@/lib/supabase/service";
import type { NotificationType, NotificationPrefsMap } from
  "@/app/api/settings/notification-prefs/route";

export type NotificationChannel = "email" | "inApp";

/**
 * Resolve whether a user should receive a notification on a given channel.
 * Defaults to true (allow) when no row exists or on any DB error.
 */
export async function shouldNotify(
  userId:  string,
  type:    NotificationType,
  channel: NotificationChannel
): Promise<boolean> {
  try {
    const db = createServiceClient();
    const { data } = await db
      .from("user_notification_prefs")
      .select("prefs")
      .eq("user_id", userId)
      .maybeSingle();
    const prefs = (data?.prefs ?? {}) as NotificationPrefsMap;
    const typePref = prefs[type];
    if (!typePref) return true;            // missing type → allow
    return typePref[channel] !== false;    // explicit false blocks, anything else allows
  } catch (err) {
    console.warn("[notifications/prefs] read failed, failing open:", err);
    return true;
  }
}

/**
 * Batch version — resolves prefs for many users in one query. Useful when
 * fanning out the same event (e.g. weekly digest) to every agency member.
 * Returns a map { userId → { email, inApp } } for the requested type.
 */
export async function getChannelsForUsers(
  userIds: string[],
  type:    NotificationType
): Promise<Map<string, { email: boolean; inApp: boolean }>> {
  const out = new Map<string, { email: boolean; inApp: boolean }>();
  if (userIds.length === 0) return out;

  try {
    const db = createServiceClient();
    const { data } = await db
      .from("user_notification_prefs")
      .select("user_id, prefs")
      .in("user_id", userIds);

    for (const row of data ?? []) {
      const prefs = (row.prefs ?? {}) as NotificationPrefsMap;
      const typePref = prefs[type] ?? { email: true, inApp: true };
      out.set(row.user_id, {
        email: typePref.email !== false,
        inApp: typePref.inApp !== false,
      });
    }
    // Default allow for any user without a row
    for (const uid of userIds) {
      if (!out.has(uid)) out.set(uid, { email: true, inApp: true });
    }
  } catch (err) {
    console.warn("[notifications/prefs] batch read failed, failing open:", err);
    for (const uid of userIds) out.set(uid, { email: true, inApp: true });
  }

  return out;
}
