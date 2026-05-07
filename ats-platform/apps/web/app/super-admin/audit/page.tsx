"use client";

/**
 * /super-admin/audit
 * US-461: Cross-org audit log — filterable, paginated view of all audit events.
 *
 * Fetches from /api/super-admin/audit with optional agencyId / action filters.
 */

import { useState, useEffect, useCallback } from "react";
import { Search, ChevronLeft, ChevronRight, Activity, RefreshCw } from "lucide-react";

interface AuditEvent {
  id:            string;
  agency_id:     string;
  user_id:       string | null;
  action:        string;
  resource_type: string | null;
  resource_id:   string | null;
  detail:        Record<string, unknown> | null;
  performed_at:  string;
  agencies:      { name: string } | null;
}

interface Tenant { id: string; name: string; }

const PAGE_SIZE = 50;

// Colour-code action prefixes
function actionColor(action: string): string {
  if (action.startsWith("super_admin"))    return "text-amber-400";
  if (action.includes("delete"))           return "text-red-400";
  if (action.includes("create") || action.includes("insert")) return "text-emerald-400";
  if (action.includes("update") || action.includes("edit"))   return "text-sky-400";
  return "text-indigo-300";
}

export default function AuditLogPage() {
  const [events, setEvents]       = useState<AuditEvent[]>([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(0);
  const [loading, setLoading]     = useState(false);
  const [tenants, setTenants]     = useState<Tenant[]>([]);
  const [agencyFilter, setAgency]  = useState("");
  const [actionFilter, setAction]  = useState("");
  const [expanded, setExpanded]   = useState<string | null>(null);

  const pages = Math.ceil(total / PAGE_SIZE);

  // Load tenant list for filter dropdown
  useEffect(() => {
    fetch("/api/super-admin/tenants")
      .then(r => r.json())
      .then(d => setTenants(d.tenants ?? []));
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      page:  String(page),
      limit: String(PAGE_SIZE),
    });
    if (agencyFilter) params.set("agencyId", agencyFilter);
    if (actionFilter) params.set("action",   actionFilter);

    fetch(`/api/super-admin/audit?${params}`)
      .then(r => r.json())
      .then(d => {
        setEvents(d.events ?? []);
        setTotal(d.total  ?? 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [page, agencyFilter, actionFilter]);

  useEffect(() => { load(); }, [load]);

  function handleFilterChange(setter: (v: string) => void) {
    return (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
      setter(e.target.value);
      setPage(0);
    };
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Audit Log</h1>
          <p className="mt-0.5 text-sm text-slate-400">
            {total.toLocaleString()} events across all tenants
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-40 transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <select
          value={agencyFilter}
          onChange={handleFilterChange(setAgency)}
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500"
        >
          <option value="">All tenants</option>
          {tenants.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
          <input
            value={actionFilter}
            onChange={handleFilterChange(setAction)}
            placeholder="Filter by action…"
            className="rounded-md border border-slate-700 bg-slate-900 pl-9 pr-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-800/60">
            <tr>
              {["Time", "Tenant", "Action", "Resource", "Detail"].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">Loading…</td></tr>
            ) : events.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">No events found</td></tr>
            ) : events.map(ev => (
              <>
                <tr
                  key={ev.id}
                  className="hover:bg-slate-800/30 cursor-pointer"
                  onClick={() => setExpanded(expanded === ev.id ? null : ev.id)}
                >
                  <td className="px-4 py-2.5 text-[11px] text-slate-500 whitespace-nowrap">
                    {new Date(ev.performed_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-300">
                    {ev.agencies?.name ?? ev.agency_id.slice(0, 8) + "…"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`font-mono text-xs ${actionColor(ev.action)}`}>{ev.action}</span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-400">
                    {ev.resource_type && (
                      <span>{ev.resource_type}</span>
                    )}
                    {ev.resource_id && (
                      <span className="text-slate-600 ml-1 font-mono text-[10px]">
                        {ev.resource_id.slice(0, 8)}…
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <Activity className={`h-3.5 w-3.5 transition-transform ${expanded === ev.id ? "text-indigo-400 rotate-90" : "text-slate-600"}`} />
                  </td>
                </tr>
                {expanded === ev.id && ev.detail && (
                  <tr key={`${ev.id}-detail`} className="bg-slate-950">
                    <td colSpan={5} className="px-6 py-3">
                      <pre className="text-[11px] text-slate-400 font-mono whitespace-pre-wrap break-all">
                        {JSON.stringify(ev.detail, null, 2)}
                      </pre>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-slate-500">
            Page {page + 1} of {pages} · {total.toLocaleString()} total
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
