"use client";

/**
 * /super-admin/billing
 * US-466: Per-tenant billing & subscription state.
 *
 * Big aggregate cards (MRR, subscription health), per-tenant table with
 * Stripe customer link, recent webhook events drawer.
 */
import { Fragment, useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { CreditCard, RefreshCw, ExternalLink, AlertTriangle } from "lucide-react";

interface Row {
  agencyId:           string;
  name:               string;
  plan:               string;
  seats:              number;
  mrrUsd:             number;
  subscriptionStatus: string | null;
  stripeCustomerId:   string | null;
  hasSubscription:    boolean;
  trialEndsAt:        string | null;
  periodEndsAt:       string | null;
  cancelAtPeriodEnd:  boolean;
  planExpiresAt:      string | null;
  recentEvents:       { event_type: string; processed_at: string }[];
}

const fmt = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_STYLES: Record<string, string> = {
  active:     "bg-emerald-900 text-emerald-300",
  trialing:   "bg-sky-900 text-sky-300",
  past_due:   "bg-amber-900 text-amber-300",
  unpaid:     "bg-red-900 text-red-300",
  canceled:   "bg-slate-700 text-slate-400",
  incomplete: "bg-amber-900 text-amber-300",
  paused:     "bg-slate-700 text-slate-400",
  unknown:    "bg-slate-700 text-slate-400",
};

export default function BillingPage() {
  const [rows, setRows]         = useState<Row[]>([]);
  const [totalMrr, setMrr]      = useState(0);
  const [counts, setCounts]     = useState<Record<string, number>>({});
  const [loading, setLoad]      = useState(true);
  const [filter, setFilter]     = useState<string>("all");
  const [openDrawer, setDrawer] = useState<string | null>(null);

  function load() {
    setLoad(true);
    fetch("/api/super-admin/billing")
      .then(r => r.json())
      .then(d => { setRows(d.rows ?? []); setMrr(d.totalMrr ?? 0); setCounts(d.statusCounts ?? {}); setLoad(false); })
      .catch(() => setLoad(false));
  }
  useEffect(load, []);

  const filtered = useMemo(() => filter === "all" ? rows : rows.filter(r => (r.subscriptionStatus ?? "unknown") === filter), [rows, filter]);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <CreditCard className="h-6 w-6 text-violet-400" /> Billing
          </h1>
          <p className="mt-0.5 text-sm text-slate-400">
            Subscription state per tenant. Click a row to see recent Stripe webhooks.
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1.5 rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-40">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <Card label="Total MRR (est.)" value={fmt(totalMrr)} accent="text-emerald-300" />
        <Card label="Active"   value={String(counts.active   ?? 0)} accent="text-emerald-300" />
        <Card label="Trialing" value={String(counts.trialing ?? 0)} accent="text-sky-300" />
        <Card label="Past Due / Unpaid" value={String((counts.past_due ?? 0) + (counts.unpaid ?? 0))} warn={(counts.past_due ?? 0) + (counts.unpaid ?? 0) > 0} accent="text-red-300" />
      </div>

      {/* Filter */}
      <div className="flex gap-1 mb-4 flex-wrap">
        {["all","active","trialing","past_due","unpaid","canceled","incomplete","paused"].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-md text-xs capitalize transition-colors ${
              filter === f ? "bg-indigo-600 text-white" : "border border-slate-700 text-slate-400 hover:bg-slate-800"
            }`}>{f.replace("_"," ")}</button>
        ))}
      </div>

      <div className="rounded-xl border border-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-800/60">
            <tr>
              {["Tenant","Plan","Seats","MRR","Status","Trial Ends","Period Ends","Stripe"].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-500">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-500">No tenants</td></tr>
            ) : filtered.map(r => (
              <Fragment key={r.agencyId}>
                <tr onClick={() => setDrawer(d => d === r.agencyId ? null : r.agencyId)}
                  className="hover:bg-slate-800/40 cursor-pointer">
                  <td className="px-4 py-2.5">
                    <Link href={`/super-admin/tenants/${r.agencyId}`} onClick={e => e.stopPropagation()}
                      className="font-medium text-white hover:text-indigo-300">{r.name}</Link>
                  </td>
                  <td className="px-4 py-2.5 capitalize text-xs text-slate-400">{r.plan}</td>
                  <td className="px-4 py-2.5 tabular-nums text-slate-300">{r.seats}</td>
                  <td className="px-4 py-2.5 tabular-nums text-emerald-300">{fmt(r.mrrUsd)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${STATUS_STYLES[r.subscriptionStatus ?? "unknown"]}`}>
                      {(r.subscriptionStatus === "past_due" || r.subscriptionStatus === "unpaid") && <AlertTriangle className="h-2.5 w-2.5" />}
                      {(r.subscriptionStatus ?? "unknown").replace("_"," ")}
                    </span>
                    {r.cancelAtPeriodEnd && (
                      <span className="ml-1.5 text-[10px] text-amber-400">cancel scheduled</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-400">
                    {r.trialEndsAt ? new Date(r.trialEndsAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-400">
                    {r.periodEndsAt ? new Date(r.periodEndsAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    {r.stripeCustomerId ? (
                      <a href={`https://dashboard.stripe.com/customers/${r.stripeCustomerId}`}
                        onClick={e => e.stopPropagation()}
                        target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300">
                        Open <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="text-[11px] text-slate-600">no customer</span>
                    )}
                  </td>
                </tr>
                {openDrawer === r.agencyId && (
                  <tr><td colSpan={8} className="bg-slate-950 px-6 py-4">
                    <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 mb-2">Recent webhook events</div>
                    {r.recentEvents.length === 0 ? (
                      <p className="text-xs text-slate-500">No events recorded for this tenant.</p>
                    ) : (
                      <ul className="space-y-1">
                        {r.recentEvents.map((e, i) => (
                          <li key={i} className="flex items-center gap-3 text-xs">
                            <span className="font-mono text-indigo-300">{e.event_type}</span>
                            <span className="text-slate-500">{new Date(e.processed_at).toLocaleString()}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Card({ label, value, accent, warn }: { label: string; value: string; accent?: string; warn?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${warn ? "border-red-800 bg-red-950/30" : "border-slate-800 bg-slate-900"}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">{label}</div>
      <div className={`text-2xl font-bold tabular-nums ${accent ?? "text-white"}`}>{value}</div>
    </div>
  );
}
