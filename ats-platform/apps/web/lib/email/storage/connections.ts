/**
 * Typed read/write helpers for the provider_connections table.
 * Used by OAuth callback routes (server-side only) and the sync engine.
 *
 * Never call from client components — this runs only in API routes and
 * server actions that have an authenticated Supabase session.
 */

import { createClient } from "@/lib/supabase/server";
import { encrypt, decrypt } from "@/lib/email/token-store";
import type { ProviderId } from "@/types/email/provider";

export interface StoredConnection {
  id: string;
  userId: string;
  agencyId: string;
  provider: ProviderId;
  providerSub: string;
  email: string;
  msTenantId: string | null;
  scopes: string[];
  syncEnabled: boolean;
  deltaCursor: string | null;
  backfillCompletedAt: string | null;
  realtimeSubscriptionId: string | null;
  realtimeExpiresAt: string | null;
  accessTokenExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertConnectionInput {
  userId: string;
  agencyId: string;
  provider: ProviderId;
  providerSub: string;
  email: string;
  msTenantId?: string | null;
  scopes: string[];
  refreshToken: string;      // plaintext — encrypted before write
  accessTokenExpiresAt?: string | null;
}

// ─── mapper ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any): StoredConnection {
  return {
    id:                     r.id,
    userId:                 r.user_id,
    agencyId:               r.agency_id,
    provider:               r.provider as ProviderId,
    providerSub:            r.provider_sub,
    email:                  r.email,
    msTenantId:             r.ms_tenant_id ?? null,
    scopes:                 r.scopes ?? [],
    syncEnabled:            r.sync_enabled ?? true,
    deltaCursor:            r.delta_cursor ?? null,
    backfillCompletedAt:    r.backfill_completed_at ?? null,
    realtimeSubscriptionId: r.realtime_subscription_id ?? null,
    realtimeExpiresAt:      r.realtime_expires_at ?? null,
    accessTokenExpiresAt:   r.access_token_expires_at ?? null,
    createdAt:              r.created_at,
    updatedAt:              r.updated_at,
  };
}

// ─── reads ────────────────────────────────────────────────────────────────────

/** Return all connections for the current user (all providers). */
export async function getConnectionsForUser(userId: string): Promise<StoredConnection[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("provider_connections")
    .select("*")
    .eq("user_id", userId)
    .order("created_at");

  if (error) throw error;
  return (data ?? []).map(mapRow);
}

/** Return a single connection for a user+provider pair, or null. */
export async function getConnection(
  userId: string,
  provider: ProviderId
): Promise<StoredConnection | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("provider_connections")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", provider)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // not found
    throw error;
  }
  return data ? mapRow(data) : null;
}

/** Decrypt and return the refresh token for a connection (server-side only). */
export async function getRefreshToken(connectionId: string): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("provider_connections")
    .select("refresh_token_secret_ref")
    .eq("id", connectionId)
    .single();

  if (error) throw error;
  if (!data?.refresh_token_secret_ref) {
    throw new Error(`No refresh token stored for connection ${connectionId}`);
  }
  return decrypt(data.refresh_token_secret_ref);
}

// ─── writes ───────────────────────────────────────────────────────────────────

/** Upsert a provider connection, encrypting the refresh token. */
export async function upsertConnection(input: UpsertConnectionInput): Promise<StoredConnection> {
  const supabase = await createClient();
  const encryptedToken = await encrypt(input.refreshToken);

  const { data, error } = await supabase
    .from("provider_connections")
    .upsert(
      {
        user_id:                  input.userId,
        agency_id:                input.agencyId,
        provider:                 input.provider,
        provider_sub:             input.providerSub,
        email:                    input.email,
        ms_tenant_id:             input.msTenantId ?? null,
        scopes:                   input.scopes,
        sync_enabled:             true,
        refresh_token_secret_ref: encryptedToken,
        access_token_expires_at:  input.accessTokenExpiresAt ?? null,
      },
      { onConflict: "user_id,provider" }
    )
    .select()
    .single();

  if (error) throw error;
  return mapRow(data);
}

/** Update only the delta cursor after a successful sync pass. */
export async function updateDeltaCursor(connectionId: string, cursor: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("provider_connections")
    .update({ delta_cursor: cursor })
    .eq("id", connectionId);

  if (error) throw error;
}

/** Mark backfill complete and record the delta cursor that was current at that time. */
export async function markBackfillComplete(connectionId: string, cursor: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("provider_connections")
    .update({
      backfill_completed_at: new Date().toISOString(),
      delta_cursor: cursor,
    })
    .eq("id", connectionId);

  if (error) throw error;
}

/** Store a realtime subscription handle. */
export async function updateRealtimeSubscription(
  connectionId: string,
  subscriptionId: string,
  expiresAt: string
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("provider_connections")
    .update({
      realtime_subscription_id: subscriptionId,
      realtime_expires_at: expiresAt,
    })
    .eq("id", connectionId);

  if (error) throw error;
}

/** Disable a connection (soft — sets sync_enabled=false, preserves row). */
export async function disableConnection(connectionId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("provider_connections")
    .update({ sync_enabled: false })
    .eq("id", connectionId);

  if (error) throw error;
}

/** Delete a connection (hard delete — also removes tokens). Only used on purge. */
export async function deleteConnection(connectionId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("provider_connections")
    .delete()
    .eq("id", connectionId);

  if (error) throw error;
}

/**
 * Insert a connection row — thin wrapper around upsertConnection for callers
 * that have already encrypted the token separately. Prefer upsertConnection
 * for most use-cases; this exists to match the Stage 3 spec surface.
 */
export async function insertConnection(
  input: UpsertConnectionInput
): Promise<StoredConnection> {
  return upsertConnection(input);
}

// ─── sync events ─────────────────────────────────────────────────────────────

export interface SyncEventInput {
  userId: string;
  agencyId: string;
  connectionId: string;
  eventType: string;
  provider: ProviderId;
  detail?: Record<string, unknown> | null;
}

/**
 * Append a row to the sync_events observability table.
 * This is append-only — no update/delete allowed by RLS.
 */
export async function recordSyncEvent(input: SyncEventInput): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("sync_events").insert({
    user_id: input.userId,
    agency_id: input.agencyId,
    connection_id: input.connectionId,
    event_type: input.eventType,
    provider: input.provider,
    detail: input.detail ?? null,
  });

  if (error) {
    // sync_events is observability — log but don't crash the OAuth flow
    console.error("[recordSyncEvent] Failed to insert:", error);
  }
}
