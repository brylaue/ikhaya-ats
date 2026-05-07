"use client";

/**
 * /settings/api-keys — Service Accounts & Scoped API Keys (US-401)
 *
 * Owners and admins can:
 *  - View masked API keys (only prefix shown, never full key)
 *  - Create new keys (requires email OTP verification, US-400)
 *  - Revoke keys
 *  - See last-used timestamp and scopes
 *
 * The full key is displayed ONCE in a modal immediately after creation.
 */

import { useState, useEffect, useCallback } from "react";
import { Key, Plus, Trash2, Copy, Check, Clock, Shield, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useEmailVerification, EmailVerifyModal } from "@/components/auth/email-verify-modal";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ApiKey {
  id:         string;
  name:       string;
  keyPrefix:  string;
  scopes:     string[];
  lastUsedAt: string | null;
  expiresAt:  string | null;
  revokedAt:  string | null;
  createdAt:  string;
}

// ─── Scope config ─────────────────────────────────────────────────────────────

const SCOPE_GROUPS = [
  {
    label: "Candidates",
    scopes: [
      { value: "candidates:read",  label: "Read candidates" },
      { value: "candidates:write", label: "Write candidates" },
    ],
  },
  {
    label: "Jobs",
    scopes: [
      { value: "jobs:read",  label: "Read jobs" },
      { value: "jobs:write", label: "Write jobs" },
    ],
  },
  {
    label: "Placements",
    scopes: [
      { value: "placements:read",  label: "Read placements" },
      { value: "placements:write", label: "Write placements" },
    ],
  },
  {
    label: "Clients",
    scopes: [
      { value: "clients:read",  label: "Read clients" },
      { value: "clients:write", label: "Write clients" },
    ],
  },
  {
    label: "Applications",
    scopes: [
      { value: "applications:read",  label: "Read applications" },
      { value: "applications:write", label: "Write applications" },
    ],
  },
  {
    label: "Other",
    scopes: [
      { value: "webhooks:read",  label: "Read webhooks" },
      { value: "webhooks:write", label: "Write webhooks" },
      { value: "analytics:read", label: "Read analytics" },
    ],
  },
];

// ─── Create Key Modal ─────────────────────────────────────────────────────────

