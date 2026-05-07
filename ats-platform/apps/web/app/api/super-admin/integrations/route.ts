/**
 * GET /api/super-admin/integrations
 * US-464: Per-tenant integration inventory + sync health.
 *
 * Two data sources combined:
 *  • agency_connectors  — marketplace connectors (Broadbean, Gong, etc.)
 *  • provider_connections — auth-style integrations (Gmail, Microsoft, Stripe)
 *
 * Returns a flat row per (tenant, integration) plus aggregate health counts.
 * Optional ?status=error to drill into broken connectors only.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const SUPER_ADMIN_EMAILS = (process.env.SUPER_ADMIN_EMAILS ?? "")
  .split(",").map(e => e.trim().toLowerCase()).filter(Boolean);

interface IntegrationRow {
  agencyId:     string;
  tenantName:   string;
  source:       "marketplace" | "auth";
  key:          string;          // connector_key or provider
  enabled:      boolean;
  status:       "ok" | "warning" | "error" | "never" | "active" | "expired" | "revoked";
  lastSyncAt:   string | null;
  lastError:    string | null;
  errorCount7d: number;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email || !SUPER_ADMIN_EMAILS.includes(user.email.toLowerCase())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const filter = req.nextUrl.searchParams.get("status");
  const db = createServiceClient();

  const [agenciesRes, marketplaceRes, providerRes] = await Promise.all([
    db.from("agencies").select("id, name").order("name"),
    db.from("agency_connectors").select("agency_id, connector_key, enabled, last_sync_at, last_sync_status, last_error, error_count_7d"),
    db.from("provider_connections").select("agency_id, provider, status, last_sync_at, last_error"),
  ]);

  if (agenciesRes.error) {
    return NextResponse.json({ error: agenciesRes.error.message }, { status: 500 });
  }

  const nameMap = new Map((agenciesRes.data ?? []).map((a: { id: string; name: string }) => [a.id, a.name]));
  const rows: IntegrationRow[] = [];

  for (const r of marketplaceRes.data ?? []) {
    rows.push({
      agencyId:     r.agency_id,
      tenantName:   nameMap.get(r.agency_id) ?? "(unknown)",
      source:       "marketplace",
      key:          r.connector_key,
      enabled:      r.enabled,
      status:       (r.last_sync_status ?? "never") as IntegrationRow["status"],
      lastSyncAt:   r.last_sync_at,
      lastError:    r.last_error,
      errorCount7d: r.error_count_7d ?? 0,
    });
  }

  for (const p of providerRes.data ?? []) {
    rows.push({
      agencyId:     p.agency_id,
      tenantName:   nameMap.get(p.agency_id) ?? "(unknown)",
      source:       "auth",
      key:          p.provider,
      enabled:      p.status === "active",
      status:       (p.status ?? "active") as IntegrationRow["status"],
      lastSyncAt:   p.last_sync_at ?? null,
      lastError:    p.last_error ?? null,
      errorCount7d: 0,
    });
  }

  // Filter
  let filtered = rows;
  if (filter === "error")    filtered = rows.filter(r => r.status === "error" || r.status === "expired" || r.status === "revoked");
  if (filter === "warning")  filtered = rows.filter(r => r.status === "warning");

  // Aggregate health
  const totals = {
    total:    rows.length,
    error:    rows.filter(r => ["error","expired","revoked"].includes(r.status)).length,
    warning:  rows.filter(r => r.status === "warning").length,
    ok:       rows.filter(r => ["ok","active"].includes(r.status)).length,
    never:    rows.filter(r => r.status === "never").length,
    tenantsWithErrors: new Set(rows.filter(r => ["error","expired","revoked"].includes(r.status)).map(r => r.agencyId)).size,
  };

  return NextResponse.json({ rows: filtered, totals });
}
