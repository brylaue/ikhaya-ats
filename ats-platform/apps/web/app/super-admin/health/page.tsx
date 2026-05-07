"use client";

/**
 * /super-admin/health
 * US-465: Tenant health score dashboard.
 *
 * Sortable table of every tenant + their composite health score and
 * sub-scores. Filter by risk band. "Recompute all" runs the scoring lib
 * across every tenant and writes new snapshots — usually run nightly via
 * cron, but exposed here for ad-hoc refresh.
 */
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { HeartPulse, RefreshCw, AlertOctagon } from "lucide-react";
import { toast } from "sonner";

interface Row {
  agencyId:    string;
  name:        string;
  plan:        string;
  computedAt:  string | null;
  activity:    number | null;
  adoption:    number | null;
  reliability: number | null;
  payment:     number | null;
  overall:     number | null;
  band:        "healthy" | "watch" | "at_risk" | "critical" | "unknown";
}

interface Distribution {
  healthy: number; watch: number; at_risk: number; critical: number; unknown: number;
}

const BAND_STYLES: Record<Row["band"], string> = {
  healthy:  "bg-emerald-900 text-emerald-300",
  watch:    "bg-sky-900 text-sky-300",
  at_risk:  "bg-amber-900 text-amber-300",
  critical: "bg-red-900 text-red-300",
  unknown:  "bg-slate-700 text-slate-400",
};

export default function HealthPage() {
  const [rows, setRows]     = useState<Row[]>([]);
  const [dist, setDist]     = useState<Distribution | null>(null);
  const [loading, setLoad]  = useState(true);
  const [recomp, setRecomp] = useState(false);
  const [band, setBand]     = useState<"all" | Row["band"]>("all");

  function load() {
    setLoad(true);
    fetch("/api/super-admin/health")
      .then(r => r.json())
      .then(d => { setRows(d.rows ?? []); setDist(d.distribution ?? null); setLoad(false); })
      .catch(() => setLoad(false));
  }
  useEffect(load, []);

  async function recomputeAll() {
    setRecomp(true);
    try {
      const res = await fetch("/api/super-admin/health/recompute", { method: "POST", body: "{}" });
      const d = await res.json();
      if (d.ok) toast.success(`Recomputed ${d.recomputed} tenants`);
      else toast.error(d.error ?? "Failed");
      load();
    } finally { setRecomp(false); }
  }

  const filtered = useMemo(() =>
    band === "all" ? rows : rows.filter(r => r.band === band),
    [rows, band]);

  const sorted = useMemo(() =>
    [...filtered].sort((a, b) => (a.overall ?? -1) - (b.overall ?? -1)),
    [filtered]);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <HeartPulse className="h-6 w-6 text-rose-400" /> Tenant Health
          </h1>
          <p className="mt-0.5 text-sm text-slate-400">
            Composite score across activity, adoption, reliability, payment.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={recomputeAll} disabled={recomp}
            className="flex items-center gap-1.5 rounded-md border border-indigo-700 bg-indigo-950/50 px-3 py-1.5 text-xs text-indigo-300 hover:bg-indigo-900/50 disabled:opacity-40">
            <RefreshCw className={`h-3.5 w-3.5 ${recomp ? "animate-spin" : ""}`} />
            {recomp ? "Recomputing…" : "Recompute All"}
          </button>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-40">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Reload
          </button>
        </div>
      </div>

      {dist && (
        <div className="grid grid-cols-5 gap-3 mb-6">
          <BandCard label="Healthy"  value={dist.healthy}  band="healthy" />
          <BandCard label="Watch"    value={dist.watch}    band="watch" />
          <BandCard label="At Risk"  value={dist.at_risk}  band="at_risk" />
          <BandCard label="Critical" value={dist.critical} band="critical" />
          <BandCard label="No Score" value={dist.unknown}  band="unknown" />
        </div>
      )}

      <div className="flex gap-1 mb-4">
        {(["all","critical","at_risk","watch","healthy","unknown"] as const).map(b => (
          <button key={b} onClick={() => setBand(b)}
            className={`px-3 py-1.5 rounded-md text-xs capitalize transition-colors ${
              band === b ? "bg-indigo-600 text-white" : "border border-slate-700 text-slate-400 hover:bg-slate-800"
            }`}>{b.replace("_", " ")}</button>
        ))}
      </div>

      <div className="rounded-xl border border-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-800/60">
            <tr>
              {["Tenant","Plan","Activity","Adoption","Reliability","Payment","Overall","Band","Updated"].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {loading ? (
              <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-500">Loading…</td></tr>
            ) : sorted.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-500">No tenants in this band</td></tr>
            ) : sorted.map(r => (
              <tr key={r.agencyId} className="hover:bg-slate-800/40">
                <td className="px-4 py-2.5">
                  <Link href={`/super-admin/tenants/${r.agencyId}`} className="font-medium text-white hover:text-indigo-300">
                    {r.name}
                  </Link>
                </td>
                <td className="px-4 py-2.5 capitalize text-xs text-slate-400">{r.plan}</td>
                <ScoreCell value={r.activity} />
                <ScoreCell value={r.adoption} />
                <ScoreCell value={r.reliability} />
                <ScoreCell value={r.payment} />
                <td className="px-4 py-2.5 tabular-nums font-bold text-white">
                  {r.overall === null ? <span className="text-slate-600">—</span> : r.overall}
                </td>
                <td className="px-4 py-2.5">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${BAND_STYLES[r.band]}`}>
                    {r.band === "critical" && <AlertOctagon className="h-2.5 w-2.5" />}
                    {r.band.replace("_", " ")}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-[11px] text-slate-500">
                  {r.computedAt ? new Date(r.computedAt).toLocaleDateString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ScoreCell({ value }: { value: number | null }) {
  if (value === null) return <td className="px-4 py-2.5 text-slate-600">—</td>;
  const color = value >= 80 ? "text-emerald-300" : value >= 60 ? "text-sky-300" : value >= 40 ? "text-amber-300" : "text-red-300";
  return <td className={`px-4 py-2.5 tabular-nums ${color}`}>{value}</td>;
}

function BandCard({ label, value, band }: { label: string; value: number; band: Row["band"] }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">{label}</div>
      <div className="flex items-baseline gap-2">
        <div className="text-2xl font-bold tabular-nums text-white">{value}</div>
        <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold capitalize ${BAND_STYLES[band]}`}>
          {band.replace("_"," ")}
        </span>
      </div>
    </div>
  );
}
