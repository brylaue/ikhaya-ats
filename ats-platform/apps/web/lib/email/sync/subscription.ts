/**
 * Subscription orchestrator — subscribes a provider connection to realtime
 * push notifications (Gmail Pub/Sub watch or Graph webhook subscription).
 *
 * Entry point: `subscribeFor(connectionId)`.
 *
 * Stage 8.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Subscription } from "@/types/email/provider";
import { gmailAdapter } from "../gmail-adapter";
import { graphAdapter } from "../graph-adapter";
import crypto from "crypto";

const webhookSecret = process.env.MS_GRAPH_WEBHOOK_CLIENT_STATE_SECRET ?? "";

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Build the HMAC-based clientState for Graph subscriptions.
 * Format: base64(connectionId + ":" + hmac-sha256(connectionId, secret))
 */
export function buildClientStateHmac(connectionId: string): string {
  const hmac = crypto
    .createHmac("sha256", webhookSecret)
    .update(connectionId)
    .digest("hex");
  return Buffer.from(`${connectionId}:${hmac}`).toString("base64");
}

// ─── Main orchestrator ──────────────────────────────────────────────────────

/**
 * Subscribe a provider connection to realtime push notifications.
 *
 * 1. Loads the connection from DB.
 * 2. Picks the correct adapter (gmail / graph).
 * 3. Calls `adapter.subscribeRealtime(conn, params)`.
 * 4. Stores the subscription handle (id + expiresAt) on the connection row.
 *
 * For Microsoft, this creates TWO subscriptions (inbox + sentitems).
 * The subscription IDs are stored as a JSON array in `realtime_subscription_id`.
 */
export async function subscribeFor(
  supabase: SupabaseClient,
  connectionId: string
): Promise<Subscription> {
  // 1. Load connection
  const { data: connection, error } = await supabase
    .from("provider_connections")
    .select("*")
    .eq("id", connectionId)
    .single();

  if (error || !connection) {
    throw new Error(`Connection ${connectionId} not found: ${error?.message}`);
  }

  // 2. Pick adapter + build params
  const isGoogle = connection.provider === "google";
  const adapter = isGoogle ? gmailAdapter : graphAdapter;

  const webhookUrl = isGoogle
    ? process.env.GOOGLE_PUBSUB_WEBHOOK_URL ?? ""
    : process.env.MS_GRAPH_WEBHOOK_URL ?? "";

  const clientStateHmac = isGoogle ? "" : buildClientStateHmac(connectionId);

  // 3. Subscribe
  const subscription = await adapter.subscribeRealtime(connection, {
    webhookUrl,
    clientStateHmac,
  });

  // 4. Store the handle
  await supabase
    .from("provider_connections")
    .update({
      realtime_subscription_id: subscription.id,
      realtime_expires_at: subscription.expiresAt,
      // For Google, also store the historyId as delta_cursor if provided
      ...(isGoogle && subscription.metadata?.historyId
        ? { delta_cursor: String(subscription.metadata.historyId) }
        : {}),
    })
    .eq("id", connectionId);

  console.log(
    `subscribeFor: ${connection.provider} subscription created for ${connectionId}, ` +
      `expires ${subscription.expiresAt}`
  );

  return subscription;
}
