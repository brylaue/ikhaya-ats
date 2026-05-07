"use client";

/**
 * /super-admin/cost
 * US-463: Per-tenant cost attribution.
 *
 * Lists every tenant alongside their seat revenue, AI burn, and storage
 * spend over a configurable window (default 30 days). Surfaces "underwater"
 * tenants whose AI+storage cost is eating their seat margin.
 */
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { DollarSign, RefreshCw, TrendingDown, Download } from "lucide-react";

interface CostRow {
  agencyId:       string;
  name:           string;
  plan:           string;
  seats:          number;
  seatRevenueUsd: number;
  aiCostUsd:      number;
  storageGb:      number;
  storageCostUsd: number;
  totalCostUsd:   number;
  marginPct:      number | null;
}

const fmt = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function CostPage() {
  const [rows, setRows]     = useState<CostRow[]>([]);
  const [loading, setLoad]  = useState(true);
  const [days, setDays]     = useState(30);
  const [sortKey, setKey]   = useState<keyof CostRow>("totalCostUsd");
  const [sortDir, setDir]   = useState<"asc" | "desc">("desc");

  function load() {
    setLoad(true);
    fetch(`/api/super-admin/cost?days=${days}`)
      .then(r => r.json())
      .then(d => { setRows(d.rows ?? []); setLoad(false); })
      .catch(() => setLoad(false));
  }
  useEffect(load, [days]);

  const sorted = useMemo(() => [...rows].sort((a, b) => {
    const av = a[sortKey] ?? 0;
    const bv = b[sortKey] ?? 0;
    const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
    return sortDir === "asc" ? cmp : -cmp;
  }), [rows, sortKey, sortDir]);

  const totals = useMemo(() => rows.reduce((acc, r) => ({
    revenue: acc.revenue + r.seatRevenueUsd,
    ai:      acc.ai      + r.aiCostUsd,
    storage: acc.storage + r.storageCostUsd,
  }), { revenue: 0, ai: 0, storage: 0 }), [rows]);

  function toggleSort(k: keyof CostRow) {
    if (sortKey === k) setDir(d => d === "asc" ? "desc" : "asc");
    else { setKey(k); setDir("desc"); }
  }

  function exportCsv() {
    const header = ["Tenant","Plan","Seats","SeatRev","AICost","StorageGB","StorageCost","TotalCost","Margin%"];
    const csv = [header, ...sorted.map(r => [
      r.name, r.plan, r.seats, r.seatRevenueUsd, r.aiCostUsd, r.storageGb,
      r.storageCostUsd, r.totalCostUsd, r.marginPct ?? "",
    ])].map(r => r.join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `tenant-cost-${days}d.csv`;
    a.click();
  }

  const underwater = rows.filter(r => r.marginPct !== null && r.marginPct < 0).length;

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <DollarSign className="h-6 w-6 text-emerald-400" /> Cost Attribution
          </h1>
          <p className="mt-0.5 text-sm text-slate-400">
            Per-tenant AI / storage / seat economics over last {days} days.
            Internal estimate — Stripe is authoritative for billing.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={days} onChange={e => setDays(parseInt(e.target.value, 10))}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-white">
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-40">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
          <button onClick={exportCsv}
            className="flex items-center gap-1.5 rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
        </div>
      </div>

      {/* Aggregate cards */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <SummaryCard label="Seat Revenue (mo)" value={fmt(totals.revenue)} hint={`${rows.length} tenants`} />
        <SummaryCard label="AI Spend"     value={fmt(totals.ai)}     hint={`${days}-day window`} />
        <SummaryCard label="Storage"      value={fmt(totals.storage)} hint={`${days}-day est.`} />
        <SummaryCard
          label="Underwater Tenants"
          value={String(underwater)}
          hint={underwater > 0 ? "AI+storage > seat rev" : "All margins positive"}
          warn={underwater > 0}
          icon={TrendingDown}
        />
      </div>

      <div className="rounded-xl border border-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-800/60">
            <tr>
              {[
                ["name","Tenant"],["plan","Plan"],["seats","Seats"],
                ["seatRevenueUsd","Seat Rev"],["aiCostUsd","AI"],["storageCostUsd","Storage"],
                ["totalCostUsd","Total Cost"],["marginPct","Margin %"],
              ].map(([k,l]) => (
                <th key={k} onClick={() => toggleSort(k as keyof CostRow)}
                  className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400 cursor-pointer hover:text-white select-none">
                  {l}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-500">Loading…</td></tr>
            ) : sorted.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-500">No tenants</td></tr>
            ) : sorted.map(r => (
              <tr key={r.agencyId} className="hover:bg-slate-800/40">
                <td className="px-4 py-2.5">
                  <Link href={`/super-admin/tenants/${r.agencyId}`} className="font-medium text-white hover:text-indigo-300">
                    {r.name}
                  </Link>
                </td>
                <td className="px-4 py-2.5 capitalize text-slate-300 text-xs">{r.plan}</td>
                <td className="px-4 py-2.5 tabular-nums text-slate-300">{r.seats}</td>
                <td className="px-4 py-2.5 tabular-nums text-emerald-300">{fmt(r.seatRevenueUsd)}</td>
                <td className="px-4 py-2.5 tabular-nums text-amber-300">{fmt(r.aiCostUsd)}</td>
                <td className="px-4 py-2.5 tabular-nums text-slate-300">
                  {fmt(r.storageCostUsd)} <span className="text-[10px] text-slate-500">({r.storageGb}GB)</span>
                </td>
                <td className="px-4 py-2.5 tabular-nums text-white font-medium">{fmt(r.totalCostUsd)}</td>
                <td className="px-4 py-2.5 tabular-nums">
                  {r.marginPct === null ? (
                    <span className="text-slate-500">—</span>
                  ) : (
                    <span className={r.marginPct < 0 ? "text-red-400 font-medium" : r.marginPct < 30 ? "text-amber-400" : "text-emerald-400"}>
                      {r.marginPct}%
                    </span>
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

function SummaryCard({ label, value, hint, warn, icon: Icon }:
  { label: string; value: string; hint: string; warn?: boolean; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className={`rounded-xl border p-4 ${warn ? "border-red-800 bg-red-950/30" : "border-slate-800 bg-slate-900"}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
        {Icon && <Icon className="h-3 w-3" />} {label}
      </div>
      <div className={`text-2xl font-bold tabular-nums ${warn ? "text-red-300" : "text-white"}`}>{value}</div>
      <div className="text-[11px] text-slate-500 mt-0.5">{hint}</div>
    </div>
  );
}
