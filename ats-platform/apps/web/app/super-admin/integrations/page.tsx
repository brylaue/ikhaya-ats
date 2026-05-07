"use client";

/**
 * /super-admin/integrations
 * US-464: Per-tenant integration inventory + health.
 *
 * One row per (tenant, integration). Filter by status to triage broken
 * connectors fast. "Tenants with errors" card is the call-to-action metric
 * for ops triage.
 */
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Plug, RefreshCw, AlertTriangle, CheckCircle2, Search } from "lucide-react";

interface Row {
  agencyId:     string;
  tenantName:   string;
  source:       string;
  key:          string;
  enabled:      boolean;
  status:       string;
  lastSyncAt:   string | null;
  lastError:    string | null;
  errorCount7d: number;
}

interface Totals {
  total: number;
  error: number;
  warning: number;
  ok: number;
  never: number;
  tenantsWithErrors: number;
}

const STATUS_STYLES: Record<string, string> = {
  ok:       "bg-emerald-900 text-emerald-300",
  active:   "bg-emerald-900 text-emerald-300",
  warning:  "bg-amber-900 text-amber-300",
  error:    "bg-red-900 text-red-300",
  expired:  "bg-red-900 text-red-300",
  revoked:  "bg-red-900 text-red-300",
  never:    "bg-slate-700 text-slate-400",
};

export default function IntegrationsPage() {
  const [rows, setRows]     = useState<Row[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoad]  = useState(true);
  const [filter, setFilter] = useState<"all" | "error" | "warning">("all");
  const [search, setSearch] = useState("");

  function load() {
    setLoad(true);
    const q = filter === "all" ? "" : `?status=${filter}`;
    fetch(`/api/super-admin/integrations${q}`)
      .then(r => r.json())
      .then(d => { setRows(d.rows ?? []); setTotals(d.totals ?? null); setLoad(false); })
      .catch(() => setLoad(false));
  }
  useEffect(load, [filter]);

  const filtered = useMemo(() => {
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter(r =>
      r.tenantName.toLowerCase().includes(q) ||
      r.key.toLowerCase().includes(q));
  }, [rows, search]);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Plug className="h-6 w-6 text-sky-400" /> Integration Inventory
          </h1>
          <p className="mt-0.5 text-sm text-slate-400">
            All marketplace connectors and OAuth providers across every tenant.
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1.5 rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-40">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {totals && (
        <div className="grid grid-cols-5 gap-3 mb-6">
          <Card label="Total" value={totals.total} />
          <Card label="OK" value={totals.ok} accent="text-emerald-300" />
          <Card label="Warnings" value={totals.warning} accent="text-amber-300" />
          <Card label="Errors" value={totals.error} accent="text-red-300" warn={totals.error > 0} />
          <Card label="Tenants Affected" value={totals.tenantsWithErrors} accent="text-red-300" warn={totals.tenantsWithErrors > 0} />
        </div>
      )}

      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Filter by tenant or connector…"
            className="w-full rounded-md border border-slate-700 bg-slate-900 pl-9 pr-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500" />
        </div>
        <div className="flex gap-1">
          {(["all","error","warning"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md text-xs capitalize transition-colors ${
                filter === f ? "bg-indigo-600 text-white" : "border border-slate-700 text-slate-400 hover:bg-slate-800"
              }`}>{f}</button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-800/60">
            <tr>
              {["Tenant","Source","Connector","Status","Last Sync","Errors (7d)"].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                {filter === "error" ? <span className="flex items-center justify-center gap-2 text-emerald-400"><CheckCircle2 className="h-4 w-4" /> No broken integrations</span> : "No matches"}
              </td></tr>
            ) : filtered.map((r, i) => (
              <tr key={`${r.agencyId}-${r.source}-${r.key}-${i}`} className="hover:bg-slate-800/40">
                <td className="px-4 py-2.5">
                  <Link href={`/super-admin/tenants/${r.agencyId}`} className="font-medium text-white hover:text-indigo-300">
                    {r.tenantName}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-xs text-slate-500 capitalize">{r.source}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-slate-300">{r.key}</td>
                <td className="px-4 py-2.5">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${STATUS_STYLES[r.status] ?? "bg-slate-700 text-slate-300"}`}>
                    {["error","expired","revoked"].includes(r.status) && <AlertTriangle className="h-2.5 w-2.5" />}
                    {r.status}
                  </span>
                  {!r.enabled && <span className="ml-1.5 text-[10px] text-slate-500">disabled</span>}
                </td>
                <td className="px-4 py-2.5 text-xs text-slate-400">
                  {r.lastSyncAt ? new Date(r.lastSyncAt).toLocaleString() : <span className="text-slate-600">never</span>}
                </td>
                <td className="px-4 py-2.5">
                  {r.errorCount7d > 0 ? (
                    <span className="text-amber-300 tabular-nums">{r.errorCount7d}</span>
                  ) : (
                    <span className="text-slate-600">0</span>
                  )}
                  {r.lastError && (
                    <div className="mt-0.5 text-[10px] text-red-400 max-w-xs truncate" title={r.lastError}>
                      {r.lastError}
                    </div>
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

function Card({ label, value, accent, warn }: { label: string; value: number; accent?: string; warn?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${warn ? "border-red-800 bg-red-950/30" : "border-slate-800 bg-slate-900"}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">{label}</div>
      <div className={`text-2xl font-bold tabular-nums ${accent ?? "text-white"}`}>{value.toLocaleString()}</div>
    </div>
  );
}
