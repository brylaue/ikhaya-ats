"use client";

/**
 * US-231 — Placement Anniversaries & Backfill Alerts card.
 *
 * Self-contained dashboard card: fetches open alerts from
 * `/api/alerts/placement-anniversaries`, groups them by kind, and renders
 * a compact two-column surface with per-row dismiss / engage / snooze.
 *
 * Designed to sit above the placements table and on the main dashboard so
 * recruiters see re-engagement opportunities without navigating for them.
 * Returns null when there's nothing to show — no empty state card clutter.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarClock, RefreshCw, MoreHorizontal, X, Check, Clock3,
  Users, Building2, ChevronRight, Loader2, Sparkles,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AlertRow {
  id:                      string;
  placement_id:            string;
  candidate_id:            string;
  company_id:              string | null;
  job_id:                  string | null;
  milestone_months:        number;
  alert_kind:              "candidate_reengage" | "client_backfill";
  anniversary_date:        string;
  status:                  "open" | "dismissed" | "engaged" | "snoozed";
  rationale:               string | null;
  candidate_first_name:    string | null;
  candidate_last_name:     string | null;
  candidate_current_title: string | null;
  company_name:            string | null;
  job_title:               string | null;
}

interface Payload {
  items: AlertRow[];
  byKind: {
    candidate_reengage: AlertRow[];
    client_backfill:    AlertRow[];
  };
  counts: { total: number; candidate_reengage: number; client_backfill: number };
}

// ─── Small UI helpers ─────────────────────────────────────────────────────────

function monthsLabel(m: number): string {
  if (m === 12) return "1yr";
  if (m === 24) return "2yr";
  if (m === 36) return "3yr";
  if (m === 48) return "4yr";
  return `${m}mo`;
}

function fullName(a: AlertRow): string {
  return `${a.candidate_first_name ?? ""} ${a.candidate_last_name ?? ""}`.trim() || "Candidate";
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function AlertItem({
  alert,
  onAction,
  actionInFlight,
}: {
  alert: AlertRow;
  onAction: (id: string, action: "dismiss" | "engage" | "snooze") => Promise<void>;
  actionInFlight: string | null;
}) {
  const busy = actionInFlight === alert.id;
  const isReengage = alert.alert_kind === "candidate_reengage";

  return (
    <div className="group border-b border-border/60 last:border-0 px-4 py-3 hover:bg-accent/20 transition-colors">
      <div className="flex items-start gap-3">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
          isReengage
            ? "bg-violet-100 text-violet-700"
            : "bg-amber-100 text-amber-700"
        }`}>
          {monthsLabel(alert.milestone_months)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/candidates/${alert.candidate_id}`}
              className="text-sm font-semibold text-foreground hover:text-brand-600 transition-colors truncate"
            >
              {fullName(alert)}
            </Link>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground inline-flex items-center gap-1 min-w-0 truncate">
              <Building2 className="h-3 w-3 shrink-0" />
              {alert.company_name ?? "—"}
            </span>
          </div>

          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {alert.rationale}
          </p>

          {/* Action bar */}
          <div className="mt-2 flex items-center gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => onAction(alert.id, "engage")}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-md bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-50 transition-colors"
              title="Mark as engaged — you've started outreach"
            >
              <Check className="h-3 w-3" />
              Engage
            </button>
            <button
              onClick={() => onAction(alert.id, "snooze")}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-accent disabled:opacity-50 transition-colors"
              title="Remind me in 30 days"
            >
              <Clock3 className="h-3 w-3" />
              Snooze
            </button>
            <button
              onClick={() => onAction(alert.id, "dismiss")}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-accent disabled:opacity-50 transition-colors"
              title="Not worth acting on"
            >
              <X className="h-3 w-3" />
              Dismiss
            </button>
            {busy && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground ml-1" />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

export function PlacementAnniversariesCard({ limit = 8 }: { limit?: number }) {
  const [data, setData]           = useState<Payload | null>(null);
  const [loading, setLoading]     = useState(true);
  const [inFlight, setInFlight]   = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"candidate_reengage" | "client_backfill">("candidate_reengage");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/alerts/placement-anniversaries?status=open&limit=${limit * 2}`);
      if (!res.ok) { setData(null); return; }
      const body = (await res.json()) as Payload;
      setData(body);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function handleAction(id: string, action: "dismiss" | "engage" | "snooze") {
    setInFlight(id);
    // Optimistic removal — the API is idempotent so a failure just snaps
    // the row back via reload.
    setData((prev) => prev ? ({
      ...prev,
      items:  prev.items.filter((i) => i.id !== id),
      byKind: {
        candidate_reengage: prev.byKind.candidate_reengage.filter((i) => i.id !== id),
        client_backfill:    prev.byKind.client_backfill.filter((i) => i.id !== id),
      },
      counts: {
        ...prev.counts,
        total:              Math.max(0, prev.counts.total - 1),
        candidate_reengage: prev.byKind.candidate_reengage.some((i) => i.id === id) ? prev.counts.candidate_reengage - 1 : prev.counts.candidate_reengage,
        client_backfill:    prev.byKind.client_backfill.some((i) => i.id === id)    ? prev.counts.client_backfill    - 1 : prev.counts.client_backfill,
      },
    }) : null);
    try {
      await fetch(`/api/alerts/placement-anniversaries/${id}`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action }),
      });
    } finally {
      setInFlight(null);
    }
  }

  // ── Empty states ──
  if (loading && !data) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking for anniversaries…
        </div>
      </div>
    );
  }
  if (!data || data.counts.total === 0) return null; // silent — no clutter

  const rows = data.byKind[activeTab].slice(0, limit);
  const otherTab = activeTab === "candidate_reengage" ? "client_backfill" : "candidate_reengage";

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-gradient-to-r from-violet-50/60 to-transparent">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100">
            <CalendarClock className="h-3.5 w-3.5 text-violet-700" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              Placement Anniversaries
              <Sparkles className="h-3 w-3 text-violet-500" />
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {data.counts.total} re-engagement {data.counts.total === 1 ? "opportunity" : "opportunities"} today
            </p>
          </div>
        </div>
        <button
          onClick={load}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title="Refresh"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab("candidate_reengage")}
          className={`flex-1 px-4 py-2 text-xs font-medium transition-colors ${
            activeTab === "candidate_reengage"
              ? "text-brand-700 border-b-2 border-brand-600 bg-brand-50/30"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Users className="inline h-3 w-3 mr-1" />
          Candidate re-engage
          <span className="ml-1.5 rounded-full bg-background px-1.5 py-0.5 text-[10px] font-semibold">
            {data.counts.candidate_reengage}
          </span>
        </button>
        <button
          onClick={() => setActiveTab("client_backfill")}
          className={`flex-1 px-4 py-2 text-xs font-medium transition-colors ${
            activeTab === "client_backfill"
              ? "text-amber-700 border-b-2 border-amber-500 bg-amber-50/30"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Building2 className="inline h-3 w-3 mr-1" />
          Client backfill
          <span className="ml-1.5 rounded-full bg-background px-1.5 py-0.5 text-[10px] font-semibold">
            {data.counts.client_backfill}
          </span>
        </button>
      </div>

      {/* Body */}
      {rows.length === 0 ? (
        <div className="px-5 py-6 text-center text-xs text-muted-foreground">
          No {activeTab === "candidate_reengage" ? "candidate re-engage" : "client backfill"} alerts right now.
          {data.byKind[otherTab].length > 0 && (
            <button
              onClick={() => setActiveTab(otherTab)}
              className="ml-1 text-brand-600 hover:text-brand-700 font-medium"
            >
              See {data.byKind[otherTab].length} {otherTab === "candidate_reengage" ? "candidate" : "client"} alert{data.byKind[otherTab].length === 1 ? "" : "s"}
            </button>
          )}
        </div>
      ) : (
        <>
          <div>
            {rows.map((a) => (
              <AlertItem
                key={a.id}
                alert={a}
                onAction={handleAction}
                actionInFlight={inFlight}
              />
            ))}
          </div>
          {data.byKind[activeTab].length > limit && (
            <Link
              href="/placements?tab=alerts"
              className="flex items-center justify-center gap-1 px-5 py-2 text-xs font-medium text-brand-600 hover:text-brand-700 hover:bg-brand-50/30 transition-colors border-t border-border"
            >
              View all {data.byKind[activeTab].length}
              <ChevronRight className="h-3 w-3" />
            </Link>
          )}
        </>
      )}
    </div>
  );
}
