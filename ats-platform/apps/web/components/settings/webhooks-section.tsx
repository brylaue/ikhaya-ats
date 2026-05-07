"use client";

/**
 * WebhooksSection
 * US-083: Outbound webhook endpoint management UI.
 *
 * Allows owners/admins to:
 *   - Add webhook endpoints (URL + optional description + event filter)
 *   - View existing endpoints with delivery stats
 *   - Rotate signing secrets (increments secret_version, issues new secret)
 *   - Toggle endpoint active/inactive
 *   - Delete endpoints
 */

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import {
  Webhook,
  Plus,
  Trash2,
  RefreshCw,
  Copy,
  Eye,
  EyeOff,
  Power,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import crypto from "crypto";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface WebhookEndpoint {
  id: string;
  url: string;
  description: string | null;
  events: string[];
  is_active: boolean;
  secret: string;
  secret_version: number;
  created_at: string;
}

interface DeliveryStats {
  total: number;
  success: number;
  failed: number;
  dead_lettered: number;
}

// ─── Available event types ────────────────────────────────────────────────────

const EVENT_TYPES = [
  "candidate.created",
  "candidate.updated",
  "candidate.stage_changed",
  "placement.created",
  "placement.updated",
  "application.created",
  "application.updated",
  "job.created",
  "job.updated",
  "job.filled",
] as const;

// ─── Component ────────────────────────────────────────────────────────────────

function generateSecret(): string {
  // 32 random bytes → hex → prefix
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return "whsec_" + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

export function WebhooksSection() {
  const [endpoints, setEndpoints]   = useState<WebhookEndpoint[]>([]);
  const [stats,     setStats]       = useState<Record<string, DeliveryStats>>({});
  const [loading,   setLoading]     = useState(true);
  const [adding,    setAdding]      = useState(false);
  const [expanded,  setExpanded]    = useState<string | null>(null);
  const [revealed,  setRevealed]    = useState<string | null>(null);
  const [newUrl,    setNewUrl]      = useState("");
  const [newDesc,   setNewDesc]     = useState("");
  const [newEvents, setNewEvents]   = useState<string[]>([]);
  const [saving,    setSaving]      = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("webhook_endpoints")
      .select("id, url, description, events, is_active, secret, secret_version, created_at")
      .order("created_at", { ascending: false });
    setEndpoints((data as WebhookEndpoint[]) ?? []);

    if (data && data.length > 0) {
      const ids = data.map((e: { id: string }) => e.id);
      const { data: deliveries } = await supabase
        .from("webhook_deliveries")
        .select("endpoint_id, status")
        .in("endpoint_id", ids);

      const statsMap: Record<string, DeliveryStats> = {};
      for (const d of deliveries ?? []) {
        if (!statsMap[d.endpoint_id]) {
          statsMap[d.endpoint_id] = { total: 0, success: 0, failed: 0, dead_lettered: 0 };
        }
        statsMap[d.endpoint_id].total++;
        if (d.status === "success")       statsMap[d.endpoint_id].success++;
        if (d.status === "failed")        statsMap[d.endpoint_id].failed++;
        if (d.status === "dead_lettered") statsMap[d.endpoint_id].dead_lettered++;
      }
      setStats(statsMap);
    }

    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAdd() {
    if (!newUrl.trim()) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const secret = generateSecret();
      const { error } = await supabase.from("webhook_endpoints").insert({
        url: newUrl.trim(),
        description: newDesc.trim() || null,
        events: newEvents,
        secret,
      });
      if (error) throw error;
      toast.success("Webhook endpoint added");
      setAdding(false);
      setNewUrl("");
      setNewDesc("");
      setNewEvents([]);
      await load();
    } catch {
      toast.error("Failed to add endpoint");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(id: string, currentlyActive: boolean) {
    const supabase = createClient();
    const { error } = await supabase
      .from("webhook_endpoints")
      .update({ is_active: !currentlyActive })
      .eq("id", id);
    if (error) toast.error("Failed to update endpoint");
    else await load();
  }

  async function handleRotate(id: string, currentVersion: number) {
    const supabase = createClient();
    const newSecret = generateSecret();
    const { error } = await supabase
      .from("webhook_endpoints")
      .update({ secret: newSecret, secret_version: currentVersion + 1 })
      .eq("id", id);
    if (error) toast.error("Failed to rotate secret");
    else {
      toast.success("Secret rotated — update your endpoint to use the new secret");
      await load();
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this webhook endpoint? Pending deliveries will be abandoned.")) return;
    const supabase = createClient();
    const { error } = await supabase.from("webhook_endpoints").delete().eq("id", id);
    if (error) toast.error("Failed to delete endpoint");
    else {
      toast.success("Endpoint deleted");
      await load();
    }
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Webhook className="h-4 w-4 text-muted-foreground" />
          <div>
            <h3 className="text-sm font-semibold">Outbound Webhooks</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Receive real-time events via signed HMAC-SHA256 HTTP callbacks
            </p>
          </div>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Add endpoint
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Endpoint URL</label>
            <input
              value={newUrl}
              onChange={e => setNewUrl(e.target.value)}
              placeholder="https://your-server.com/webhooks/ats"
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Description (optional)</label>
            <input
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              placeholder="Production webhook for Zapier"
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">
              Events to subscribe (leave empty for all events)
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {EVENT_TYPES.map(ev => (
                <label key={ev} className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newEvents.includes(ev)}
                    onChange={e => {
                      setNewEvents(prev =>
                        e.target.checked ? [...prev, ev] : prev.filter(x => x !== ev)
                      );
                    }}
                    className="rounded border-border"
                  />
                  <code className="text-[11px] text-muted-foreground">{ev}</code>
                </label>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleAdd}
              disabled={saving || !newUrl.trim()}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors"
            >
              {saving ? "Saving…" : "Add Endpoint"}
            </button>
            <button
              onClick={() => setAdding(false)}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Endpoint list */}
      {loading ? (
        <div className="text-xs text-muted-foreground py-4 text-center">Loading…</div>
      ) : endpoints.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-border py-8 text-center">
          <Webhook className="h-6 w-6 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm font-medium text-muted-foreground">No webhook endpoints</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Add an endpoint to receive real-time events.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {endpoints.map(ep => {
            const st = stats[ep.id];
            const isOpen = expanded === ep.id;
            const successRate = st && st.total > 0
              ? Math.round((st.success / st.total) * 100)
              : null;

            return (
              <div key={ep.id} className="rounded-lg border border-border bg-card">
                {/* Summary row */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                  onClick={() => setExpanded(isOpen ? null : ep.id)}
                >
                  <div className={cn(
                    "w-2 h-2 rounded-full flex-shrink-0",
                    ep.is_active ? "bg-emerald-500" : "bg-slate-400"
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{ep.url}</p>
                    {ep.description && (
                      <p className="text-xs text-muted-foreground">{ep.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground flex-shrink-0">
                    {st && st.total > 0 && (
                      <>
                        {successRate !== null && (
                          <span className={cn(
                            "font-medium",
                            successRate === 100 ? "text-emerald-600" :
                            successRate >= 80  ? "text-amber-600" : "text-red-600"
                          )}>
                            {successRate}% ok
                          </span>
                        )}
                        <span>{st.total} deliveries</span>
                      </>
                    )}
                    {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </div>
                </div>

                {/* Expanded detail */}
                {isOpen && (
                  <div className="border-t border-border px-4 py-3 space-y-4">
                    {/* Signing secret */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-foreground">
                          Signing Secret <span className="text-muted-foreground font-normal ml-1">v{ep.secret_version}</span>
                        </label>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setRevealed(revealed === ep.id ? null : ep.id)}
                            className="p-1 rounded hover:bg-muted text-muted-foreground transition-colors"
                            title={revealed === ep.id ? "Hide" : "Reveal"}
                          >
                            {revealed === ep.id
                              ? <EyeOff className="h-3.5 w-3.5" />
                              : <Eye className="h-3.5 w-3.5" />}
                          </button>
                          <button
                            onClick={() => copyToClipboard(ep.secret, "Secret")}
                            className="p-1 rounded hover:bg-muted text-muted-foreground transition-colors"
                            title="Copy"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleRotate(ep.id, ep.secret_version)}
                            className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700 transition-colors"
                          >
                            <RefreshCw className="h-3 w-3" />
                            Rotate
                          </button>
                        </div>
                      </div>
                      <div className="rounded-md bg-muted px-3 py-2 font-mono text-xs text-foreground break-all">
                        {revealed === ep.id ? ep.secret : "whsec_" + "•".repeat(40)}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Verify the <code>X-Webhook-Signature</code> header using HMAC-SHA256.
                        Reject requests older than 5 minutes (check <code>X-Webhook-Timestamp</code>).
                      </p>
                    </div>

                    {/* Events */}
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-foreground">Subscribed Events</label>
                      <p className="text-xs text-muted-foreground">
                        {ep.events.length === 0
                          ? "All events"
                          : ep.events.join(", ")}
                      </p>
                    </div>

                    {/* Delivery stats */}
                    {st && st.total > 0 && (
                      <div className="grid grid-cols-4 gap-2">
                        {[
                          { label: "Total",        value: st.total,         icon: Clock,        color: "text-slate-600" },
                          { label: "Success",      value: st.success,       icon: CheckCircle2, color: "text-emerald-600" },
                          { label: "Failed",       value: st.failed,        icon: XCircle,      color: "text-red-500" },
                          { label: "Dead-lettered",value: st.dead_lettered, icon: XCircle,      color: "text-slate-400" },
                        ].map(s => {
                          const Icon = s.icon;
                          return (
                            <div key={s.label} className="rounded-md border border-border px-3 py-2 text-center">
                              <Icon className={`h-3.5 w-3.5 mx-auto mb-1 ${s.color}`} />
                              <div className="text-sm font-bold text-foreground">{s.value}</div>
                              <div className="text-[10px] text-muted-foreground">{s.label}</div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-1 border-t border-border">
                      <button
                        onClick={() => handleToggle(ep.id, ep.is_active)}
                        className={cn(
                          "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors",
                          ep.is_active
                            ? "border-border text-muted-foreground hover:border-amber-300 hover:text-amber-700"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        )}
                      >
                        <Power className="h-3 w-3" />
                        {ep.is_active ? "Disable" : "Enable"}
                      </button>
                      <button
                        onClick={() => handleDelete(ep.id)}
                        className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:border-red-300 hover:bg-red-50 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="h-3 w-3" />
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Verification guide */}
      <div className="rounded-lg border border-border bg-muted/30 p-4 text-xs text-muted-foreground space-y-1.5">
        <p className="font-semibold text-foreground">Verifying webhook signatures</p>
        <p>Every delivery includes three headers: <code>X-Webhook-Signature</code>, <code>X-Webhook-Timestamp</code>, and <code>X-Webhook-Nonce</code>.</p>
        <p>To verify: compute <code>HMAC-SHA256(secret, "{"{timestamp}.{nonce}.{rawBody}"}")</code> and compare with the signature header. Reject if the timestamp is more than 5 minutes old, or if you have seen this nonce before.</p>
      </div>
    </div>
  );
}
