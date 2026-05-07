/**
 * GET /api/cron/webhook-retry
 * US-083: Process pending webhook delivery retries.
 *
 * Runs every minute (Vercel cron). Picks up all pending deliveries whose
 * next_retry_at is in the past and attempts re-delivery.
 *
 * Protected by CRON_SECRET bearer token.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { attemptDelivery } from "@/lib/webhooks/deliver";
import crypto from "crypto";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const cronSecret  = process.env.CRON_SECRET ?? "";

export async function GET(req: NextRequest) {
  // Auth
  const auth = req.headers.get("authorization") ?? "";
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });

  const now = new Date().toISOString();

  // Fetch deliveries due for retry (up to 50 at a time to stay within timeout)
  const { data: due, error } = await db
    .from("webhook_deliveries")
    .select(`
      id,
      nonce,
      signature,
      event_type,
      payload,
      webhook_endpoints ( url, secret )
    `)
    .eq("status", "pending")
    .not("next_retry_at", "is", null)
    .lte("next_retry_at", now)
    .limit(50);

  if (error) {
    console.error("[webhook-retry] query error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!due || due.length === 0) {
    return NextResponse.json({ processed: 0 });
  }

  const timestamp = Math.floor(Date.now() / 1000);

  const results = await Promise.allSettled(
    due.map(async (d: {
      id: string;
      nonce: string;
      signature: string;
      event_type: string;
      payload: Record<string, unknown>;
      webhook_endpoints: { url: string; secret: string } | { url: string; secret: string }[] | null;
    }) => {
      const rawEp = d.webhook_endpoints;
      const endpoint = Array.isArray(rawEp) ? rawEp[0] ?? null : rawEp;
      if (!endpoint) return;

      const body = JSON.stringify(d.payload);

      // Recompute signature for this attempt (timestamp changes each retry)
      const signingInput = `${timestamp}.${d.nonce}.${body}`;
      const signature = `sha256=${crypto
        .createHmac("sha256", endpoint.secret)
        .update(signingInput)
        .digest("hex")}`;

      await attemptDelivery(
        db as any,
        d.id,
        endpoint.url,
        endpoint.secret,
        d.nonce,
        timestamp,
        body,
        signature
      );
    })
  );

  const succeeded = results.filter(r => r.status === "fulfilled").length;
  const failed    = results.filter(r => r.status === "rejected").length;

  return NextResponse.json({ processed: due.length, succeeded, failed });
}
