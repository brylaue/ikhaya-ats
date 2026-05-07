"use client";

/**
 * /super-admin/support
 * US-467: Support ticket linkage. Reads from support_tickets, populated by
 * the Zendesk/Intercom/Linear webhook handler.
 */
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { LifeBuoy, RefreshCw, ExternalLink, AlertOctagon } from "lucide-react";

interface Ticket {
  id:               string;
  agency_id:        string;
  tenantName:       string;
  external_id:      string | null;
  external_source:  string | null;
  external_url:     string | null;
  subject:          string;
  status:           "open" | "pending" | "solved" | "closed";
  priority:         "low" | "normal" | "high" | "urgent" | null;
  requester_email:  string | null;
  assignee_email:   string | null;
  opened_at:        string;
  last_updated_at:  string;
}

interface Totals {
  open: number; pending: number; solved: number; closed: number; tenantsWithOpen: number;
}

const STATUS: Record<string, string> = {
  open:    "bg-amber-900 text-amber-300",
  pending: "bg-sky-900 text-sky-300",
  solved:  "bg-emerald-900 text-emerald-300",
  closed:  "bg-slate-700 text-slate-400",
};
const PRI: Record<string, string> = {
  urgent: "text-red-400",
  high:   "text-amber-400",
  normal: "text-slate-400",
  low:    "text-slate-500",
};

export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [totals, setTotals]   = useState<Totals | null>(null);
  const [loading, setLoad]    = useState(true);
  const [filter, setFilter]   = useState<"open_pending" | "open" | "pending" | "solved" | "closed">("open_pending");
  const [search, setSearch]   = useState("");

  function load() {
    setLoad(true);
    const q = filter === "open_pending" ? "" : `?status=${filter}`;
    fetch(`/api/super-admin/support${q}`)
      .then(r => r.json())
      .then(d => { setTickets(d.tickets ?? []); setTotals(d.totals ?? null); setLoad(false); })
      .catch(() => setLoad(false));
  }
  useEffect(load, [filter]);

  const filtered = useMemo(() => {
    if (!search) return tickets;
    const q = search.toLowerCase();
    return tickets.filter(t =>
      t.tenantName.toLowerCase().includes(q) ||
      t.subject.toLowerCase().includes(q) ||
      (t.requester_email ?? "").toLowerCase().includes(q));
  }, [tickets, search]);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <LifeBuoy className="h-6 w-6 text-amber-400" /> Support
          </h1>
          <p className="mt-0.5 text-sm text-slate-400">
            All support tickets across tenants. Webhook-fed from Zendesk / Intercom / Linear.
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1.5 rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-40">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {totals && (
        <div className="grid grid-cols-5 gap-3 mb-6">
          <Card label="Open"           value={totals.open}    accent="text-amber-300" warn={totals.open > 0} />
          <Card label="Pending"        value={totals.pending} accent="text-sky-300" />
          <Card label="Solved"         value={totals.solved}  accent="text-emerald-300" />
          <Card label="Closed"         value={totals.closed}  accent="text-slate-400" />
          <Card label="Tenants w/ Open" value={totals.tenantsWithOpen} accent="text-red-300" warn={totals.tenantsWithOpen > 0} />
        </div>
      )}

      <div className="flex items-center gap-3 mb-4">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search tenant, subject, requester…"
          className="flex-1 max-w-sm rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500" />
        <div className="flex gap-1">
          {(["open_pending","open","pending","solved","closed"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md text-xs capitalize transition-colors ${
                filter === f ? "bg-indigo-600 text-white" : "border border-slate-700 text-slate-400 hover:bg-slate-800"
              }`}>{f.replace("_"," + ")}</button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-800/60">
            <tr>
              {["Tenant","Subject","Status","Priority","Source","Opened","Updated"].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">No tickets</td></tr>
            ) : filtered.map(t => (
              <tr key={t.id} className="hover:bg-slate-800/40">
                <td className="px-4 py-2.5">
                  <Link href={`/super-admin/tenants/${t.agency_id}`} className="font-medium text-white hover:text-indigo-300">
                    {t.tenantName}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-slate-300 max-w-md">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate">{t.subject}</span>
                    {t.external_url && (
                      <a href={t.external_url} target="_blank" rel="noreferrer" className="shrink-0 text-indigo-400 hover:text-indigo-300">
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  {t.requester_email && (
                    <div className="text-[11px] text-slate-500 mt-0.5">{t.requester_email}</div>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${STATUS[t.status]}`}>
                    {t.status}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  {t.priority ? (
                    <span className={`text-xs capitalize flex items-center gap-1 ${PRI[t.priority]}`}>
                      {t.priority === "urgent" && <AlertOctagon className="h-3 w-3" />}
                      {t.priority}
                    </span>
                  ) : <span className="text-slate-600 text-xs">—</span>}
                </td>
                <td className="px-4 py-2.5 text-xs text-slate-500 capitalize">{t.external_source ?? "—"}</td>
                <td className="px-4 py-2.5 text-xs text-slate-400">
                  {new Date(t.opened_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-2.5 text-xs text-slate-400">
                  {new Date(t.last_updated_at).toLocaleDateString()}
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
