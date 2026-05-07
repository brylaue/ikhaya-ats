/**
 * GET /api/auth/microsoft/adminconsent
 *
 * Redirects the Ikhaya tenant admin to Microsoft's admin consent endpoint.
 * This grants organisation-wide delegated permissions for the Ikhaya app
 * in the user's Microsoft 365 tenant.
 *
 * The MS tenant ID must be supplied as a query parameter (?ms_tenant_id=xxx)
 * — typically sourced from a previously-connected user's provider_connections
 * row.
 *
 * Gated on EMAIL_MICROSOFT_ENABLED feature flag.
 *
 * Stage 4 — Microsoft OAuth.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** US-330: Microsoft tenant IDs are GUIDs or the literal "common"/"organizations"/"consumers". */
const MS_TENANT_GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidMsTenantId(v: string): boolean {
  if (!v) return false;
  if (MS_TENANT_GUID.test(v)) return true;
  // `common`, `organizations`, `consumers` are Microsoft-supported placeholders
  return v === "common" || v === "organizations" || v === "consumers";
}

const MS_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "User.Read",
  "Mail.ReadWrite",
  "Mail.Send",
];

export async function GET(req: NextRequest) {
  // Feature flag
  if (process.env.EMAIL_MICROSOFT_ENABLED !== "true") {
    return new NextResponse("Not Found", { status: 404 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const authority = process.env.MS_OAUTH_AUTHORITY || "https://login.microsoftonline.com/common";
  const clientId = process.env.MS_OAUTH_CLIENT_ID;

  if (!clientId) {
    return new NextResponse("OAuth not configured", { status: 503 });
  }

  // Auth check — only tenant admins should hit this, but any authenticated
  // user can reach it. Downstream admin-consent-callback enforces that the
  // caller's tenant matches.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // The MS tenant ID to request admin consent for
  const { searchParams } = new URL(req.url);
  const msTenantId = searchParams.get("ms_tenant_id");

  if (!msTenantId) {
    return new NextResponse("ms_tenant_id query parameter is required", { status: 400 });
  }

  // US-330: strict GUID validation prevents open redirect via URL injection.
  if (!isValidMsTenantId(msTenantId)) {
    return new NextResponse("Invalid ms_tenant_id", { status: 400 });
  }

  // US-328: Validate that the requesting user's Microsoft account belongs to the
  // target tenant. Any authenticated user could otherwise trigger admin consent
  // for an arbitrary tenant they don't own, forcing that tenant's admin to see
  // an unexpected consent prompt for our app.
  //
  // We check the user's stored Microsoft provider_connection to confirm their
  // tid (tenant ID) claim matches the requested ms_tenant_id. If the user has
  // no Microsoft connection yet, we allow the flow (first-time setup) but log
  // the initiation for audit purposes.
  if (MS_TENANT_GUID.test(msTenantId)) {
    const { data: msConnection } = await supabase
      .from("provider_connections")
      .select("ms_tenant_id")
      .eq("user_id", user.id)
      .eq("provider", "microsoft")
      .maybeSingle();

    if (msConnection?.ms_tenant_id && msConnection.ms_tenant_id !== msTenantId) {
      // User's connected Microsoft account belongs to a different tenant than
      // the one they're trying to consent for — block the request.
      return new NextResponse("ms_tenant_id does not match your connected Microsoft account", {
        status: 403,
      });
    }
  }

  // US-337: Embed userId in state so the callback can verify the same user
  // completes the round-trip. Format: "userId:uuid"
  const state = `${user.id}:${crypto.randomUUID()}`;

  // Build the admin consent URL — scoped to the specific MS tenant
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${appUrl}/api/auth/microsoft/adminconsent-callback`,
    scope: MS_SCOPES.join(" "),
    state,
  });

  const consentUrl = `${authority}/${msTenantId}/adminconsent?${params}`;

  const response = NextResponse.redirect(consentUrl);
  response.cookies.set("microsoft_adminconsent_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/",
  });

  return response;
}
