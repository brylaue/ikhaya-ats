"use client";

/**
 * US-106 — Recruiter Payouts admin page.
 *
 * Flow: admin picks a date window → sees all commission splits whose placement
 * landed in that window → filters by status → selects rows to approve / mark
 * paid / hold / unhold → exports a CSV for finance.
 *
 * "Approval gate" = the exported CSV defaults to `approved+paid` only. The
 * page banners anything pending in the window so nothing falls through.
 *
 * Admin-only endpoints return 403 for non-owners/admins; we also hide the
 * page-level "Approve" / "Mark paid" actions for non-admins just in case
 * someone lands here via a stale link.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft, Download, CheckCircle2, DollarSign, Clock, PauseCircle,
  Loader2, Users, AlertCircle, Filter, FileDown,
} from "lucide-react";
import { cn, formatSalary } from "@/lib/utils";
import { toast } from "sonner";
import { useFeatureFlag } from "@/lib/supabase/hooks";
import { FeatureGate } from "@/components/ui/feature-gate";

// ─── Types ────────────────────────────────────────────────────────────────────

type PayoutStatus = "pending" | "approved" | "paid" | "held";

interface PayoutRow {
  id:             string;
  placementId:    string;
  placedAt:       string | null;
  candidateName:  string;
  candidateId:    string | null;
  companyName:    string;
  companyId:      string | null;
  jobTitle:       string;
  recruiterId:    string | null;
  recruiterName:  string;
  recruiterEmail: string;
  role:           string;
  splitPct:       number;
  splitAmount:    number;
  feeAmount:      number;
  currency:       string;
  payoutStatus:   PayoutStatus;
  paidAt:         string | null;
  notes:          string | null;
}

interface PerRecruiter {
  userId: string;
  name: string;
  email: string;
  currency: string;
  splitsCount: number;
  pending: number;
  approved: number;
  paid: number;
  held: number;
}

interface SummaryPayload {
  window:   { from: string; to: string };
  statuses: PayoutStatus[];
  rows:     PayoutRow[];
  perRecruiter: PerRecruiter[];
  totals: {
    splitsCount: number;
    pending: number; approved: number; paid: number; held: number;
    currencies: string[];
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function firstDayOfPriorMonth(): string {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
}
function lastDayOfPriorMonth(): string {
  const d = new Date(); d.setDate(0);
  return d.toISOString().slice(0, 10);
}

const STATUS_CFG: Record<PayoutStatus, { label: string; dot: string; chip: string }> = {
  pending:  { label: "Pending",  dot: "bg-amber-500",   chip: "bg-amber-50 text-amber-700 border-amber-200" },
  approved: { label: "Approved", dot: "bg-brand-500",   chip: "bg-brand-50 text-brand-700 border-brand-200" },
  paid:     { label: "Paid",     dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  held:     { label: "Held",     dot: "bg-rose-500",    chip: "bg-rose-50 text-rose-700 border-rose-200" },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PayoutsPage() {
  // US-513: Commission tracking is Pro-tier.
  const { enabled: commEnabled, loading: commLoading } = useFeatureFlag("commission_split_tracking");
  const [from, setFrom]           = useState(firstDayOfPriorMonth());
  const [to, setTo]               = useState(lastDayOfPriorMonth());
  const [statusFilter, setStatusFilter] = useState<"all" | PayoutStatus>("all");
  const [data, setData]           = useState<SummaryPayload | null>(null);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [actionBusy, setActionBusy] = useState(false);

  async function load() {
    setLoading(true);
    setSelected(new Set());
    try {
      const res = await fetch(`/api/payouts/summary?from=${from}&to=${to}&status=pending,approved,paid,held`);
      if (res.status === 403) {
        toast.error("Admins only");
        setData(null);
        return;
      }
      if (!res.ok) {
        toast.error("Failed to load payouts");
        setData(null);
        return;
      }
      const body = (await res.json()) as SummaryPayload;
      setData(body);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [from, to]);

  const filteredRows = useMemo(() => {
    if (!data) return [];
    if (statusFilter === "all") return data.rows;
    return data.rows.filter((r) => r.payoutStatus === statusFilter);
  }, [data, statusFilter]);

  const selectedRows = useMemo(() => filteredRows.filter((r) => selected.has(r.id)), [filteredRows, selected]);
  const allOnPageSelected = filteredRows.length > 0 && filteredRows.every((r) => selected.has(r.id));

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) filteredRows.forEach((r) => next.delete(r.id));
      else                   filteredRows.forEach((r) => next.add(r.id));
      return next;
    });
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function bulkAction(action: "approve" | "mark_paid" | "hold" | "unhold") {
    if (selected.size === 0) { toast.error("No rows selected"); return; }
    setActionBusy(true);
    try {
      const res = await fetch(`/api/payouts/bulk-action`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ splitIds: Array.from(selected), action }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? "Bulk action failed");
        return;
      }
      const { affected, skipped } = body as { affected: number; skipped: number };
      toast.success(
        skipped === 0
          ? `${affected} split${affected !== 1 ? "s" : ""} updated`
          : `${affected} updated, ${skipped} skipped (wrong status)`
      );
      await load();
    } finally {
      setActionBusy(false);
    }
  }

  function downloadCsv(grouping: "split" | "recruiter", includePending: boolean) {
    const params = new URLSearchParams({ from, to, grouping });
    if (includePending) params.set("include_pending", "1");
    // Browser will follow the attachment header and save the file.
    window.location.href = `/api/payouts/export?${params.toString()}`;
  }

  // ── Render ──

  // US-513: plan gate — commissions/payouts require Pro.
  if (!commLoading && !commEnabled) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <FeatureGate feature="commission_split_tracking" className="max-w-sm" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <Link href="/settings" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-1">
              <ChevronLeft className="h-3 w-3" />
              Back to settings
            </Link>
            <h1 className="text-xl font-bold text-foreground">Recruiter Payouts</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Commission splits by placement. Approve before exporting for finance.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => downloadCsv("recruiter", false)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors disabled:opacity-50"
              title="Approved + paid, one row per recruiter"
            >
              <FileDown className="h-3.5 w-3.5" />
              Export by recruiter
            </button>
            <button
              onClick={() => downloadCsv("split", false)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
              title="Approved + paid, one row per split"
            >
              <Download className="h-3.5 w-3.5" />
              Export payable CSV
            </button>
          </div>
        </div>

        {/* Date window */}
        <div className="mt-4 flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <span className="text-[11px] text-muted-foreground">
            Based on placement <code className="text-[10px] rounded bg-muted px-1 py-0.5">placed_at</code>
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !data ? (
          <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
            No data.
          </div>
        ) : (
          <div className="p-6 space-y-6 max-w-[1400px] mx-auto">

            {/* KPI strip */}
            <div className="grid grid-cols-4 gap-4">
              <KpiTile icon={Clock}        label="Pending"  value={data.totals.pending}  currency={data.totals.currencies[0]} color="text-amber-600"   bg="bg-amber-50" />
              <KpiTile icon={CheckCircle2} label="Approved" value={data.totals.approved} currency={data.totals.currencies[0]} color="text-brand-600"    bg="bg-brand-50"  />
              <KpiTile icon={DollarSign}   label="Paid"     value={data.totals.paid}     currency={data.totals.currencies[0]} color="text-emerald-600" bg="bg-emerald-50" />
              <KpiTile icon={PauseCircle}  label="On hold"  value={data.totals.held}     currency={data.totals.currencies[0]} color="text-rose-600"    bg="bg-rose-50"  />
            </div>

            {data.totals.currencies.length > 1 && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <AlertCircle className="h-3.5 w-3.5 text-amber-700 shrink-0" />
                <p className="text-xs text-amber-800">
                  Multiple currencies in this window ({data.totals.currencies.join(", ")}). Totals above show just the first —
                  use the per-recruiter CSV to see currency-split totals.
                </p>
              </div>
            )}

            {/* By recruiter */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  <h2 className="text-xs font-semibold text-foreground">Payout by Recruiter</h2>
                </div>
                <span className="text-[11px] text-muted-foreground">{data.perRecruiter.length} recruiters in window</span>
              </div>
              {data.perRecruiter.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-muted-foreground">
                  No commission splits fell inside this window.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  <div className="grid grid-cols-[1fr_90px_110px_110px_100px_80px] items-center gap-4 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <span>Recruiter</span>
                    <span className="text-right">Splits</span>
                    <span className="text-right">Pending</span>
                    <span className="text-right">Approved</span>
                    <span className="text-right">Paid</span>
                    <span className="text-right">Ccy</span>
                  </div>
                  {data.perRecruiter.map((r) => (
                    <div key={`${r.userId}-${r.currency}`} className="grid grid-cols-[1fr_90px_110px_110px_100px_80px] items-center gap-4 px-4 py-2.5 hover:bg-accent/20 transition-colors">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{r.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{r.email}</p>
                      </div>
                      <span className="text-sm text-right text-foreground">{r.splitsCount}</span>
                      <span className="text-sm text-right text-amber-700">{r.pending ? formatSalary(r.pending, r.currency) : "—"}</span>
                      <span className="text-sm text-right text-brand-700">{r.approved ? formatSalary(r.approved, r.currency) : "—"}</span>
                      <span className="text-sm text-right text-emerald-700">{r.paid ? formatSalary(r.paid, r.currency) : "—"}</span>
                      <span className="text-[11px] text-right text-muted-foreground">{r.currency}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Splits table */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                  <h2 className="text-xs font-semibold text-foreground">Splits</h2>
                  <div className="flex items-center gap-1 ml-3">
                    {(["all", "pending", "approved", "paid", "held"] as const).map((s) => {
                      const active = statusFilter === s;
                      const cnt = s === "all"
                        ? data.rows.length
                        : data.rows.filter((r) => r.payoutStatus === s).length;
                      return (
                        <button
                          key={s}
                          onClick={() => setStatusFilter(s)}
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors",
                            active
                              ? "bg-foreground text-background"
                              : "bg-muted text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {s === "all" ? "All" : STATUS_CFG[s].label} · {cnt}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => bulkAction("approve")}
                    disabled={actionBusy || selected.size === 0}
                    className="inline-flex items-center gap-1 rounded-md bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700 hover:bg-brand-100 disabled:opacity-40 transition-colors"
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    Approve ({selected.size})
                  </button>
                  <button
                    onClick={() => bulkAction("mark_paid")}
                    disabled={actionBusy || selected.size === 0}
                    className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 transition-colors"
                  >
                    <DollarSign className="h-3 w-3" />
                    Mark paid
                  </button>
                  <button
                    onClick={() => bulkAction("hold")}
                    disabled={actionBusy || selected.size === 0}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-accent disabled:opacity-40 transition-colors"
                  >
                    <PauseCircle className="h-3 w-3" />
                    Hold
                  </button>
                  <button
                    onClick={() => bulkAction("unhold")}
                    disabled={actionBusy || selected.size === 0}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-accent disabled:opacity-40 transition-colors"
                  >
                    Unhold
                  </button>
                </div>
              </div>

              {filteredRows.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-muted-foreground">
                  No splits match this filter.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left">
                          <input type="checkbox" checked={allOnPageSelected} onChange={toggleAll} className="h-3.5 w-3.5" />
                        </th>
                        <th className="px-3 py-2 text-left">Placed</th>
                        <th className="px-3 py-2 text-left">Candidate · Client</th>
                        <th className="px-3 py-2 text-left">Recruiter</th>
                        <th className="px-3 py-2 text-left">Role</th>
                        <th className="px-3 py-2 text-right">%</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                        <th className="px-3 py-2 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((r) => {
                        const cfg = STATUS_CFG[r.payoutStatus];
                        return (
                          <tr key={r.id} className="border-t border-border hover:bg-accent/20 transition-colors">
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={selected.has(r.id)}
                                onChange={() => toggleOne(r.id)}
                                className="h-3.5 w-3.5"
                              />
                            </td>
                            <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                              {r.placedAt?.slice(0, 10) ?? "—"}
                            </td>
                            <td className="px-3 py-2 min-w-[220px]">
                              <div className="text-xs">
                                <span className="font-medium text-foreground">{r.candidateName || "—"}</span>
                                <span className="text-muted-foreground"> · {r.companyName || "—"}</span>
                              </div>
                              <div className="text-[10px] text-muted-foreground truncate">{r.jobTitle}</div>
                            </td>
                            <td className="px-3 py-2 text-xs text-foreground whitespace-nowrap">
                              {r.recruiterName}
                            </td>
                            <td className="px-3 py-2 text-[11px] text-muted-foreground capitalize whitespace-nowrap">
                              {r.role.replace("_", " ")}
                            </td>
                            <td className="px-3 py-2 text-xs text-right text-muted-foreground whitespace-nowrap">
                              {r.splitPct.toFixed(1)}%
                            </td>
                            <td className="px-3 py-2 text-xs text-right font-semibold text-foreground whitespace-nowrap">
                              {formatSalary(r.splitAmount, r.currency)}
                            </td>
                            <td className="px-3 py-2">
                              <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold", cfg.chip)}>
                                <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
                                {cfg.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="border-t border-border bg-muted/20 px-4 py-2 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{filteredRows.length} split{filteredRows.length !== 1 ? "s" : ""} shown · {selected.size} selected</span>
                <button
                  onClick={() => downloadCsv("split", true)}
                  className="underline underline-offset-2 hover:text-foreground transition-colors"
                  title="Includes pending rows — use only for previewing a full period"
                >
                  Export preview CSV (includes pending)
                </button>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

// ─── KPI tile ─────────────────────────────────────────────────────────────────

function KpiTile({
  icon: Icon, label, value, currency, color, bg,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  currency?: string;
  color: string;
  bg: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg", bg)}>
          <Icon className={cn("h-3.5 w-3.5", color)} />
        </div>
      </div>
      <p className="text-xl font-bold text-foreground">
        {formatSalary(value, currency ?? "USD")}
      </p>
    </div>
  );
}
