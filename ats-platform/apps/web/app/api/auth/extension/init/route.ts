/**
 * GET /api/auth/extension/init
 * US-371: Extension OAuth popup — PKCE initialisation.
 *
 * Called by the Chrome extension when it opens the OAuth popup.
 * Generates a PKCE verifier + challenge + state, stores them in
 * a short-lived httpOnly cookie, and returns the Supabase OAuth
 * authorization URL for the extension to redirect to.
 *
 * CORS: restricted to chrome-extension://<EXTENSION_ID>
 *
 * Response: { authUrl: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@/lib/supabase/server";
import { randomBytes, createHash }   from "crypto";

const EXTENSION_ID    = process.env.CHROME_EXTENSION_ID ?? "";
const APP_URL         = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const STATE_COOKIE    = "__ext_pkce";
const STATE_MAX_AGE   = 600; // 10 minutes

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function corsHeaders(origin: string | null): HeadersInit {
  const allowed = EXTENSION_ID ? `chrome-extension://${EXTENSION_ID}` : "*";
  return {
    "Access-Control-Allow-Origin":  origin === allowed || !EXTENSION_ID ? (origin ?? "*") : "null",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age":       "86400",
  };
}

export async function OPTIONS(req: NextRequest) {
  return new Response(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin");

  // PKCE generation
  const verifier  = base64url(randomBytes(32));
  const challenge = base64url(Buffer.from(createHash("sha256").update(verifier).digest()));
  const state     = base64url(randomBytes(16));

  // Store verifier + state in cookie for callback validation
  const cookiePayload = JSON.stringify({ verifier, state, issuedAt: Date.now() });

  const supabase = await createClient();
  const { data } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options:  {
      redirectTo:          `${APP_URL}/api/auth/extension/callback`,
      queryParams:         { code_challenge: challenge, code_challenge_method: "S256", state },
      skipBrowserRedirect: true,
    },
  });

  const res = NextResponse.json({ authUrl: data.url }, { headers: corsHeaders(origin) });
  res.cookies.set(STATE_COOKIE, cookiePayload, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    path:     "/api/auth/extension",
    maxAge:   STATE_MAX_AGE,
  });

  return res;
}
