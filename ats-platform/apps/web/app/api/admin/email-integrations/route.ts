/**
 * GET /api/admin/email-integrations
 *
 * Admin-only endpoint. Returns all users in the tenant with their
 * email integration state, aggregate KPIs, and MS tenant consent info.
 *
 * Stage 10.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MANAGER_ROLES, isValidEnumValue } from "@/lib/constants";

export async function GET(req: NextRequest) {
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

  const agencyId = userRow.agency_id;

  // Fetch all users in the agency
  const { data: agencyUsers } = await supabase
    .from("users")
    .select("id, email, first_name, last_name, full_name, role")
    .eq("agency_id", agencyId)
    .order("full_name");

  // Fetch all connections in the agency
  const { data: connections } = await supabase
    .from("provider_connections")
    .select(
      "id, user_id, provider, email, sync_enabled, ms_tenant_id, created_at, error_state"
    )
    .eq("agency_id", agencyId);

  // Fetch latest sync timestamps (last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data: recentSyncEvents } = await supabase
    .from("sync_events")
    .select("user_id, provider, event_type, messages_processed, occurred_at, created_at")
    .eq("agency_id", agencyId)
    .gte("created_at", sevenDaysAgo)
    .order("created_at", { ascending: false });

  // Build per-user summaries
  const connMap = new Map<string, typeof connections>();
  for (const conn of connections ?? []) {
    const key = conn.user_id;
    if (!connMap.has(key)) connMap.set(key, []);
    connMap.get(key)!.push(conn);
  }

  // Build per-user message counts (last 7d)
  const msgCountMap = new Map<string, number>();
  for (const ev of recentSyncEvents ?? []) {
    const curr = msgCountMap.get(ev.user_id) ?? 0;
    msgCountMap.set(ev.user_id, curr + (ev.messages_processed ?? 0));
  }

  // Build per-user last_sync
  const lastSyncMap = new Map<string, string>();
  for (const ev of recentSyncEvents ?? []) {
    if (!lastSyncMap.has(ev.user_id)) {
      lastSyncMap.set(ev.user_id, ev.created_at ?? ev.occurred_at);
    }
  }

  const users = (agencyUsers ?? []).map((u) => {
    const userConns = connMap.get(u.id) ?? [];
    const googleConn = userConns.find((c) => c.provider === "google");
    const msConn = userConns.find((c) => c.provider === "microsoft");

    return {
      id: u.id,
      email: u.email,
      fullName: u.full_name,
      role: u.role,
      google: googleConn
        ? {
            connected: true,
            email: googleConn.email,
            lastSync: lastSyncMap.get(u.id) ?? null,
            syncEnabled: googleConn.sync_enabled,
            errorState: googleConn.error_state ?? null,
          }
        : { connected: false },
      microsoft: msConn
        ? {
            connected: true,
            email: msConn.email,
            lastSync: lastSyncMap.get(u.id) ?? null,
            syncEnabled: msConn.sync_enabled,
            msTenantId: msConn.ms_tenant_id ?? null,
            errorState: msConn.error_state ?? null,
          }
        : { connected: false },
      messagesSynced7d: msgCountMap.get(u.id) ?? 0,
    };
  });

  // Aggregate KPIs
  const totalConnections = (connections ?? []).length;
  const last24h = new Date(Date.now() - 86_400_000).toISOString();
  const last24hEvents = (recentSyncEvents ?? []).filter(
    (e) => (e.created_at ?? e.occurred_at) >= last24h
  );
  const totalMessages24h = last24hEvents.reduce(
    (s, e) => s + (e.messages_processed ?? 0),
    0
  );
  const errorEvents = last24hEvents.filter((e) =>
    e.event_type?.includes("error")
  );
  const errorRate =
    last24hEvents.length > 0
      ? Math.round((errorEvents.length / last24hEvents.length) * 100)
      : 0;

  // Freshness: average seconds since last sync across all connected users
  const freshnessSamples: number[] = [];
  const now = Date.now();
  for (const [, ts] of lastSyncMap) {
    freshnessSamples.push(Math.round((now - new Date(ts).getTime()) / 1000));
  }
  freshnessSamples.sort((a, b) => a - b);
  const avgFreshness =
    freshnessSamples.length > 0
      ? Math.round(
          freshnessSamples.reduce((s, v) => s + v, 0) /
            freshnessSamples.length
        )
      : null;

  // MS tenant consent info
  const { data: msTenants } = await supabase
    .from("ikhaya_tenant_ms_tenants")
    .select(
      "ms_tenant_id, admin_consented, admin_consented_at, admin_consented_by_email"
    )
    .eq("ikhaya_agency_id", agencyId);

  // Count users per MS tenant
  const msTenantUserCounts = new Map<string, number>();
  for (const conn of connections ?? []) {
    if (conn.provider === "microsoft" && conn.ms_tenant_id) {
      msTenantUserCounts.set(
        conn.ms_tenant_id,
        (msTenantUserCounts.get(conn.ms_tenant_id) ?? 0) + 1
      );
    }
  }

  const msTenantInfo = (msTenants ?? []).map((t) => ({
    msTenantId: t.ms_tenant_id,
    adminConsented: t.admin_consented,
    consentedAt: t.admin_consented_at,
    consentedByEmail: t.admin_consented_by_email,
    userCount: msTenantUserCounts.get(t.ms_tenant_id) ?? 0,
  }));

  return NextResponse.json({
    users,
    kpis: {
      totalConnections,
      totalMessages24h,
      avgFreshness,
      errorRate,
    },
    msTenants: msTenantInfo,
  });
}
