/**
 * Stage 10 — Metrics emission for email sync.
 *
 * emitSyncMetrics() is called after each sync run (backfill or delta)
 * and snapshots the current state into metrics_email_sync.
 *
 * For v1 this writes to Supabase directly. A future version can forward
 * to an analytics pipeline (Segment, PostHog, etc.) by swapping the sink.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface SyncMetricsSnapshot {
  agencyId: string;
  connectionCountGoogle: number;
  connectionCountMicrosoft: number;
  messagesSyncedTotal: number;
  matchPrecisionRate: number | null;
  activationRate: number | null;
  freshnessP50Seconds: number | null;
  errorCount: number;
  period: "daily" | "per_sync";
}

/**
 * Record a metrics snapshot after a sync pass.
 */
export async function emitSyncMetrics(
  supabase: SupabaseClient,
  snapshot: SyncMetricsSnapshot
): Promise<void> {
  const { error } = await supabase.from("metrics_email_sync").insert({
    agency_id: snapshot.agencyId,
    period: snapshot.period,
    connection_count_google: snapshot.connectionCountGoogle,
    connection_count_microsoft: snapshot.connectionCountMicrosoft,
    messages_synced_total: snapshot.messagesSyncedTotal,
    match_precision_rate: snapshot.matchPrecisionRate,
    activation_rate: snapshot.activationRate,
    freshness_p50_seconds: snapshot.freshnessP50Seconds,
    error_count: snapshot.errorCount,
  });

  if (error) {
    console.error("[metrics] Failed to emit sync metrics:", error);
  }
}

/**
 * Compute a full metrics snapshot for an agency.
 * Used by the daily cron or the admin dashboard.
 */
export async function computeAgencyMetrics(
  supabase: SupabaseClient,
  agencyId: string
): Promise<SyncMetricsSnapshot> {
  // Count connections by provider
  const { count: googleCount } = await supabase
    .from("provider_connections")
    .select("id", { count: "exact", head: true })
    .eq("agency_id", agencyId)
    .eq("provider", "google");

  const { count: msCount } = await supabase
    .from("provider_connections")
    .select("id", { count: "exact", head: true })
    .eq("agency_id", agencyId)
    .eq("provider", "microsoft");

  // Total messages synced
  const { count: totalMessages } = await supabase
    .from("email_messages")
    .select("id", { count: "exact", head: true })
    .eq("agency_id", agencyId);

  // Total links (matches)
  const { count: totalLinks } = await supabase
    .from("candidate_email_links")
    .select("id", { count: "exact", head: true })
    .eq("agency_id", agencyId);

  const matchRate =
    (totalMessages ?? 0) > 0
      ? (totalLinks ?? 0) / (totalMessages ?? 1)
      : null;

  // Activation rate: users with connections / total users
  const { count: totalUsers } = await supabase
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("agency_id", agencyId);

  const { data: connectedUsers } = await supabase
    .from("provider_connections")
    .select("user_id")
    .eq("agency_id", agencyId);

  const uniqueConnected = new Set(
    (connectedUsers ?? []).map((c) => c.user_id)
  ).size;

  const activationRate =
    (totalUsers ?? 0) > 0
      ? uniqueConnected / (totalUsers ?? 1)
      : null;

  // Freshness P50: median seconds since last sync per connection
  const { data: recentEvents } = await supabase
    .from("sync_events")
    .select("user_id, created_at")
    .eq("agency_id", agencyId)
    .in("event_type", ["backfill_page", "delta_poll", "webhook"])
    .order("created_at", { ascending: false })
    .limit(200);

  const latestPerUser = new Map<string, string>();
  for (const ev of recentEvents ?? []) {
    if (!latestPerUser.has(ev.user_id)) {
      latestPerUser.set(ev.user_id, ev.created_at);
    }
  }

  const now = Date.now();
  const freshnessSamples = [...latestPerUser.values()]
    .map((ts) => Math.round((now - new Date(ts).getTime()) / 1000))
    .sort((a, b) => a - b);

  const freshnessP50 =
    freshnessSamples.length > 0
      ? freshnessSamples[Math.floor(freshnessSamples.length / 2)]
      : null;

  // Error count (last 24h)
  const oneDayAgo = new Date(now - 86_400_000).toISOString();
  const { count: errorCount } = await supabase
    .from("sync_events")
    .select("id", { count: "exact", head: true })
    .eq("agency_id", agencyId)
    .gte("created_at", oneDayAgo)
    .like("event_type", "%error%");

  return {
    agencyId,
    connectionCountGoogle: googleCount ?? 0,
    connectionCountMicrosoft: msCount ?? 0,
    messagesSyncedTotal: totalMessages ?? 0,
    matchPrecisionRate: matchRate,
    activationRate,
    freshnessP50Seconds: freshnessP50,
    errorCount: errorCount ?? 0,
    period: "daily",
  };
}
