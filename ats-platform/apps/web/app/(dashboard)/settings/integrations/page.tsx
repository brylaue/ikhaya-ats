"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Mail, Power, PowerOff, Trash2, Shield, RefreshCw,
  ExternalLink, AlertTriangle, Check, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { WebhooksSection } from "@/components/settings/webhooks-section";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ConnectionInfo {
  id: string;
  provider: "google" | "microsoft";
  email: string;
  syncEnabled: boolean;
  msTenantId: string | null;
  createdAt: string;
  lastSyncAt: string | null; // from sync_events
}

interface MsTenantInfo {
  msTenantId: string;
  adminConsented: boolean;
  adminConsentedAt: string | null;
  adminConsentedByEmail: string | null;
}

// ─── Data hooks ──────────────────────────────────────────────────────────────

function useIntegrationsData() {
  const [google, setGoogle] = useState<ConnectionInfo | null>(null);
  const [microsoft, setMicrosoft] = useState<ConnectionInfo | null>(null);
  const [msTenant, setMsTenant] = useState<MsTenantInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      setLoading(false);
      return;
    }

    // Fetch connections
    const { data: conns } = await supabase
      .from("provider_connections")
      .select("id, provider, email, sync_enabled, ms_tenant_id, created_at")
      .eq("user_id", authData.user.id);

    // Fetch latest sync timestamps per provider
    const { data: syncEvents } = await supabase
      .from("sync_events")
      .select("provider, occurred_at")
      .eq("user_id", authData.user.id)
      .in("event_type", ["backfill_page", "delta_poll", "webhook"])
      .order("occurred_at", { ascending: false })
      .limit(10);

    // Build a map: provider → latest sync timestamp
    const latestSync: Record<string, string> = {};
    for (const ev of syncEvents ?? []) {
      if (!latestSync[ev.provider]) {
        latestSync[ev.provider] = ev.occurred_at;
      }
    }

    const mapped = (conns ?? []).map((r): ConnectionInfo => ({
      id: r.id,
      provider: r.provider as "google" | "microsoft",
      email: r.email,
      syncEnabled: r.sync_enabled,
      msTenantId: r.ms_tenant_id ?? null,
      createdAt: r.created_at,
      lastSyncAt: latestSync[r.provider] ?? null,
    }));

    setGoogle(mapped.find((c) => c.provider === "google") ?? null);
    setMicrosoft(mapped.find((c) => c.provider === "microsoft") ?? null);

    // Check if user is a tenant admin (check role from users table)
    const { data: userRow } = await supabase
      .from("users")
      .select("role, agency_id")
      .eq("id", authData.user.id)
      .single();

    const adminRoles = ["owner", "admin"];
    setIsAdmin(adminRoles.includes(userRow?.role ?? ""));

    // Fetch MS tenant info if Microsoft is connected
    const msConn = mapped.find((c) => c.provider === "microsoft");
    if (msConn?.msTenantId && userRow?.agency_id) {
      const { data: tenantRow } = await supabase
        .from("ikhaya_tenant_ms_tenants")
        .select("ms_tenant_id, admin_consented, admin_consented_at, admin_consented_by_email")
        .eq("ikhaya_agency_id", userRow.agency_id)
        .eq("ms_tenant_id", msConn.msTenantId)
        .single();

      if (tenantRow) {
        setMsTenant({
          msTenantId: tenantRow.ms_tenant_id,
          adminConsented: tenantRow.admin_consented,
          adminConsentedAt: tenantRow.admin_consented_at,
          adminConsentedByEmail: tenantRow.admin_consented_by_email,
        });
      }
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { google, microsoft, msTenant, isAdmin, loading, refresh };
}

// ─── Disconnect Confirm Dialog ───────────────────────────────────────────────

