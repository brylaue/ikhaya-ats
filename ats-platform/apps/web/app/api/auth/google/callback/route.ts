/**
 * GET /api/auth/google/callback
 *
 * Handles the Google OAuth redirect after user consent.
 * Validates CSRF state, exchanges auth code for tokens, encrypts the
 * refresh token, upserts a provider_connections row, and records a
 * sync_events entry (event_type='connected').
 *
 * Gated on EMAIL_GOOGLE_ENABLED feature flag.
 *
 * Stage 3 — Google OAuth.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { googleProvider } from "@/lib/email/providers/google";
import { upsertConnection, recordSyncEvent } from "@/lib/email/storage/connections";
import { enqueueBackfill } from "@/lib/email/sync/backfill";

export async function GET(req: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  // Feature flag — returns 404 if Google email integration is disabled
  if (process.env.EMAIL_GOOGLE_ENABLED !== "true") {
    return new NextResponse("Not Found", { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // Validate CSRF state cookie
  const stateCookie = req.cookies.get("google_oauth_state")?.value;
  if (!stateCookie || stateCookie !== state) {
    return NextResponse.redirect(
      `${appUrl}/settings/integrations?error=state_mismatch`
    );
  }

  // US-338: Read PKCE verifier (required — reject if missing to prevent downgrade attacks)
  const pkceVerifier = req.cookies.get("google_pkce_verifier")?.value;
  if (!pkceVerifier) {
    return NextResponse.redirect(
      `${appUrl}/settings/integrations?error=pkce_missing`
    );
  }

  // Handle consent denial or provider error
  if (error) {
    // User declined at the consent screen — this is expected behaviour
    return NextResponse.redirect(
      `${appUrl}/settings/integrations?error=${encodeURIComponent(error)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${appUrl}/settings/integrations?error=no_code`
    );
  }

  try {
    // Authenticate the current Supabase user
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(
        `${appUrl}/settings/integrations?error=not_authenticated`
      );
    }

    // Resolve user's agency
    const { data: userData } = await supabase
      .from("users")
      .select("agency_id")
      .eq("id", user.id)
      .single();

    if (!userData?.agency_id) {
      return NextResponse.redirect(
        `${appUrl}/settings/integrations?error=no_agency`
      );
    }

    // Exchange auth code for tokens via the Google adapter (US-338: include PKCE verifier)
    const { connection, refreshToken } = await googleProvider.handleCallback({
      code,
      state: stateCookie,
      codeVerifier: pkceVerifier,
    });

    // US-343: pre-check for a conflicting row owned by a DIFFERENT user inside
    // the same agency. Without this, the new
    // provider_connections_agency_provider_sub_key unique constraint (see
    // migration 048) would surface as an opaque 23505 on the upsert. We emit
    // the same already-bound redirect MS uses for cross-tenant conflicts so
    // the UX is consistent across both providers.
    const { data: preExisting } = await supabase
      .from("provider_connections")
      .select("user_id, agency_id")
      .eq("provider", "google")
      .eq("provider_sub", connection.providerSub);

    const sameAgencyConflict = (preExisting ?? []).find(
      (c: { user_id: string; agency_id: string }) =>
        c.agency_id === userData.agency_id && c.user_id !== user.id
    );
    const crossAgencyConflict = (preExisting ?? []).find(
      (c: { user_id: string; agency_id: string }) =>
        c.agency_id !== userData.agency_id
    );
    if (sameAgencyConflict || crossAgencyConflict) {
      return NextResponse.redirect(
        `${appUrl}/integrations/error?reason=already-bound`,
        { status: 302 }
      );
    }

    // Upsert the connection row (encrypts token internally)
    const stored = await upsertConnection({
      userId: user.id,
      agencyId: userData.agency_id,
      provider: "google",
      providerSub: connection.providerSub,
      email: connection.email,
      scopes: connection.scopes,
      refreshToken,
    });

    // Record the connection event in sync_events (observability)
    await recordSyncEvent({
      userId: user.id,
      agencyId: userData.agency_id,
      connectionId: stored.id,
      eventType: "connected",
      provider: "google",
      detail: {
        email: connection.email,
        providerSub: connection.providerSub,
        scopeCount: connection.scopes.length,
      },
    });

    // Kick off the 90-day backfill (Stage 6). In prod this enqueues on
    // BullMQ; in dev it runs in-process via JobSchedulerStub. Fire-and-
    // forget — we don't await the job, just the enqueue.
    try {
      await enqueueBackfill(stored.id);
    } catch (err) {
      // Enqueue failure is non-fatal for the OAuth flow — user is still
      // connected, and they can trigger backfill manually from Settings.
      console.error("[google/callback] Failed to enqueue backfill:", err);
    }

    // Clear state + PKCE cookies and redirect to integrations page
    const response = NextResponse.redirect(
      `${appUrl}/settings/integrations?connected=google`
    );
    response.cookies.delete("google_oauth_state");
    response.cookies.delete("google_pkce_verifier"); // US-338
    return response;
  } catch (err) {
    console.error("[google/callback] OAuth callback error:", err);
    return NextResponse.redirect(
      `${appUrl}/settings/integrations?error=unknown`
    );
  }
}
