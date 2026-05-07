/**
 * lib/webhooks/deliver.ts
 * US-083: Outbound webhook delivery with HMAC-SHA256 signing, nonce-based
 *         replay protection, exponential backoff retries, and 24h DLQ.
 *
 * Usage:
 *   await dispatchWebhook(supabase, agencyId, eventType, payload);
 *
 * Called by internal event emitters (placement created, stage changed, etc.).
 * Each active endpoint subscribed to the event type receives a signed delivery.
 */

import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import crypto from "crypto";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum HTTP response time before treating as failure */
const DELIVERY_TIMEOUT_MS = 10_000;

/** Delivery dead-lettered after this window (prevents infinite retries) */
const DLQ_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Exponential backoff delays (ms) for retry attempts.
 * Attempt 1 → 1min, 2 → 5min, 3 → 30min, 4 → 2hr, 5 → 6hr, then DLQ.
 */
const RETRY_DELAYS_MS = [
  1 * 60 * 1000,       // 1 min
  5 * 60 * 1000,       // 5 min
  30 * 60 * 1000,      // 30 min
  2 * 60 * 60 * 1000,  // 2 hr
  6 * 60 * 60 * 1000,  // 6 hr
];

// ─── Signature ────────────────────────────────────────────────────────────────

/**
 * Build the signed request headers for a webhook delivery.
 *
 * The signature covers: timestamp + "." + nonce + "." + body
 * This binds the nonce to the payload, preventing nonce reuse attacks.
 *
 * Receiving end should:
 *   1. Reject if |now - timestamp| > 5 min (clock skew tolerance)
 *   2. Check nonce has not been seen before (store nonces for 5 min)
 *   3. Recompute HMAC and compare in constant-time
 */
export function buildSignedHeaders(
  secret: string,
  nonce: string,
  timestamp: number,
  body: string
): Record<string, string> {
  const signingInput = `${timestamp}.${nonce}.${body}`;
  const sig = crypto
    .createHmac("sha256", secret)
    .update(signingInput)
    .digest("hex");

  return {
    "Content-Type":           "application/json",
    "X-Webhook-Signature":    `sha256=${sig}`,
    "X-Webhook-Timestamp":    String(timestamp),
    "X-Webhook-Nonce":        nonce,
    "X-Webhook-Event":        "", // caller fills in event type
    "User-Agent":             "Ikhaya-ATS/1.0",
  };
}

/**
 * Verify a webhook signature on the receiving end.
 * Tolerates up to 5 minutes of clock skew.
 *
 * @param secret       The shared secret
 * @param signature    Value of X-Webhook-Signature header
 * @param timestamp    Value of X-Webhook-Timestamp header (seconds)
 * @param nonce        Value of X-Webhook-Nonce header
 * @param body         Raw request body string
 */
