"use client";

/**
 * /super-admin
 * US-455: Super Admin Overview — aggregate platform stats across all tenants.
 *
 * Fetches from /api/super-admin/stats (service-role, bypasses RLS).
 * Middleware ensures only SUPER_ADMIN_EMAILS can reach this route.
 */

import { useState, useEffect } from "react";
import {
  Building2,
  Users,
  Briefcase,
  UserCheck,
  FileStack,
  TrendingUp,
  RefreshCw,
} from "lucide-react";

interface Stats {
  totalOrgs:         number;
  totalUsers:        number;
  totalJobs:         number;
  totalCandidates:   number;
  totalApplications: number;
  totalPlacements:   number;
  mau:               number;
}

const CARD_DEFS = [
  { key: "totalOrgs",         label: "Client Orgs",   sub: null,         icon: Building2,  color: "text-indigo-400" },
  { key: "totalUsers",        label: "Total Users",    subKey: "mau",     icon: Users,      color: "text-violet-400" },
  { key: "totalJobs",         label: "Total Jobs",     sub: null,         icon: Briefcase,  color: "text-sky-400" },
  { key: "totalCandidates",   label: "Candidates",     sub: null,         icon: UserCheck,  color: "text-emerald-400" },
  { key: "totalApplications", label: "Applications",   sub: null,         icon: FileStack,  color: "text-amber-400" },
  { key: "totalPlacements",   label: "Placements",     sub: null,         icon: TrendingUp, color: "text-rose-400" },
] as const;

export default function SuperAdminOverviewPage() {
  const [stats, setStats]     = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  function load() {
    setLoading(true);
    fetch("/api/super-admin/stats")
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setStats(d);
        setLoading(false);
      })
      .catch(() => { setError("Failed to load stats"); setLoading(false); });
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Platform Overview</h1>
          <p className="mt-0.5 text-sm text-slate-400">
            Aggregate metrics across all client organisations
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

      {error ? (
        <div className="rounded-lg border border-red-800 bg-red-950 p-4 text-sm text-red-400">{error}</div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {CARD_DEFS.map(card => {
            const Icon = card.icon;
            const value = stats ? stats[card.key as keyof Stats] : null;
            const sub = "subKey" in card && card.subKey && stats
              ? `${stats[card.subKey as keyof Stats].toLocaleString()} MAU (30-day)`
              : null;

            return (
              <div key={card.key} className="rounded-xl border border-slate-800 bg-slate-900 p-5">
                <div className="flex items-center justify-between mb-3">
                  <Icon className={`h-5 w-5 ${card.color}`} />
                </div>
                <div className="text-3xl font-bold text-white tabular-nums">
                  {loading ? "…" : (value ?? 0).toLocaleString()}
                </div>
                <div className="mt-1 text-sm font-medium text-slate-300">{card.label}</div>
                {sub && (
                  <div className="mt-0.5 text-xs text-slate-500">{loading ? "…" : sub}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-8 rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="text-sm font-semibold text-white mb-3">Quick links</h2>
        <div className="flex gap-4 text-sm">
          <a href="/super-admin/tenants" className="text-indigo-400 hover:text-indigo-300 transition-colors">
            → Tenant List
          </a>
        </div>
      </div>
    </div>
  );
}
