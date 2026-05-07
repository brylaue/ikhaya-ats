/**
 * DELETE /api/integrations/email/disconnect?provider=google|microsoft
 *
 * Revokes the provider token (best-effort), deletes the provider_connections
 * row, and records a 'disconnected' sync event. Actual data purge is enqueued
 * as a stub — the real purge worker is delivered in Stage 10.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProvider } from "@/lib/email/providers";
import { decrypt } from "@/lib/email/token-store";
import { checkCsrf } from "@/lib/csrf";
import type { ProviderId, ProviderConnection } from "@/types/email/provider";

export async function DELETE(req: NextRequest) {
  // US-326: reject cross-origin disconnect attempts
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const provider = req.nextUrl.searchParams.get("provider") as ProviderId | null;
  if (provider !== "google" && provider !== "microsoft") {
    return NextResponse.json(
      { error: "Invalid provider — must be 'google' or 'microsoft'" },
      { status: 400 }
    );
  }

  try {
    // Find the connection
    const { data: row, error: fetchError } = await supabase
      .from("provider_connections")
      .select("*")
      .eq("user_id", user.id)
      .eq("provider", provider)
      .single();

    if (fetchError || !row) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 }
      );
    }

    // Best-effort token revocation via the provider adapter
    try {
      const adapter = getProvider(provider);
      // Build a minimal ProviderConnection for the revoke call
      const conn: ProviderConnection = {
        id: row.id,
        userId: row.user_id,
        agencyId: row.agency_id,
        provider: row.provider,
        providerSub: row.provider_sub,
        email: row.email,
        msTenantId: row.ms_tenant_id ?? null,
        scopes: row.scopes ?? [],
        syncEnabled: row.sync_enabled,
        refreshTokenSecretRef: row.refresh_token_secret_ref,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
      await adapter.revoke(conn);
    } catch (revokeErr) {
      // Revocation failure is not blocking — continue with delete
      console.warn("[disconnect] Provider revoke failed (non-blocking):", revokeErr);
    }

    // Delete the connection row
    const { error: deleteError } = await supabase
      .from("provider_connections")
      .delete()
      .eq("id", row.id);

    if (deleteError) {
      console.error("[disconnect] Delete failed:", deleteError);
      return NextResponse.json({ error: "Delete failed" }, { status: 500 });
    }

    // Record a sync_event for observability
    await supabase.from("sync_events").insert({
      user_id: user.id,
      agency_id: row.agency_id,
      provider,
      event_type: "disconnected",
      messages_processed: 0,
      matches_created: 0,
    });

    // Stage 10: run inline purge of synced messages, links, threads
    try {
      const { purgeUserData } = await import("@/lib/email/sync/purge");
      // Connection row is already deleted above; purge remaining data
      await purgeUserData(supabase, user.id, provider, row.agency_id);
    } catch (purgeErr) {
      // Purge failure is non-blocking for the disconnect response
      console.error("[disconnect] Purge failed (non-blocking):", purgeErr);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[disconnect] Unexpected error:", err);
    return NextResponse.json({ error: "Unknown error" }, { status: 500 });
  }
}
