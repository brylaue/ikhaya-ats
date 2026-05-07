/**
 * Microsoft Graph change notification webhook handler.
 *
 * Graph sends notification batches to this endpoint when mail changes.
 * Each notification carries a connection ID embedded in clientState (HMAC-verified).
 * We fetch the delta via the Graph adapter and run each message through the
 * full process pipeline (upsert thread → insert message → match candidates).
 *
 * GET handler responds to Graph's validation challenge (must echo validationToken).
 *
 * Stage 7 / Stage 8.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { graphAdapter } from "@/lib/email/graph-adapter";
import { processFullMessage } from "@/lib/email/storage/messages";

const supabaseUrl   = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey   = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// US-341: Fail-closed — empty string or short secrets are rejected.
// An absent/weak secret would allow any caller to forge a valid HMAC.
const _rawWebhookSecret = process.env.MS_GRAPH_WEBHOOK_CLIENT_STATE_SECRET ?? "";
const webhookSecret = _rawWebhookSecret.length >= 32 ? _rawWebhookSecret : null;

// ─── Validation challenge (Graph subscription creation) ───────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const validationToken = searchParams.get("validationToken");

  if (!validationToken) {
    return NextResponse.json({ error: "No validationToken" }, { status: 400 });
  }

  // Graph requires a plain-text 200 response with the token echoed back
  return new NextResponse(validationToken, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

// ─── Change notifications ──────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // Always return 202 to Graph — it retries on any non-2xx
  try {
    // US-341: If the secret is missing or too short, we cannot verify any
    // notification. Log and return 202 (so Graph stops retrying) but process nothing.
    if (!webhookSecret) {
      console.error("graph-webhook: MS_GRAPH_WEBHOOK_CLIENT_STATE_SECRET is unset or < 32 chars — rejecting all notifications");
      return NextResponse.json({ processed: false, reason: "misconfigured" }, { status: 202 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const body = await request.json();
    const notifications: unknown[] = body.value ?? [];

    for (const notification of notifications) {
      if (!isNotification(notification)) continue;

      // Verify HMAC clientState: base64(connectionId + ":" + hmac(connectionId))
      let connectionId: string;
      try {
        const decoded   = Buffer.from(notification.clientState, "base64").toString("utf-8");
        const colonIdx  = decoded.lastIndexOf(":");
        const connId    = decoded.slice(0, colonIdx);
        const signature = decoded.slice(colonIdx + 1);

        const expected = crypto
          .createHmac("sha256", webhookSecret) // non-null guaranteed by guard above
          .update(connId)
          .digest("hex");

        if (signature !== expected) {
          console.warn("graph-webhook: HMAC mismatch for notification, skipping");
          continue;
        }
        connectionId = connId;
      } catch {
        console.warn("graph-webhook: failed to verify clientState, skipping");
        continue;
      }

      // Load connection
      const { data: connection, error: connErr } = await supabase
        .from("provider_connections")
        .select("*")
        .eq("id", connectionId)
        .single();

      if (connErr || !connection) {
        console.warn(`graph-webhook: connection ${connectionId} not found`);
        continue;
      }

      // Pull delta via async generator
      let messagesProcessed = 0;
      let matchesCreated = 0;

      try {
        for await (const batch of graphAdapter.fetchDelta(connection)) {
          const msgs = Array.isArray(batch) ? batch : [batch];
          for (const msg of msgs) {
            try {
              const result = await processFullMessage(supabase, {
                agencyId:  connection.agency_id,
                userId:    connection.user_id,
                provider:  "microsoft",
                ref: {
                  providerMessageId: msg.providerMessageId,
                  providerThreadId:  msg.providerThreadId,
                  internetMessageId: msg.internetMessageId ?? null,
                  receivedAt:        msg.receivedAt,
                  from:              msg.from,
                  to:                msg.to ?? [],
                  cc:                msg.cc ?? [],
                  bcc:               msg.bcc ?? [],
                  subject:           msg.subject ?? null,
                },
                msg,
                userEmail: connection.email,
              });

              if (result) {
                messagesProcessed++;
                matchesCreated += result.matches.length;
              }
            } catch (err) {
              console.error("graph-webhook: failed to process message:", err);
            }
          }
        }
      } catch (err) {
        console.error(`graph-webhook: fetchDelta error for ${connectionId}:`, err);
      }

      // Log sync event
      await supabase.from("sync_events").insert({
        agency_id:          connection.agency_id,
        user_id:            connection.user_id,
        provider:           "microsoft",
        event_type:         "delta_sync",
        messages_processed: messagesProcessed,
        matches_created:    matchesCreated,
        occurred_at:        new Date().toISOString(),
      });
    }

    return NextResponse.json({ processed: true }, { status: 202 });
  } catch (error) {
    console.error("graph-webhook: unhandled error:", error);
    return NextResponse.json({ processed: false }, { status: 202 });
  }
}

// ─── Type guard ───────────────────────────────────────────────────────────────

interface GraphNotification {
  clientState: string;
  changeType: string;
  resource?: string;
}

function isNotification(v: unknown): v is GraphNotification {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as GraphNotification).clientState === "string"
  );
}
