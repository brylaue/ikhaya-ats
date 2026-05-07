/**
 * Cron helper — renews Gmail Pub/Sub watches and Microsoft Graph subscriptions
 * that are expiring within the next 48 hours.
 *
 * Called by POST /api/email/refresh-subscriptions (secured with CRON_SECRET).
 *
 * Gmail watches expire after 7 days; Graph subscriptions after up to 3 days
 * (mail resource).  We renew early so we don't miss a window.
 *
 * Stage 8.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { gmailAdapter } from "./gmail-adapter";
import { graphAdapter } from "./graph-adapter";

const RENEWAL_WINDOW_MS = 12 * 60 * 60 * 1000; // renew when < 12h remaining (per spec)

export async function refreshExpiredSubscriptions(
  supabase: SupabaseClient
): Promise<{ renewed: number; errors: number }> {
  const cutoff = new Date(Date.now() + RENEWAL_WINDOW_MS).toISOString();

  // Find connections with realtime subscriptions expiring soon (or already expired)
  const { data: connections, error } = await supabase
    .from("provider_connections")
    .select("*")
    .not("realtime_subscription_id", "is", null)
    .lte("realtime_expires_at", cutoff);

  if (error) {
    console.error("subscription-refresher: query failed:", error);
    return { renewed: 0, errors: 1 };
  }

  if (!connections?.length) {
    console.log("subscription-refresher: no subscriptions expiring soon");
    return { renewed: 0, errors: 0 };
  }

  let renewed = 0;
  let errors = 0;

  for (const connection of connections) {
    try {
      const adapter = connection.provider === "google" ? gmailAdapter : graphAdapter;

      // Build a minimal Subscription handle from the stored row
      const sub = {
        id:        connection.realtime_subscription_id as string,
        expiresAt: connection.realtime_expires_at as string,
      };

      const renewed_sub = await adapter.renewSubscription(connection, sub);

      // Persist the new expiry
      await supabase
        .from("provider_connections")
        .update({
          realtime_subscription_id: renewed_sub.id,
          realtime_expires_at:      renewed_sub.expiresAt,
        })
        .eq("id", connection.id);

      console.log(
        `subscription-refresher: renewed ${connection.provider} subscription for ${connection.id}, new expiry: ${renewed_sub.expiresAt}`
      );
      renewed++;
    } catch (err) {
      console.error(
        `subscription-refresher: failed to renew ${connection.id}:`,
        err
      );
      errors++;
    }
  }

  return { renewed, errors };
}
