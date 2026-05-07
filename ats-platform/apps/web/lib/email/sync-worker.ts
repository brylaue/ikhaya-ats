/**
 * Email sync worker for backfilling messages and storing them.
 *
 * Provider-agnostic: dispatches to the correct adapter via getProvider(conn.provider).
 * Both Gmail and Microsoft Graph backfills follow the same pipeline:
 *   1. List messages in 90-day window (inbox + sent)
 *   2. Fetch full message for each ref
 *   3. Upsert thread + message + match to candidates
 *   4. Log sync events for observability
 *
 * Stage 6: Gmail backfill
 * Stage 7: Provider-agnostic refactor + Microsoft Graph support
 */

import { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import type { ProviderConnection, ProviderId } from "@/types/email/provider";
import { getProvider } from "./providers";
import { processFullMessage } from "./storage/messages";
import { recordSyncEvent, disableConnection } from "./storage/connections";
import { ProviderError } from "@/types/email/provider";

/**
 * Minimal connection shape needed by the backfill worker.
 * Accepts both ProviderConnection (typed) and raw DB rows (snake_case).
 * The adapter's getAccessToken handles refresh token retrieval internally.
 */
type BackfillConnection = ProviderConnection | {
  id: string;
  user_id?: string;
  userId?: string;
  agency_id?: string;
  agencyId?: string;
  provider: ProviderId;
  email: string;
  ms_tenant_id?: string | null;
  msTenantId?: string | null;
  [key: string]: unknown;
};

/** Normalize a connection to consistent camelCase access. */
function normalizeConn(conn: BackfillConnection): ProviderConnection {
  // If it already has camelCase fields, return as-is
  if ("userId" in conn && conn.userId) {
    return conn as ProviderConnection;
  }
  // Map snake_case DB row to ProviderConnection shape
  const raw = conn as Record<string, unknown>;
  return {
    id: raw.id as string,
    userId: (raw.user_id ?? raw.userId) as string,
    agencyId: (raw.agency_id ?? raw.agencyId) as string,
    provider: raw.provider as ProviderId,
    providerSub: (raw.provider_sub ?? raw.providerSub ?? "") as string,
    email: raw.email as string,
    msTenantId: (raw.ms_tenant_id ?? raw.msTenantId ?? null) as string | null,
    scopes: (raw.scopes ?? []) as string[],
    syncEnabled: (raw.sync_enabled ?? raw.syncEnabled ?? true) as boolean,
    backfillCompletedAt: (raw.backfill_completed_at ?? raw.backfillCompletedAt ?? null) as string | null,
    deltaCursor: (raw.delta_cursor ?? raw.deltaCursor ?? null) as string | null,
    realtimeSubscriptionId: (raw.realtime_subscription_id ?? raw.realtimeSubscriptionId ?? null) as string | null,
    realtimeExpiresAt: (raw.realtime_expires_at ?? raw.realtimeExpiresAt ?? null) as string | null,
    accessTokenExpiresAt: (raw.access_token_expires_at ?? raw.accessTokenExpiresAt ?? null) as string | null,
    refreshTokenSecretRef: (raw.refresh_token_secret_ref ?? raw.refreshTokenSecretRef ?? null) as string | null,
    createdAt: (raw.created_at ?? raw.createdAt ?? new Date().toISOString()) as string,
    updatedAt: (raw.updated_at ?? raw.updatedAt ?? new Date().toISOString()) as string,
  };
}

const BACKFILL_DAYS = parseInt(process.env.EMAIL_BACKFILL_DAYS || "90");

/**
 * Check admin consent gating for Microsoft connections.
 * If the MS tenant requires admin consent and hasn't granted it, attempts
 * a probe request. On AADSTS65001, disables the connection and logs an error.
 *
 * Returns true if backfill can proceed, false if blocked.
 */
async function checkAdminConsent(
  supabase: SupabaseClient<Database>,
  conn: ProviderConnection
): Promise<boolean> {
  if (conn.provider !== "microsoft" || !conn.msTenantId || !conn.agencyId) {
    return true; // Not MS, no tenant, or no agency — proceed
  }

  // Check if admin consent is already recorded for this tenant
  const { data: tenantRow } = await supabase
    .from("ikhaya_tenant_ms_tenants")
    .select("admin_consented")
    .eq("ikhaya_agency_id", conn.agencyId)
    .eq("ms_tenant_id", conn.msTenantId)
    .maybeSingle();

  if (tenantRow?.admin_consented) {
    return true; // Admin consent granted — proceed
  }

  // Consent status unknown or false — try listing 1 message as a probe
  try {
    const adapter = getProvider("microsoft");
    const probeOpts = {
      sinceIso: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      folder: "inbox" as const,
    };
    // Attempt to iterate one page — if it succeeds, user consent is sufficient
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _batch of adapter.listMessages(conn, probeOpts)) {
      break; // One page is enough to confirm access
    }
    return true;
  } catch (err) {
    if (err instanceof ProviderError && err.code === "admin_consent_required") {
      // Mark connection disabled
      await disableConnection(conn.id);

      // Log error event
      await recordSyncEvent({
        userId: conn.userId,
        agencyId: conn.agencyId ?? "",
        connectionId: conn.id,
        eventType: "backfill_error",
        provider: "microsoft",
        detail: {
          error: "admin_consent_required",
          message:
            "Admin consent is required for this Microsoft tenant. The connection has been disabled.",
          msTenantId: conn.msTenantId,
        },
      });

      return false;
    }
    // Other errors — let backfill handle them normally
    return true;
  }
}