function DisconnectConfirmDialog({
  provider,
  onConfirm,
  onCancel,
}: {
  provider: "google" | "microsoft";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  const label = provider === "google" ? "Google Workspace" : "Microsoft 365";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
            <AlertTriangle className="h-5 w-5 text-red-600" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">
              Disconnect {label}?
            </h3>
            <p className="text-xs text-muted-foreground">This action cannot be undone</p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          This will revoke Ikhaya&apos;s access to your email, remove the connection,
          and schedule a full purge of any synced data. Candidate timeline
          entries linked to this provider will be removed.
        </p>

        <div className="mb-4">
          <label className="mb-1.5 block text-xs font-medium text-foreground">
            Type <span className="font-mono text-red-600">DISCONNECT</span> to confirm
          </label>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="DISCONNECT"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-red-500"
            autoFocus
          />
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={typed !== "DISCONNECT"}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Disconnect and purge data
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Provider Card ───────────────────────────────────────────────────────────

const PROVIDER_META = {
  google: {
    name: "Google Workspace",
    subtitle: "Gmail",
    color: "ring-red-400",
    bgColor: "bg-red-50",
    iconColor: "text-red-500",
  },
  microsoft: {
    name: "Microsoft 365",
    subtitle: "Outlook",
    color: "ring-brand-400",
    bgColor: "bg-brand-50",
    iconColor: "text-brand-500",
  },
} as const;

function ProviderCard({
  provider,
  connection,
  onRefresh,
}: {
  provider: "google" | "microsoft";
  connection: ConnectionInfo | null;
  onRefresh: () => void;
}) {
  const meta = PROVIDER_META[provider];
  const [toggling, setToggling] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  async function handleToggle() {
    setToggling(true);
    try {
      const res = await fetch(`/api/integrations/email/toggle?provider=${provider}`, {
        method: "PATCH",
      });
      if (!res.ok) throw new Error("Toggle failed");
      const data = await res.json();
      toast.success(data.syncEnabled ? "Sync enabled" : "Sync paused");
      onRefresh();
    } catch {
      toast.error("Failed to toggle sync");
    } finally {
      setToggling(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      const res = await fetch(`/api/integrations/email/disconnect?provider=${provider}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Disconnect failed");
      toast.success(`Disconnected from ${meta.name}`);
      setShowConfirm(false);
      onRefresh();
    } catch {
      toast.error("Failed to disconnect");
    } finally {
      setDisconnecting(false);
    }
  }

  // Format last sync time
  const lastSyncLabel = connection?.lastSyncAt
    ? new Date(connection.lastSyncAt).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  return (
    <>
      <div
        className={cn(
          "rounded-xl border border-border bg-card p-5 transition-all",
          connection && `ring-1 ${meta.color}`
        )}
      >
        {/* Header */}
        <div className="flex items-start gap-3 mb-4">
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
              meta.bgColor
            )}
          >
            <Mail className={cn("h-5 w-5", meta.iconColor)} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">{meta.name}</p>
            {connection ? (
              <p className="text-xs text-muted-foreground truncate">
                {connection.email}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Not connected</p>
            )}
          </div>
          {connection && (
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                connection.syncEnabled
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-amber-100 text-amber-700"
              )}
            >
              {connection.syncEnabled ? "Syncing" : "Paused"}
            </span>
          )}
        </div>

        {/* Connected state */}
        {connection ? (
          <div className="space-y-3">
            {/* Last sync */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Last sync</span>
              <span className="font-medium text-foreground">{lastSyncLabel}</span>
            </div>

            {/* Sync toggle */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Email sync</span>
              <button
                onClick={handleToggle}
                disabled={toggling}
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
                  connection.syncEnabled ? "bg-brand-600" : "bg-muted"
                )}
              >
                <span
                  className={cn(
                    "inline-block h-3.5 w-3.5 rounded-full bg-card shadow-sm transition-transform",
                    connection.syncEnabled ? "translate-x-4" : "translate-x-1"
                  )}
                />
              </button>
            </div>

            {/* Disconnect */}
            <button
              onClick={() => setShowConfirm(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Disconnect and purge data
            </button>
          </div>
        ) : (
          /* Disconnected state */
          <button
            onClick={() => {
              window.location.href = `${appUrl}/api/auth/${provider}/start`;
            }}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
            Connect
          </button>
        )}
      </div>

      {/* Disconnect confirm dialog */}
      {showConfirm && (
        <DisconnectConfirmDialog
          provider={provider}
          onConfirm={handleDisconnect}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  );
}

// ─── Admin Consent Card ──────────────────────────────────────────────────────

function AdminConsentCard({
  msTenant,
  isAdmin,
}: {
  msTenant: MsTenantInfo | null;
  isAdmin: boolean;
}) {
  if (!isAdmin || !msTenant) return null;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start gap-3 mb-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-50">
          <Shield className="h-5 w-5 text-violet-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">
            Organisation Admin Consent
          </p>
          <p className="text-xs text-muted-foreground">
            Grant Microsoft admin consent for your entire organisation
          </p>
        </div>
      </div>

      {msTenant.adminConsented ? (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-emerald-700">
            <Check className="h-4 w-4" />
            <span className="font-medium">Admin consent granted</span>
          </div>
          {msTenant.adminConsentedByEmail && (
            <p className="mt-1 text-xs text-emerald-600">
              By {msTenant.adminConsentedByEmail}
              {msTenant.adminConsentedAt &&
                ` on ${new Date(msTenant.adminConsentedAt).toLocaleDateString()}`}
            </p>
          )}
        </div>
      ) : (
        <button
          onClick={() => {
            window.location.href = `${appUrl}/api/auth/microsoft/adminconsent?ms_tenant_id=${msTenant.msTenantId}`;
          }}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 transition-colors"
        >
          <Shield className="h-4 w-4" />
          Grant admin consent for your organisation
        </button>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function IntegrationsSettingsPage() {
  const { google, microsoft, msTenant, isAdmin, loading, refresh } =
    useIntegrationsData();

  if (loading) {
    return (
      <div className="space-y-6 max-w-2xl p-8">
        <div>
          <h2 className="text-base font-semibold text-foreground">Integrations</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-2xl p-8">
      {/* Header */}
      <div>
        <h2 className="text-base font-semibold text-foreground">
          Email Integrations
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Connect your email to automatically match messages to candidates
        </p>
      </div>

      {/* Provider cards — side by side */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ProviderCard
          provider="google"
          connection={google}
          onRefresh={refresh}
        />
        <ProviderCard
          provider="microsoft"
          connection={microsoft}
          onRefresh={refresh}
        />
      </div>

      {/* Microsoft admin consent (only for tenant admins with MS connected) */}
      {microsoft && (
        <AdminConsentCard msTenant={msTenant} isAdmin={isAdmin} />
      )}

      {/* Outbound Webhooks (US-083) */}
      <div className="border-t border-border pt-8">
        <WebhooksSection />
      </div>
    </div>
  );
}
