"use client";

/**
 * /super-admin/usage
 * US-459: Cross-tenant usage metrics & quota utilisation.
 *
 * Shows per-org seat usage, active job slots, candidate volume,
 * and 30-day MAU with colour-coded quota indicators.
 */

import { useState, useEffect, useMemo } from "react";
import { Users, Briefcase, UserCheck, Activity, AlertTriangle } from "lucide-react";

interface UsageRow {
  id:          string;
  name:        string;
  plan:        string;
  seats:       number;
  seatLimit:   number;
  seatPct:     number | null;
  activeJobs:  number;
  jobLimit:    number;
  jobPct:      number | null;
  candidates:  number;
  mau30:       number;
  mau60:       number;
  createdAt:   string;
}

const PLAN_COLORS: Record<string, string> = {
  starter:    "bg-slate-700 text-slate-200",
  growth:     "bg-blue-900  text-blue-200",
  pro:        "bg-violet-900 text-violet-200",
  enterprise: "bg-amber-900 text-amber-200",
};

function QuotaBar({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs text-slate-500">unlimited</span>;
  const color = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-slate-700 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className={`text-[11px] tabular-nums ${pct >= 90 ? "text-red-400 font-semibold" : "text-slate-400"}`}>
        {pct}%
      </span>
      {pct >= 90 && <AlertTriangle className="h-3 w-3 text-red-400 shrink-0" />}
    </div>
  );
}

export default function UsagePage() {
  const [rows, setRows]       = useState<UsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [planFilter, setPlan]  = useState("all");

  useEffect(() => {
    fetch("/api/super-admin/usage")
      .then(r => r.json())
      .then(d => { setRows(d.rows ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (planFilter === "all") return rows;
    return rows.filter(r => r.plan === planFilter);
  }, [rows, planFilter]);

  // Summary stats
  const totalSeats     = rows.reduce((s, r) => s + r.seats,      0);
  const totalJobs      = rows.reduce((s, r) => s + r.activeJobs, 0);
  const totalCandidates = rows.reduce((s, r) => s + r.candidates, 0);
  const totalMau       = rows.reduce((s, r) => s + r.mau30,      0);
  const atRiskCount    = rows.filter(r => (r.seatPct ?? 0) >= 90 || (r.jobPct ?? 0) >= 90).length;

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Usage & Quotas</h1>
        <p className="mt-0.5 text-sm text-slate-400">Seat and job slot utilisation across all tenants</p>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {[
          { label: "Total Seats",     value: totalSeats,      icon: Users,      color: "text-indigo-400" },
          { label: "Active Jobs",     value: totalJobs,       icon: Briefcase,  color: "text-sky-400"    },
          { label: "Candidates",      value: totalCandidates, icon: UserCheck,  color: "text-emerald-400"},
          { label: "MAU (30-day)",    value: totalMau,        icon: Activity,   color: "text-violet-400" },
          { label: "Near Quota",      value: atRiskCount,     icon: AlertTriangle, color: atRiskCount > 0 ? "text-red-400" : "text-slate-500" },
        ].map(card => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <Icon className={`h-4 w-4 ${card.color} mb-2`} />
              <div className="text-2xl font-bold text-white tabular-nums">{loading ? "…" : card.value.toLocaleString()}</div>
              <div className="text-xs text-slate-400 mt-0.5">{card.label}</div>
            </div>
          );
        })}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3 mb-4">
        <select
          value={planFilter}
          onChange={e => setPlan(e.target.value)}
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
        >
          <option value="all">All plans</option>
          <option value="starter">Starter</option>
          <option value="growth">Growth</option>
          <option value="pro">Pro</option>
          <option value="enterprise">Enterprise</option>
        </select>
        <span className="text-xs text-slate-500">{filtered.length} org{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-800/60">
            <tr>
              {["Organisation", "Plan", "Seats", "Active Jobs", "Candidates", "MAU (30d)", "MAU Trend"].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500 text-sm">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500 text-sm">No data</td></tr>
            ) : filtered.map(row => {
              const mauDelta = row.mau30 - row.mau60;
              return (
                <tr key={row.id} className="hover:bg-slate-800/30 cursor-pointer" onClick={() => window.location.href = `/super-admin/tenants/${row.id}`}>
                  <td className="px-4 py-3 font-medium text-white">{row.name}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${PLAN_COLORS[row.plan] ?? "bg-slate-700 text-slate-200"}`}>
                      {row.plan}
                    </span>
                  </td>
                  <td className="px-4 py-3 min-w-[140px]">
                    <div className="text-xs text-slate-400 mb-1">{row.seats} / {row.seatLimit < 999 ? row.seatLimit : "∞"}</div>
                    <QuotaBar pct={row.seatPct} />
                  </td>
                  <td className="px-4 py-3 min-w-[140px]">
                    <div className="text-xs text-slate-400 mb-1">{row.activeJobs} / {row.jobLimit < 999 ? row.jobLimit : "∞"}</div>
                    <QuotaBar pct={row.jobPct} />
                  </td>
                  <td className="px-4 py-3 tabular-nums text-slate-300">{row.candidates.toLocaleString()}</td>
                  <td className="px-4 py-3 tabular-nums text-slate-300">{row.mau30}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs tabular-nums font-medium ${mauDelta > 0 ? "text-emerald-400" : mauDelta < 0 ? "text-red-400" : "text-slate-500"}`}>
                      {mauDelta > 0 ? `+${mauDelta}` : mauDelta === 0 ? "—" : mauDelta}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