export async function backfillUser(
  supabase: SupabaseClient<Database>,
  rawConn: BackfillConnection
): Promise<void> {
  const conn = normalizeConn(rawConn);
  const provider = conn.provider;
  const adapter = getProvider(provider);

  // ─── Admin consent gating (Microsoft only) ─────────────────────────
  if (provider === "microsoft") {
    const canProceed = await checkAdminConsent(supabase, conn);
    if (!canProceed) {
      console.warn(
        `[backfill] Blocked: admin consent required for MS tenant ${conn.msTenantId}`
      );
      return;
    }
  }

  try {
    const sinceIso = new Date(
      Date.now() - BACKFILL_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    let totalProcessed = 0;
    let totalMatches = 0;

    // Iterate over inbox and sent folders
    for (const folder of ["inbox", "sent"] as const) {
      let pageNum = 0;

      for await (const refs of adapter.listMessages(conn, {
        sinceIso,
        folder,
      })) {
        pageNum++;

        for (const ref of refs) {
          try {
            // Fetch full message
            const fullMsg = await adapter.getMessage(conn, ref.providerMessageId);

            // Process: upsert thread, insert message (with dedup), match + link
            const result = await processFullMessage(supabase, {
              agencyId: conn.agencyId ?? "",
              userId: conn.userId,
              provider,
              ref,
              msg: fullMsg,
              userEmail: conn.email,
            });

            if (result) {
              totalMatches += result.matches.length;
            }

            totalProcessed++;
          } catch (err) {
            if (err instanceof ProviderError && err.code === "rate_limited") {
              // Re-throw rate limit errors to pause the entire backfill
              throw err;
            }
            console.error(
              `Failed to process message ${ref.providerMessageId}:`,
              err
            );
            // Continue with next message for non-fatal errors
          }
        }

        // Log sync event for this page
        await supabase.from("sync_events").insert({
          agency_id: conn.agencyId ?? "",
          user_id: conn.userId,
          provider,
          event_type: "backfill_page",
          messages_processed: refs.length,
          matches_created: totalMatches,
          occurred_at: new Date().toISOString(),
        });
      }
    }

    // ─── Capture delta cursor (Microsoft: deltaLink, Google: historyId) ──
    // For Microsoft, run fetchDelta to capture the initial deltaLink cursor
    // so Stage 8 realtime processing has a starting point.
    if (provider === "microsoft") {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _batch of adapter.fetchDelta(conn)) {
          // We don't need to process these — backfill already has them.
          // We're just driving the generator to completion so it stores the deltaLink.
        }
      } catch (err) {
        console.error("[backfill] Failed to capture MS delta cursor:", err);
        // Non-fatal — backfill still succeeded
      }
    }

    // Mark backfill as completed
    await supabase
      .from("provider_connections")
      .update({ backfill_completed_at: new Date().toISOString() })
      .eq("id", conn.id);

    // Log completion event
    await supabase.from("sync_events").insert({
      agency_id: conn.agencyId ?? "",
      user_id: conn.userId,
      provider,
      event_type: "backfill_complete",
      messages_processed: totalProcessed,
      matches_created: totalMatches,
      occurred_at: new Date().toISOString(),
    });

    console.log(
      `Backfill completed for user ${conn.userId} (${provider}): ${totalProcessed} messages, ${totalMatches} matches`
    );
  } catch (err) {
    console.error("Backfill error:", err);

    // Log error event
    await supabase.from("sync_events").insert({
      agency_id: conn.agencyId ?? "",
      user_id: conn.userId,
      provider,
      event_type: "backfill_error",
      error_code:
        err instanceof ProviderError ? err.code : "sync_failed",
      error_body: { message: String(err) },
      occurred_at: new Date().toISOString(),
    });
  }
}
