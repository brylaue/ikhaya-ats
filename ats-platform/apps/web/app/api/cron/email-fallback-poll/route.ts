/**
 * Fallback poller cron — runs every 5 minutes.
 *
 * For connections where `realtime_expires_at IS NULL OR < now()`,
 * runs `fetchDelta` manually so we never miss mail even when
 * push subscriptions are down.
 *
 * Protected by CRON_SECRET bearer token (Vercel Cron or external scheduler).
 *
 * Stage 8.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { gmailAdapter } from "@/lib/email/gmail-adapter";
import { graphAdapter } from "@/lib/email/graph-adapter";
import { processFullMessage } from "@/lib/email/storage/messages";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest) {
  // US-319: fail closed — missing/empty CRON_SECRET must never allow access
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    // US-336: keep ticket refs out of runtime log output
    console.error("[cron/fallback-poll] CRON_SECRET is not set — refusing all requests");
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  // Verify Vercel cron header or bearer token
  const authHeader = request.headers.get("authorization");
  const vercelCron = request.headers.get("x-vercel-cron");

  if (vercelCron !== cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Find connections without active realtime subscriptions
  const now = new Date().toISOString();
  const { data: connections, error } = await supabase
    .from("provider_connections")
    .select("*")
    .eq("sync_enabled", true)
    .or(`realtime_expires_at.is.null,realtime_expires_at.lt.${now}`);

  if (error) {
    console.error("fallback-poll: query failed:", error);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  if (!connections?.length) {
    return NextResponse.json({ status: "ok", polled: 0 });
  }

  let polled = 0;
  let errors = 0;

  for (const connection of connections) {
    try {
      const adapter =
        connection.provider === "google" ? gmailAdapter : graphAdapter;

      let messagesProcessed = 0;

      for await (const batch of adapter.fetchDelta(connection)) {
        const msgs = Array.isArray(batch) ? batch : [batch];
        for (const msg of msgs) {
          try {
            await processFullMessage(supabase, {
              agencyId:  connection.agency_id,
              userId:    connection.user_id,
              provider:  connection.provider,
              ref: {
                providerMessageId: msg.providerMessageId ?? msg.id,
                providerThreadId:  msg.providerThreadId ?? msg.threadId ?? "",
                internetMessageId: msg.internetMessageId ?? msg.externalId ?? null,
                receivedAt:        msg.receivedAt ?? new Date(msg.timestamp).toISOString(),
                from:              msg.from,
                to:                msg.to ?? [],
                cc:                msg.cc ?? [],
                bcc:               msg.bcc ?? [],
                subject:           msg.subject ?? null,
              },
              msg,
              userEmail: connection.email,
            });
            messagesProcessed++;
          } catch (err) {
            console.error("fallback-poll: message processing error:", err);
          }
        }
      }

      if (messagesProcessed > 0) {
        await supabase.from("sync_events").insert({
          agency_id:          connection.agency_id,
          user_id:            connection.user_id,
          provider:           connection.provider,
          event_type:         "fallback_poll",
          messages_processed: messagesProcessed,
          occurred_at:        new Date().toISOString(),
        });
      }

      polled++;
    } catch (err) {
      console.error(
        `fallback-poll: error polling connection ${connection.id}:`,
        err
      );
      errors++;
    }
  }

  return NextResponse.json({ status: "ok", polled, errors });
}

// Also support GET for Vercel Cron (it uses GET by default)
export async function GET(request: NextRequest) {
  return POST(request);
}
