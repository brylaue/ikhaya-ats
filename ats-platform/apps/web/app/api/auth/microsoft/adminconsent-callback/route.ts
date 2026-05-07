/**
 * GET /api/auth/microsoft/adminconsent-callback
 *
 * Receives the redirect from Microsoft after a tenant admin grants (or denies)
 * admin consent. Validates state, reads admin_consent=True and tenant query
 * params, and upserts ikhaya_tenant_ms_tenants with admin consent metadata.
 *
 * Gated on EMAIL_MICROSOFT_ENABLED feature flag.
 *
 * Stage 4 — Microsoft OAuth.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** US-331: tenant query param arrives from Microsoft redirect but is still
 * user-influenceable during the consent round-trip. Only accept strict GUIDs
 * before any DB write. */
const MS_TENANT_GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  // Feature flag
  if (process.env.EMAIL_MICROSOFT_ENABLED !== "true") {
    return new NextResponse("Not Found", { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const tenant = searchParams.get("tenant");
  const adminConsent = searchParams.get("admin_consent");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // Validate CSRF state cookie
  const stateCookie = req.cookies.get("microsoft_adminconsent_state")?.value;
  if (!stateCookie || stateCookie !== state) {
    return NextResponse.redirect(
      `${appUrl}/settings/integrations?error=state_mismatch`
    );
  }

  // US-337: State must be in "userId:uuid" format. Bare UUIDs (old format)
  // are rejected — they cannot be bound to a user session.
  const colonIdx = state.indexOf(":");
  if (colonIdx === -1) {
    return NextResponse.redirect(
      `${appUrl}/settings/integrations?error=state_mismatch`
    );
  }
  const stateUserId = state.slice(0, colonIdx);

  // Handle provider error (admin declined)
  if (error) {
    const response = NextResponse.redirect(
      `${appUrl}/settings/integrations?error=${encodeURIComponent(error)}`
    );
    response.cookies.delete("microsoft_adminconsent_state");
    return response;
  }

  if (!tenant || adminConsent !== "True") {
    const response = NextResponse.redirect(
      `${appUrl}/settings/integrations?error=admin_consent_failed`
    );
    response.cookies.delete("microsoft_adminconsent_state");
    return response;
  }

  // US-331: reject non-GUID tenant values before any DB write.
  if (!MS_TENANT_GUID.test(tenant)) {
    const response = NextResponse.redirect(
      `${appUrl}/settings/integrations?error=invalid_tenant`
    );
    response.cookies.delete("microsoft_adminconsent_state");
    return response;
  }

  try {
    const supabase = await createClient();

    // Auth check
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(
        `${appUrl}/settings/integrations?error=not_authenticated`
      );
    }

    // US-337: Verify the user who initiated the consent is the same user
    // completing it. Prevents cross-user session fixation.
    if (stateUserId !== user.id) {
      return NextResponse.redirect(
        `${appUrl}/settings/integrations?error=state_mismatch`
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

    // Upsert ikhaya_tenant_ms_tenants — mark admin consent as granted
    const { error: upsertError } = await supabase
      .from("ikhaya_tenant_ms_tenants")
      .upsert(
        {
          ikhaya_agency_id: userData.agency_id,
          ms_tenant_id: tenant,
          admin_consented: true,
          admin_consented_at: new Date().toISOString(),
          admin_consented_by_email: user.email ?? null,
        },
        { onConflict: "ikhaya_agency_id,ms_tenant_id" }
      );

    if (upsertError) {
      console.error("[adminconsent-callback] Failed to upsert tenant consent:", upsertError);
      return NextResponse.redirect(
        `${appUrl}/settings/integrations?error=db_error`
      );
    }

    // Clear state cookie and redirect
    const response = NextResponse.redirect(
      `${appUrl}/settings/integrations?admin_consented=${encodeURIComponent(tenant)}`
    );
    response.cookies.delete("microsoft_adminconsent_state");
    return response;
  } catch (err) {
    console.error("[adminconsent-callback] Error:", err);
    return NextResponse.redirect(
      `${appUrl}/settings/integrations?error=unknown`
    );
  }
}
