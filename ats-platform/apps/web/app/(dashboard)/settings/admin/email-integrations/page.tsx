"use client";

/**
 * Admin Email Integrations Dashboard — Stage 10.
 *
 * Visible only to users with role "owner" or "admin".
 * Shows all tenant users' connection state, KPIs, MS tenant consent,
 * and force-disconnect actions.
 */

import { useState, useEffect, useCallback } from "react";
import {
  Mail, Shield, AlertTriangle, RefreshCw, Activity,
  Users, Zap, Clock, Filter, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ProviderState {
  connected: boolean;
  email?: string;
  lastSync?: string | null;
  syncEnabled?: boolean;
  msTenantId?: string | null;
  errorState?: string | null;
}

interface UserRow {
  id: string;
  email: string;
  fullName: string;
  role: string;
  google: ProviderState;
  microsoft: ProviderState;
  messagesSynced7d: number;
}

interface KPIs {
  totalConnections: number;
  totalMessages24h: number;
  avgFreshness: number | null;
  errorRate: number;
}

interface MsTenantRow {
  msTenantId: string;
  adminConsented: boolean;
  consentedAt: string | null;
  consentedByEmail: string | null;
  userCount: number;
}

type FilterChip = "all" | "google_only" | "microsoft_only" | "sync_paused" | "never_connected";

// ─── Data fetcher ───────────────────────────────────────────────────────────

function useAdminData() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [msTenants, setMsTenants] = useState<MsTenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/email-integrations");
      if (res.status === 403 || res.status === 401) {
        setUnauthorized(true);
        return;
      }
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setUsers(data.users ?? []);
      setKpis(data.kpis ?? null);
      setMsTenants(data.msTenants ?? []);
    } catch {
      toast.error("Failed to load admin data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { users, kpis, msTenants, loading, unauthorized, refresh };
}

// ─── KPI strip ──────────────────────────────────────────────────────────────

function KPIStrip({ kpis }: { kpis: KPIs }) {
  const freshLabel =
    kpis.avgFreshness != null
      ? kpis.avgFreshness < 3600
        ? `${Math.round(kpis.avgFreshness / 60)}m`
        : `${Math.round(kpis.avgFreshness / 3600)}h`
      : "—";

  const items = [
    {
      label: "Total Connections",
      value: kpis.totalConnections,
      icon: Users,
      iconBg: "bg-brand-50",
      iconColor: "text-brand-600",
    },
    {
      label: "Messages (24h)",
      value: kpis.totalMessages24h,
      icon: Mail,
      iconBg: "bg-violet-50",
      iconColor: "text-violet-600",
    },
    {
      label: "Avg Freshness",
      value: freshLabel,
      icon: Clock,
      iconBg: "bg-emerald-50",
      iconColor: "text-emerald-600",
    },
    {
      label: "Error Rate",
      value: `${kpis.errorRate}%`,
      icon: AlertTriangle,
      iconBg: kpis.errorRate > 5 ? "bg-red-50" : "bg-slate-50",
      iconColor: kpis.errorRate > 5 ? "text-red-600" : "text-slate-600",
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {item.label}
            </p>
            <div className={cn("rounded-lg p-1.5", item.iconBg)}>
              <item.icon className={cn("h-3.5 w-3.5", item.iconColor)} />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-foreground">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

// ─── MS Tenant consent panel ────────────────────────────────────────────────

function MsTenantPanel({ tenants }: { tenants: MsTenantRow[] }) {
  if (tenants.length === 0) return null;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-3">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-violet-500" />
          <h3 className="text-sm font-semibold text-foreground">
            Microsoft Tenant Admin Consent
          </h3>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Manage admin consent for linked Microsoft 365 tenants
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {["MS Tenant ID", "Admin Consented", "Consented At", "Consented By", "Users", "Action"].map(
                (h) => (
                  <th
                    key={h}
                    className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => (
              <tr
                key={t.msTenantId}
                className="border-b border-border last:border-0 hover:bg-accent/40 transition-colors"
              >
                <td className="px-4 py-3 text-xs font-mono text-foreground">
                  {t.msTenantId.slice(0, 12)}...
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      t.adminConsented
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-700"
                    )}
                  >
                    {t.adminConsented ? "Yes" : "No"}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {t.consentedAt
                    ? new Date(t.consentedAt).toLocaleDateString()
                    : "—"}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {t.consentedByEmail ?? "—"}
                </td>
                <td className="px-4 py-3 text-sm font-semibold text-foreground">
                  {t.userCount}
                </td>
                <td className="px-4 py-3">
                  {!t.adminConsented && (
                    <button
                      onClick={() => {
                        window.location.href = `${appUrl}/api/auth/microsoft/adminconsent?ms_tenant_id=${t.msTenantId}`;
                      }}
                      className="rounded-md bg-violet-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-violet-700 transition-colors"
                    >
                      Request consent
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── User table ─────────────────────────────────────────────────────────────

function ConnectionBadge({
  state,
  provider,
}: {
  state: ProviderState;
  provider: string;
}) {
  if (!state.connected) {
    return (
      <span className="text-[10px] text-muted-foreground">Not connected</span>
    );
  }

  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-semibold",
            state.syncEnabled
              ? "bg-emerald-100 text-emerald-700"
              : "bg-amber-100 text-amber-700"
          )}
        >
          {state.syncEnabled ? "Active" : "Paused"}
        </span>
        {state.errorState && (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
            {state.errorState}
          </span>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground truncate max-w-[140px]">
        {state.email}
      </p>
      {state.lastSync && (
        <p className="text-[10px] text-muted-foreground">
          Last:{" "}
          {new Date(state.lastSync).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      )}
    </div>
  );
}

function UserTable({
  users,
  filter,
  onForceDisconnect,
}: {
  users: UserRow[];
  filter: FilterChip;
  onForceDisconnect: (userId: string, provider: "google" | "microsoft") => void;
}) {
  const filtered = users.filter((u) => {
    switch (filter) {
      case "google_only":
        return u.google.connected && !u.microsoft.connected;
      case "microsoft_only":
        return u.microsoft.connected && !u.google.connected;
      case "sync_paused":
        return (
          (u.google.connected && !u.google.syncEnabled) ||
          (u.microsoft.connected && !u.microsoft.syncEnabled)
        );
      case "never_connected":
        return !u.google.connected && !u.microsoft.connected;
      default:
        return true;
    }
  });

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            User Connections
          </h3>
          <p className="text-xs text-muted-foreground">
            {filtered.length} of {users.length} users
          </p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {[
                "User",
                "Google",
                "Microsoft",
                "Messages (7d)",
                "Actions",
              ].map((h) => (
                <th
                  key={h}
                  className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-sm text-muted-foreground"
                >
                  No users match this filter
                </td>
              </tr>
            ) : (
              filtered.map((u) => (
                <tr
                  key={u.id}
                  className="border-b border-border last:border-0 hover:bg-accent/40 transition-colors"
                >
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-foreground">
                      {u.fullName}
                    </p>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <ConnectionBadge state={u.google} provider="google" />
                  </td>
                  <td className="px-4 py-3">
                    <ConnectionBadge state={u.microsoft} provider="microsoft" />
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-foreground">
                    {u.messagesSynced7d}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      {u.google.connected && (
                        <button
                          onClick={() => onForceDisconnect(u.id, "google")}
                          className="rounded-md border border-red-200 px-2 py-1 text-[10px] font-medium text-red-600 hover:bg-red-50 transition-colors"
                        >
                          Disconnect Google
                        </button>
                      )}
                      {u.microsoft.connected && (
                        <button
                          onClick={() => onForceDisconnect(u.id, "microsoft")}
                          className="rounded-md border border-red-200 px-2 py-1 text-[10px] font-medium text-red-600 hover:bg-red-50 transition-colors"
                        >
                          Disconnect Microsoft
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

const FILTER_OPTIONS: { key: FilterChip; label: string }[] = [
  { key: "all", label: "All" },
  { key: "google_only", label: "Google only" },
  { key: "microsoft_only", label: "Microsoft only" },
  { key: "sync_paused", label: "Sync paused" },
  { key: "never_connected", label: "Never connected" },
];

export default function AdminEmailIntegrationsPage() {
  const { users, kpis, msTenants, loading, unauthorized, refresh } =
    useAdminData();
  const [filter, setFilter] = useState<FilterChip>("all");
  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  async function handleForceDisconnect(
    userId: string,
    provider: "google" | "microsoft"
  ) {
    const label = provider === "google" ? "Google" : "Microsoft";
    if (
      !confirm(
        `Force disconnect ${label} for this user? This will purge all their synced email data.`
      )
    ) {
      return;
    }

    const key = `${userId}-${provider}`;
    setDisconnecting(key);
    try {
      const res = await fetch(
        "/api/admin/email-integrations/force-disconnect",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, provider }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed");
      }
      toast.success(`${label} disconnected and data purged`);
      refresh();
    } catch (err) {
      toast.error(
        `Failed to disconnect: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setDisconnecting(null);
    }
  }

  if (unauthorized) {
    return (
      <div className="flex items-center justify-center p-16">
        <div className="text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
          <p className="mt-2 text-sm font-medium text-foreground">
            Admin access required
          </p>
          <p className="text-xs text-muted-foreground">
            Only agency owners and admins can view this page.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6 p-8 max-w-5xl">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            Email Integrations Admin
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            Email Integrations Admin
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Manage email sync connections across your agency
          </p>
        </div>
        <button
          onClick={refresh}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {/* KPI strip */}
      {kpis && <KPIStrip kpis={kpis} />}

      {/* Filter chips */}
      <div className="flex gap-2">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setFilter(opt.key)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              filter === opt.key
                ? "bg-brand-600 text-white"
                : "bg-muted text-muted-foreground hover:bg-accent"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* User connections table */}
      <UserTable
        users={users}
        filter={filter}
        onForceDisconnect={handleForceDisconnect}
      />

      {/* MS Tenant consent panel */}
      <MsTenantPanel tenants={msTenants} />
    </div>
  );
}
