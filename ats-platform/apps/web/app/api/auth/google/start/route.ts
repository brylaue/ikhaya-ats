/**
 * GET /api/auth/google/start
 *
 * Initiates Google OAuth consent flow for Gmail integration.
 * Requires an authenticated Supabase user session.
 * Gated on EMAIL_GOOGLE_ENABLED feature flag.
 *
 * Stage 3 — Google OAuth.
 * US-338 — PKCE S256 added.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { googleProvider } from "@/lib/email/providers/google";
import crypto from "crypto";

/** US-338: Generate a PKCE verifier + S256 challenge pair. */
function generatePkce(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export async function GET(_req: NextRequest) {
  // Feature flag — returns 404 if Google email integration is disabled
  if (process.env.EMAIL_GOOGLE_ENABLED !== "true") {
    return new NextResponse("Not Found", { status: 404 });
  }

  // Check auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // Generate CSRF state token and PKCE pair (US-338)
  const state = crypto.randomUUID();
  const { verifier, challenge } = generatePkce();

  // Build the Google consent URL using the provider adapter
  const authUrl = googleProvider.buildAuthUrl({
    state,
    loginHint: user.email ?? undefined,
    codeChallenge: challenge,
  });

  // Store state + PKCE verifier in httpOnly cookies for validation in the callback
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 600, // 10 minutes
    path: "/",
  };

  const response = NextResponse.redirect(authUrl);
  response.cookies.set("google_oauth_state", state, cookieOpts);
  response.cookies.set("google_pkce_verifier", verifier, cookieOpts); // US-338

  return response;
}
