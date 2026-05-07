/**
 * Gmail Pub/Sub push webhook handler.
 *
 * Google pushes a base64-encoded notification to this endpoint when new mail
 * arrives.  We decode the emailAddress + historyId, find the stored connection,
 * pull the delta via the Gmail adapter, and run each message through the
 * full process pipeline (upsert thread -> insert message -> match candidates).
 *
 * Security: Verifies the Google-signed JWT in the Authorization header.
 * Must return 200 quickly (< 30s) or Pub/Sub will retry.
 *
 * Stage 8.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { gmailAdapter } from "@/lib/email/gmail-adapter";
import { processFullMessage } from "@/lib/email/storage/messages";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
// US-323: do NOT default to ""; empty audience disables verification entirely — fail closed instead
const expectedAudience = process.env.GOOGLE_PUBSUB_AUDIENCE ?? "";

// ─── Google OIDC key cache ──────────────────────────────────────────────────

interface GoogleKey {
  kid: string;
  n: string;
  e: string;
  alg: string;
}

let cachedKeys: GoogleKey[] = [];
let cacheExpiresAt = 0;

async function getGooglePublicKeys(): Promise<GoogleKey[]> {
  if (Date.now() < cacheExpiresAt && cachedKeys.length > 0) {
    return cachedKeys;
  }

  const res = await fetch("https://www.googleapis.com/oauth2/v3/certs");
  if (!res.ok) {
    throw new Error(`Failed to fetch Google public keys: ${res.status}`);
  }

  const data = await res.json();
  cachedKeys = data.keys ?? [];
  // Cache for 1 hour
  cacheExpiresAt = Date.now() + 60 * 60 * 1000;
  return cachedKeys;
}

/**
 * Verify a Google-signed JWT from Pub/Sub push.
 * Returns the decoded payload if valid, null if invalid.
 */
async function verifyGoogleJwt(
  token: string
): Promise<Record<string, unknown> | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());

    // Check audience
    if (expectedAudience && payload.aud !== expectedAudience) {
      console.warn(`pubsub: JWT aud mismatch: ${payload.aud} !== ${expectedAudience}`);
      return null;
    }

    // Check expiry
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      console.warn("pubsub: JWT expired");
      return null;
    }

    // Verify signature using Google's public keys
    const keys = await getGooglePublicKeys();
    const key = keys.find((k) => k.kid === header.kid);

    if (!key) {
      console.warn(`pubsub: no matching key for kid=${header.kid}`);
      return null;
    }

    // Build public key from JWK
    const publicKey = crypto.createPublicKey({
      key: {
        kty: "RSA",
        n: key.n,
        e: key.e,
        alg: key.alg,
      },
      format: "jwk",
    });

    const signatureValid = crypto.verify(
      "sha256",
      Buffer.from(`${parts[0]}.${parts[1]}`),
      publicKey,
      Buffer.from(parts[2], "base64url")
    );

    if (!signatureValid) {
      console.warn("pubsub: JWT signature verification failed");
      return null;
    }

    return payload;
  } catch (err) {
    console.error("pubsub: JWT verification error:", err);
    return null;
  }
}

// ─── Route handler ──────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // Always ACK to prevent Pub/Sub retries, even on error paths.
  try {
    // US-323: fail closed — empty/missing audience means JWT auth is unconfigured; reject all
    if (!expectedAudience) {
      console.error("pubsub: GOOGLE_PUBSUB_AUDIENCE is not set — rejecting all requests");
      return NextResponse.json({ acknowledged: true }, { status: 200 });
    }

    // JWT verification is always required (not conditional on audience being configured)
    const authHeader = request.headers.get("authorization");
    const bearerToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    if (!bearerToken) {
      console.warn("pubsub: missing Authorization header");
      return NextResponse.json({ acknowledged: true }, { status: 200 });
    }

    const jwtPayload = await verifyGoogleJwt(bearerToken);
    if (!jwtPayload) {
      console.warn("pubsub: JWT verification failed, rejecting");
      return NextResponse.json({ acknowledged: true }, { status: 200 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await request.json();
    const messageData = body.message?.data;

    if (!messageData) {
      console.warn("pubsub: missing message.data");
      return NextResponse.json({ acknowledged: true }, { status: 200 });
    }

    // Decode base64 Pub/Sub envelope
    let emailAddress: string;
    let historyId: string;
    try {
      const decoded = JSON.parse(Buffer.from(messageData, "base64").toString("utf-8"));
      emailAddress = decoded.emailAddress;
      historyId    = decoded.historyId;
    } catch {
      console.warn("pubsub: failed to decode message data");
      return NextResponse.json({ acknowledged: true }, { status: 200 });
    }

    if (!emailAddress || !historyId) {
      console.warn("pubsub: missing emailAddress or historyId");
      return NextResponse.json({ acknowledged: true }, { status: 200 });
    }

    // Find connection by provider email
    const { data: connection, error: connErr } = await supabase
      .from("provider_connections")
      .select("*")
      .eq("provider", "google")
      .eq("email", emailAddress)
      .single();

    if (connErr || !connection) {
      console.warn(`pubsub: no connection found for ${emailAddress}`);
      return NextResponse.json({ acknowledged: true }, { status: 200 });
    }

    // Pull delta messages using the Gmail adapter async generator
    let messagesProcessed = 0;
    let matchesCreated = 0;

    for await (const batch of gmailAdapter.fetchDelta(connection)) {
      const msgs = Array.isArray(batch) ? batch : [batch];
      for (const msg of msgs) {
        try {
          const result = await processFullMessage(supabase, {
            agencyId:  connection.agency_id,
            userId:    connection.user_id,
            provider:  "google",
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
          console.error("pubsub: failed to process message:", err);
        }
      }
    }

    // Log completed sync event
    await supabase.from("sync_events").insert({
      agency_id:          connection.agency_id,
      user_id:            connection.user_id,
      provider:           "google",
      event_type:         "delta_sync",
      messages_processed: messagesProcessed,
      matches_created:    matchesCreated,
      occurred_at:        new Date().toISOString(),
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("pubsub: unhandled error:", error);
    // Still ACK -- don't let Pub/Sub retry on permanent errors
    return NextResponse.json({ acknowledged: true }, { status: 200 });
  }
}