function CreateKeyModal({
  onCreated,
  onCancel,
}: {
  onCreated: (key: string, keyData: ApiKey) => void;
  onCancel: () => void;
}) {
  const [name, setName]               = useState("");
  const [scopes, setScopes]           = useState<Set<string>>(new Set());
  const [expiresInDays, setExpires]   = useState<number | "">(90);
  const [creating, setCreating]       = useState(false);
  const { verify, modal: verifyModal } = useEmailVerification();

  function toggleScope(scope: string) {
    setScopes(prev => {
      const next = new Set(prev);
      if (next.has(scope)) next.delete(scope);
      else next.add(scope);
      return next;
    });
  }

  async function handleCreate() {
    if (!name.trim() || scopes.size === 0) return;

    // Require email OTP (US-400)
    const verifyToken = await verify("api_key_create");
    if (!verifyToken) return;

    setCreating(true);
    try {
      const res = await fetch("/api/keys", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          name:         name.trim(),
          scopes:       Array.from(scopes),
          expiresInDays: expiresInDays || null,
          verifyToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to create API key");
        return;
      }
      onCreated(data.key, {
        id:         data.id,
        name:       data.name,
        keyPrefix:  data.keyPrefix,
        scopes:     data.scopes,
        lastUsedAt: null,
        expiresAt:  data.expiresAt,
        revokedAt:  null,
        createdAt:  data.createdAt,
      });
    } catch {
      toast.error("Failed to create API key");
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-xl max-h-[90vh] overflow-y-auto">
          <h3 className="text-base font-semibold text-foreground mb-5">Create API Key</h3>

          {/* Name */}
          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-medium text-foreground">
              Key name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Zapier integration"
              autoFocus
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {/* Scopes */}
          <div className="mb-4">
            <p className="mb-2 text-xs font-medium text-foreground">Permissions (scopes)</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              {SCOPE_GROUPS.map((group) => (
                <div key={group.label}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                    {group.label}
                  </p>
                  <div className="space-y-1.5">
                    {group.scopes.map((s) => (
                      <label key={s.value} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={scopes.has(s.value)}
                          onChange={() => toggleScope(s.value)}
                          className="rounded border-border accent-brand-600"
                        />
                        <span className="text-xs text-foreground">{s.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Expiry */}
          <div className="mb-6">
            <label className="mb-1.5 block text-xs font-medium text-foreground">
              Expiry
            </label>
            <select
              value={expiresInDays}
              onChange={(e) => setExpires(e.target.value ? Number(e.target.value) : "")}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
              <option value={180}>6 months</option>
              <option value={365}>1 year</option>
              <option value="">Never expires</option>
            </select>
          </div>

          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="flex-1 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!name.trim() || scopes.size === 0 || creating}
              className="flex flex-1 items-center justify-center gap-2 rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              Create key
            </button>
          </div>
        </div>
      </div>

      {/* Email verification modal */}
      {verifyModal && (
        <EmailVerifyModal action={verifyModal.action} onClose={verifyModal.onClose} />
      )}
    </>
  );
}

// ─── New Key Display Modal ────────────────────────────────────────────────────

function NewKeyModal({ rawKey, onClose }: { rawKey: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(rawKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
        <div className="flex items-start gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Copy your API key</p>
            <p className="text-xs text-muted-foreground">
              This is the only time you&apos;ll see the full key. Store it securely.
            </p>
          </div>
        </div>

        <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
          <code className="flex-1 text-xs font-mono text-foreground break-all">{rawKey}</code>
          <button
            onClick={copy}
            className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent transition-colors"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>

        <button
          onClick={onClose}
          className="w-full rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
        >
          I&apos;ve copied it — done
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ApiKeysPage() {
  const [keys, setKeys]               = useState<ApiKey[]>([]);
  const [loading, setLoading]         = useState(true);
  const [showCreate, setShowCreate]   = useState(false);
  const [newRawKey, setNewRawKey]     = useState<string | null>(null);
  const [revoking, setRevoking]       = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/keys");
      const data = await res.json();
      setKeys((data.keys ?? []).map((k: Record<string, unknown>) => ({
        id:         k.id,
        name:       k.name,
        keyPrefix:  k.key_prefix,
        scopes:     k.scopes,
        lastUsedAt: k.last_used_at ?? null,
        expiresAt:  k.expires_at ?? null,
        revokedAt:  k.revoked_at ?? null,
        createdAt:  k.created_at,
      })));
    } catch {
      toast.error("Failed to load API keys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  function handleCreated(rawKey: string, keyData: ApiKey) {
    setShowCreate(false);
    setKeys(prev => [keyData, ...prev]);
    setNewRawKey(rawKey);
  }

  async function handleRevoke(id: string) {
    setRevoking(id);
    try {
      const res = await fetch(`/api/keys/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("API key revoked");
      setKeys(prev => prev.map(k => k.id === id ? { ...k, revokedAt: new Date().toISOString() } : k));
    } catch {
      toast.error("Failed to revoke key");
    } finally {
      setRevoking(null);
    }
  }

  const activeKeys  = keys.filter(k => !k.revokedAt);
  const revokedKeys = keys.filter(k =>  k.revokedAt);

  return (
    <div className="max-w-2xl px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-foreground">API Keys</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Long-lived keys for machine-to-machine integrations
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New key
        </button>
      </div>

      {/* Active keys */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading…
        </div>
      ) : (
        <div className="space-y-3">
          {activeKeys.length === 0 && (
            <div className="rounded-xl border border-border border-dashed p-8 text-center">
              <Key className="mx-auto h-8 w-8 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-foreground">No API keys yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Create a key to enable machine-to-machine integrations
              </p>
            </div>
          )}

          {activeKeys.map((key) => {
            const isExpired = key.expiresAt && new Date(key.expiresAt) < new Date();
            return (
              <div
                key={key.id}
                className={cn(
                  "rounded-xl border border-border bg-card p-4",
                  isExpired && "opacity-60"
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Key className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="text-sm font-medium text-foreground truncate">{key.name}</span>
                      {isExpired && (
                        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                          Expired
                        </span>
                      )}
                    </div>
                    <code className="text-xs text-muted-foreground font-mono">
                      {key.keyPrefix}••••••••••••••••••••••••••••••••
                    </code>

                    {/* Scopes */}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {key.scopes.map((scope) => (
                        <span
                          key={scope}
                          className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-700"
                        >
                          {scope}
                        </span>
                      ))}
                    </div>

                    {/* Meta */}
                    <div className="mt-2 flex items-center gap-4 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Created {new Date(key.createdAt).toLocaleDateString()}
                      </span>
                      {key.lastUsedAt && (
                        <span>Last used {new Date(key.lastUsedAt).toLocaleDateString()}</span>
                      )}
                      {key.expiresAt && (
                        <span className="flex items-center gap-1">
                          <Shield className="h-3 w-3" />
                          Expires {new Date(key.expiresAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => handleRevoke(key.id)}
                    disabled={revoking === key.id}
                    className="shrink-0 flex items-center gap-1.5 rounded-md border border-red-200 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-40 transition-colors"
                  >
                    {revoking === key.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                    Revoke
                  </button>
                </div>
              </div>
            );
          })}

          {/* Revoked keys (collapsed) */}
          {revokedKeys.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors list-none flex items-center gap-1.5">
                <span className="group-open:hidden">▶</span>
                <span className="hidden group-open:inline">▼</span>
                {revokedKeys.length} revoked key{revokedKeys.length !== 1 ? "s" : ""}
              </summary>
              <div className="mt-2 space-y-2">
                {revokedKeys.map((key) => (
                  <div
                    key={key.id}
                    className="rounded-lg border border-border bg-muted/20 p-3 opacity-50"
                  >
                    <div className="flex items-center gap-2">
                      <Key className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground line-through">{key.name}</span>
                      <code className="text-xs text-muted-foreground font-mono ml-2">
                        {key.keyPrefix}…
                      </code>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* Security note */}
      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <p className="text-xs font-semibold text-foreground mb-1">Security notes</p>
        <ul className="text-xs text-muted-foreground space-y-1">
          <li>• API keys are never stored in plain text — only the prefix is shown after creation</li>
          <li>• Creating a key requires email verification (one-time code)</li>
          <li>• Rotate keys regularly and revoke any you no longer use</li>
          <li>• All key usage is audit-logged by key and action</li>
        </ul>
      </div>

      {/* Create modal */}
      {showCreate && (
        <CreateKeyModal
          onCreated={handleCreated}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {/* One-time key display */}
      {newRawKey && (
        <NewKeyModal rawKey={newRawKey} onClose={() => setNewRawKey(null)} />
      )}
    </div>
  );
}
