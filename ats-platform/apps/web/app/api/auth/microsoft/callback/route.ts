/**
 * GET /api/auth/microsoft/callback
 *
 * Handles the Microsoft OAuth redirect after user consent.
 * Validates CSRF state, exchanges auth code for tokens via the adapter,
 * encrypts the refresh token, upserts a provider_connections row,
 * tracks the MS tenant in ikhaya_tenant_ms_tenants, records a
 * sync_events entry (event_type='connected'), and checks for
 * cross-tenant connection conflicts.
 *
 * Gated on EMAIL_MICROSOFT_ENABLED feature flag.
 *
 * Stage 4 — Microsoft OAuth.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { microsoftProvider } from "@/lib/email/providers/microsoft";
import { upsertConnection, recordSyncEvent } from "@/lib/email/storage/connections";
import { backfillUser } from "@/lib/email/sync-worker";

export async function GET(req: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  // Feature flag — returns 404 if Microsoft email integration is disabled
  if (process.env.EMAIL_MICROSOFT_ENABLED !== "true") {
    return new NextResponse("Not Found", { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // Validate CSRF state cookie
  const stateCookie = req.cookies.get("microsoft_oauth_state")?.value;
  if (!stateCookie || stateCookie !== state) {
    return NextResponse.redirect(
      `${appUrl}/settings/integrations?error=state_mismatch`
    );
  }

  // US-338: Read PKCE verifier (required — reject if missing to prevent downgrade attacks)
  const pkceVerifier = req.cookies.get("microsoft_pkce_verifier")?.value;
  if (!pkceVerifier) {
    return NextResponse.redirect(
      `${appUrl}/settings/integrations?error=pkce_missing`
    );
  }

  // Handle consent denial or provider error
  if (error) {
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

    // Exchange auth code for tokens via the Microsoft adapter (US-338: include PKCE verifier)
    const { connection, refreshToken } = await microsoftProvider.handleCallback({
      code,
      state: stateCookie,
      codeVerifier: pkceVerifier,
    });

    // ─── Conflict detection ───────────────────────────────────────────
    // Two situations are blocked here:
    //   1. Cross-tenant: the same MS account is already bound to a
    //      DIFFERENT Ikhaya agency → data-leakage risk, reject hard.
    //   2. Same-agency, different user (US-343): another user in THIS
    //      agency already linked this exact MS mailbox. Allowed at the
    //      spec level would mean two Ikhaya users owning the same inbox;
    //      this is what migration 048's
    //      provider_connections_agency_provider_sub_key unique constraint
    //      blocks at the DB layer. Pre-checking here lets us emit the
    //      same friendly already-bound redirect instead of leaking a
    //      raw 23505 through the catch block.
    const { data: existingConns } = await supabase
      .from("provider_connections")
      .select("user_id, agency_id")
      .eq("provider", "microsoft")
      .eq("provider_sub", connection.providerSub);

    const crossTenantConflict = (existingConns ?? []).find(
      (c: { user_id: string; agency_id: string }) =>
        c.agency_id !== userData.agency_id
    );
    const sameAgencyConflict = (existingConns ?? []).find(
      (c: { user_id: string; agency_id: string }) =>
        c.agency_id === userData.agency_id && c.user_id !== user.id
    );

    if (crossTenantConflict || sameAgencyConflict) {
      return NextResponse.redirect(
        `${appUrl}/integrations/error?reason=already-bound`,
        { status: 302 }
      );
    }

    // Upsert the connection row (encrypts token internally)
    const stored = await upsertConnection({
      userId: user.id,
      agencyId: userData.agency_id,
      provider: "microsoft",
      providerSub: connection.providerSub,
      email: connection.email,
      msTenantId: connection.msTenantId,
      scopes: connection.scopes,
      refreshToken,
    });

    // ─── Tenant tracking ───────────────────────────────────────────────
    // If the returned MS tenant ID is not yet recorded for this Ikhaya
    // agency, insert it with admin_consented=false.
    if (connection.msTenantId) {
      const { data: existingTenant } = await supabase
        .from("ikhaya_tenant_ms_tenants")
        .select("id")
        .eq("ikhaya_agency_id", userData.agency_id)
        .eq("ms_tenant_id", connection.msTenantId)
        .maybeSingle();

      if (!existingTenant) {
        const { error: tenantInsertError } = await supabase
          .from("ikhaya_tenant_ms_tenants")
          .insert({
            ikhaya_agency_id: userData.agency_id,
            ms_tenant_id: connection.msTenantId,
            admin_consented: false,
          });

        if (tenantInsertError) {
          // Log but don't crash — tenant tracking is secondary to the connection
          console.error("[microsoft/callback] Failed to insert tenant:", tenantInsertError);
        }
      }
    }

    // Record the connection event in sync_events (observability)
    await recordSyncEvent({
      userId: user.id,
      agencyId: userData.agency_id,
      connectionId: stored.id,
      eventType: "connected",
      provider: "microsoft",
      detail: {
        email: connection.email,
        providerSub: connection.providerSub,
        msTenantId: connection.msTenantId,
        scopeCount: connection.scopes.length,
      },
    });

    // ─── Enqueue backfill (Stage 7) ──────────────────────────────────
    // Kick off initial 90-day backfill asynchronously.
    // The sync-worker handles admin consent gating internally.
    if (process.env.EMAIL_SYNC_ENABLED !== "false") {
      setTimeout(() => {
        backfillUser(supabase, stored).catch((err) => {
          console.error("[microsoft/callback] Backfill error:", err);
        });
      }, 0);
    }

    // Clear state + PKCE cookies and redirect to integrations page
    const response = NextResponse.redirect(
      `${appUrl}/settings/integrations?connected=microsoft`
    );
    response.cookies.delete("microsoft_oauth_state");
    response.cookies.delete("microsoft_pkce_verifier"); // US-338
    return response;
  } catch (err) {
    console.error("[microsoft/callback] OAuth callback error:", err);
    return NextResponse.redirect(
      `${appUrl}/settings/integrations?error=unknown`
    );
  }
}
