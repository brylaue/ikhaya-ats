"use client";

/**
 * /super-admin/tenants
 * US-456: Searchable, sortable tenant list with usage stats.
 *
 * Client component so search/sort/filter work without full-page reloads.
 * Data fetched via the super-admin API route to keep service-role key server-side.
 */

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Search,
  ChevronUp,
  ChevronDown,
  Building2,
  Download,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TenantRow {
  id: string;
  name: string;
  domain: string | null;
  plan: string;
  userCount: number;
  jobCount: number;
  candidateCount: number;
  lastActivityAt: string | null;
  createdAt: string;
}

type SortKey = keyof TenantRow;
type SortDir = "asc" | "desc";

const PAGE_SIZE = 25;

const PLAN_COLORS: Record<string, string> = {
  starter:    "bg-slate-700 text-slate-200",
  growth:     "bg-blue-900  text-blue-200",
  pro:        "bg-violet-900 text-violet-200",
  enterprise: "bg-amber-900 text-amber-200",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function TenantsPage() {
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search,  setSearch]    = useState("");
  const [plan,    setPlan]      = useState("all");
  const [sortKey, setSortKey]   = useState<SortKey>("createdAt");
  const [sortDir, setSortDir]   = useState<SortDir>("desc");
  const [page,    setPage]      = useState(0);

  useEffect(() => {
    fetch("/api/super-admin/tenants")
      .then(r => r.json())
      .then(data => { setTenants(data.tenants ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let rows = tenants;
    if (plan !== "all") rows = rows.filter(t => t.plan === plan);
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(t =>
        t.name.toLowerCase().includes(q) ||
        (t.domain ?? "").toLowerCase().includes(q)
      );
    }
    rows = [...rows].sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      const cmp = typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [tenants, search, plan, sortKey, sortDir]);

  const pages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
    setPage(0);
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronUp className="h-3 w-3 text-slate-600" />;
    return sortDir === "asc"
      ? <ChevronUp className="h-3 w-3 text-indigo-400" />
      : <ChevronDown className="h-3 w-3 text-indigo-400" />;
  }

  function exportCsv() {
    const header = ["ID","Name","Domain","Plan","Users","Jobs","Candidates","Last Activity","Created"];
    const rows   = filtered.map(t => [
      t.id, t.name, t.domain ?? "", t.plan,
      t.userCount, t.jobCount, t.candidateCount,
      t.lastActivityAt ? new Date(t.lastActivityAt).toLocaleDateString() : "",
      new Date(t.createdAt).toLocaleDateString(),
    ]);
    const csv = [header, ...rows].map(r => r.join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "tenants.csv";
    a.click();
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Tenants</h1>
          <p className="mt-0.5 text-sm text-slate-400">
            {loading ? "Loading…" : `${filtered.length} of ${tenants.length} orgs`}
          </p>
        </div>
        <button
          onClick={exportCsv}
          className="flex items-center gap-1.5 rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search by name or domain…"
            className="w-full rounded-md border border-slate-700 bg-slate-900 pl-9 pr-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
        <select
          value={plan}
          onChange={e => { setPlan(e.target.value); setPage(0); }}
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
        >
          <option value="all">All plans</option>
          <option value="starter">Starter</option>
          <option value="growth">Growth</option>
          <option value="pro">Pro</option>
          <option value="enterprise">Enterprise</option>
        </select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-800/60">
            <tr>
              {([
                { key: "name",           label: "Organisation" },
                { key: "plan",           label: "Plan" },
                { key: "userCount",      label: "Seats" },
                { key: "jobCount",       label: "Jobs" },
                { key: "candidateCount", label: "Candidates" },
                { key: "lastActivityAt", label: "Last Activity" },
                { key: "createdAt",      label: "Created" },
              ] as { key: SortKey; label: string }[]).map(col => (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col.key)}
                  className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400 cursor-pointer hover:text-white select-none"
                >
                  <span className="flex items-center gap-1">
                    {col.label}
                    <SortIcon col={col.key} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-500">Loading tenants…</td>
              </tr>
            ) : pageRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-500">No tenants found</td>
              </tr>
            ) : pageRows.map(t => (
              <tr
                key={t.id}
                className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                onClick={() => window.location.href = `/super-admin/tenants/${t.id}`}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <Building2 className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                    <div>
                      <p className="font-medium text-white">{t.name}</p>
                      {t.domain && <p className="text-[11px] text-slate-500">{t.domain}</p>}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${PLAN_COLORS[t.plan] ?? "bg-slate-700 text-slate-200"}`}>
                    {t.plan}
                  </span>
                </td>
                <td className="px-4 py-3 tabular-nums text-slate-300">{t.userCount}</td>
                <td className="px-4 py-3 tabular-nums text-slate-300">{t.jobCount}</td>
                <td className="px-4 py-3 tabular-nums text-slate-300">{t.candidateCount.toLocaleString()}</td>
                <td className="px-4 py-3 text-xs text-slate-400">
                  {t.lastActivityAt ? new Date(t.lastActivityAt).toLocaleDateString() : "—"}
                </td>
                <td className="px-4 py-3 text-xs text-slate-400">
                  {new Date(t.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-slate-500">
            Page {page + 1} of {pages} · {filtered.length} results
          </p>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1.5 rounded border border-slate-700 text-slate-400 hover:bg-slate-800 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setPage(p => Math.min(pages - 1, p + 1))}
              disabled={page >= pages - 1}
              className="p-1.5 rounded border border-slate-700 text-slate-400 hover:bg-slate-800 disabled:opacity-30 transition-colors"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
