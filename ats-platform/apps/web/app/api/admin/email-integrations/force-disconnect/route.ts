/**
 * POST /api/admin/email-integrations/force-disconnect
 *
 * Admin-only. Force-disconnects a user's email provider and purges all
 * their synced data. Calls the same purgeUserData path as user self-disconnect.
 *
 * Body: { userId: string, provider: "google" | "microsoft" }
 *
 * Stage 10.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { purgeUserData } from "@/lib/email/sync/purge";
import { getProvider } from "@/lib/email/providers";
import type { ProviderId, ProviderConnection } from "@/types/email/provider";
import { MANAGER_ROLES, isValidEnumValue } from "@/lib/constants";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check caller is admin/owner
  const { data: userRow } = await supabase
    .from("users")
    .select("role, agency_id")
    .eq("id", user.id)
    .single();

  if (!userRow || !isValidEnumValue(userRow.role, MANAGER_ROLES)) {
    return NextResponse.json(
      { error: "Admin role required" },
      { status: 403 }
    );
  }

  const body = await req.json();
  const { userId, provider } = body as {
    userId?: string;
    provider?: ProviderId;
  };

  if (!userId || (provider !== "google" && provider !== "microsoft")) {
    return NextResponse.json(
      { error: "Missing userId or invalid provider" },
      { status: 400 }
    );
  }

  // Verify target user belongs to same agency
  const { data: targetUser } = await supabase
    .from("users")
    .select("agency_id")
    .eq("id", userId)
    .single();

  if (!targetUser || targetUser.agency_id !== userRow.agency_id) {
    return NextResponse.json(
      { error: "User not found in your agency" },
      { status: 404 }
    );
  }

  try {
    // Best-effort: revoke token at provider before purge
    const { data: connRow } = await supabase
      .from("provider_connections")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", provider)
      .single();

    if (connRow) {
      try {
        const adapter = getProvider(provider);
        const conn: ProviderConnection = {
          id: connRow.id,
          userId: connRow.user_id,
          agencyId: connRow.agency_id,
          provider: connRow.provider,
          providerSub: connRow.provider_sub,
          email: connRow.email,
          msTenantId: connRow.ms_tenant_id ?? null,
          scopes: connRow.scopes ?? [],
          syncEnabled: connRow.sync_enabled,
          refreshTokenSecretRef: connRow.refresh_token_secret_ref,
          createdAt: connRow.created_at,
          updatedAt: connRow.updated_at,
        };
        await adapter.revoke(conn);
      } catch (revokeErr) {
        console.warn(
          "[force-disconnect] Provider revoke failed (non-blocking):",
          revokeErr
        );
      }
    }

    // Purge all data
    const result = await purgeUserData(supabase, userId, provider, userRow.agency_id, {
      auditActorId: user.id,
    });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (err) {
    console.error("[force-disconnect] Error:", err);
    return NextResponse.json({ error: "Purge failed" }, { status: 500 });
  }
}