export function verifyWebhookSignature(
  secret: string,
  signature: string,
  timestamp: number,
  nonce: string,
  body: string
): boolean {
  const CLOCK_SKEW_TOLERANCE_S = 5 * 60;
  const nowS = Math.floor(Date.now() / 1000);
  if (Math.abs(nowS - timestamp) > CLOCK_SKEW_TOLERANCE_S) return false;

  const expected = `sha256=${crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${nonce}.${body}`)
    .digest("hex")}`;

  // Constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

// ServiceClient deliberately untyped against Database — webhook_endpoints /
// webhook_deliveries are not yet in the generated supabase types but exist
// in the live schema. Once supabase types are regenerated we can switch this
// back to SupabaseClient<Database>.
type ServiceClient = SupabaseClient<any, "public", any>;
// Keep the import alias even when unused as a value — the type system needs it.
void createSupabaseClient;

/**
 * Dispatch a webhook event to all active endpoints subscribed to eventType.
 * Creates delivery records and attempts immediate delivery. On failure,
 * schedules next retry using exponential backoff.
 *
 * Must be called with a service-role client (bypasses RLS) or the agency's
 * own authenticated client.
 */
export async function dispatchWebhook(
  db: ServiceClient,
  agencyId: string,
  eventType: string,
  payload: Record<string, unknown>
): Promise<void> {
  // Fetch active endpoints subscribed to this event type
  const { data: endpoints } = await db
    .from("webhook_endpoints")
    .select("id, url, secret")
    .eq("agency_id", agencyId)
    .eq("is_active", true)
    .or(`events.cs.{${eventType}},events.eq.{}`); // subscribed to this event or all events

  if (!endpoints || endpoints.length === 0) return;

  const body       = JSON.stringify({ event: eventType, data: payload });
  const timestamp  = Math.floor(Date.now() / 1000);

  await Promise.allSettled(
    endpoints.map(async (endpoint: { id: string; url: string; secret: string }) => {
      const nonce = crypto.randomUUID();
      const signingInput = `${timestamp}.${nonce}.${body}`;
      const signature = `sha256=${crypto
        .createHmac("sha256", endpoint.secret)
        .update(signingInput)
        .digest("hex")}`;

      // Create the delivery record
      const { data: delivery } = await db
        .from("webhook_deliveries")
        .insert({
          agency_id:  agencyId,
          endpoint_id: endpoint.id,
          event_type: eventType,
          payload:    { event: eventType, data: payload },
          nonce,
          signature,
          status:     "pending",
        })
        .select("id")
        .single();

      if (!delivery?.id) return;

      // Attempt delivery immediately
      await attemptDelivery(db, delivery.id, endpoint.url, endpoint.secret, nonce, timestamp, body, signature);
    })
  );
}

// ─── Attempt ──────────────────────────────────────────────────────────────────

export async function attemptDelivery(
  db: ServiceClient,
  deliveryId: string,
  url: string,
  secret: string,
  nonce: string,
  timestamp: number,
  body: string,
  signature: string
): Promise<void> {
  const { data: delivery } = await db
    .from("webhook_deliveries")
    .select("attempt_count, created_at, event_type")
    .eq("id", deliveryId)
    .single();

  if (!delivery) return;

  const attemptCount = (delivery.attempt_count ?? 0) + 1;
  const now = new Date();

  let responseStatus: number | null = null;
  let responseBody: string | null   = null;
  let success = false;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type":        "application/json",
        "X-Webhook-Signature": signature,
        "X-Webhook-Timestamp": String(timestamp),
        "X-Webhook-Nonce":     nonce,
        "X-Webhook-Event":     delivery.event_type,
        "User-Agent":          "Ikhaya-ATS/1.0",
      },
      body,
    });

    clearTimeout(timeout);
    responseStatus = res.status;
    responseBody   = (await res.text()).slice(0, 1000); // cap stored body
    success        = res.status >= 200 && res.status < 300;
  } catch (err) {
    responseBody = err instanceof Error ? err.message : String(err);
  }

  const ageMs = now.getTime() - new Date(delivery.created_at).getTime();
  const isExhausted = attemptCount > RETRY_DELAYS_MS.length || ageMs >= DLQ_WINDOW_MS;

  const nextStatus = success ? "success"
    : isExhausted             ? "dead_lettered"
    :                           "pending";

  const nextRetryAt = (!success && !isExhausted && RETRY_DELAYS_MS[attemptCount - 1])
    ? new Date(Date.now() + RETRY_DELAYS_MS[attemptCount - 1]).toISOString()
    : null;

  await db.from("webhook_deliveries").update({
    status:               nextStatus,
    attempt_count:        attemptCount,
    last_response_status: responseStatus,
    last_response_body:   responseBody,
    first_attempted_at:   delivery.attempt_count === 0 ? now.toISOString() : undefined,
    last_attempted_at:    now.toISOString(),
    next_retry_at:        nextRetryAt,
    dead_lettered_at:     nextStatus === "dead_lettered" ? now.toISOString() : undefined,
  }).eq("id", deliveryId);
}
