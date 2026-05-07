"use client";

/**
 * Executive Dashboard — US-068: Firm-Wide Executive Dashboard
 *
 * Aggregate KPIs across all recruiters and teams. Designed for
 * agency principals who need a single-screen health check on the
 * firm's performance: revenue, placement velocity, client health,
 * pipeline throughput, and recruiter leaderboard.
 *
 * Data sourced from:
 *   - usePlacements() for revenue + placement counts
 *   - useJobs() for pipeline state
 *   - useClientHealthScores() for client risk distribution
 *   - useRecruiterStats() for leaderboard
 *   - useCompanies() for active client count
 */

import { useMemo } from "react";
import Link from "next/link";
import { DollarSign, Users, Briefcase, TrendingUp, TriangleAlert as AlertTriangle, CircleCheck as CheckCircle2, ArrowUpRight, Star, Target, Activity } from "lucide-react";
import { cn, formatSalary } from "@/lib/utils";
import { usePlacements, useJobs, useCompanies, useClientHealthScores, useRecruiterStats, useFeatureFlag } from "@/lib/supabase/hooks";
import { FeatureGate } from "@/components/ui/feature-gate";

// ─── KPI Card ─────────────────────────────────────────────────────────────────

interface KPICardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  iconBg?: string;
  iconColor?: string;
  delta?: number;
}

function KPICard({ label, value, sub, icon: Icon, iconBg = "bg-brand-50", iconColor = "text-brand-600", delta }: KPICardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <div className={cn("rounded-lg p-2", iconBg)}>
          <Icon className={cn("h-4 w-4", iconColor)} />
        </div>
      </div>
      <p className="mt-3 text-3xl font-bold text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      {delta !== undefined && delta !== 0 && (
        <p className={cn("text-xs font-semibold mt-1", delta > 0 ? "text-emerald-600" : "text-red-500")}>
          <ArrowUpRight className={cn("inline h-3 w-3", delta < 0 && "rotate-180")} />
          {delta > 0 ? "+" : ""}{delta}% vs prior period
        </p>
      )}
    </div>
  );
}

// ─── Risk distribution bar ────────────────────────────────────────────────────

function RiskBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className={cn("w-2.5 h-2.5 rounded-full shrink-0", color)} />
      <div className="flex-1">
        <div className="flex items-center justify-between text-xs mb-0.5">
          <span className="text-muted-foreground">{label}</span>
          <span className="font-medium text-foreground">{count} clients</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div className={cn("h-full rounded-full", color)} style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ExecutiveDashboardPage() {
  // US-513: Executive dashboard is Pro-tier (executive_dashboard feature).
  const { enabled: execEnabled, loading: execLoading } = useFeatureFlag("executive_dashboard");
  const { placements, loading: placementsLoading } = usePlacements();
  const { jobs, loading: jobsLoading }             = useJobs();
  const { companies }                              = useCompanies();
  const { scores, loading: scoresLoading }         = useClientHealthScores();
  const { stats: recruiterStats }                  = useRecruiterStats();

  const now  = new Date();
  const ytdStart = new Date(now.getFullYear(), 0, 1);
  const _90dStart = new Date(now.getTime() - 90 * 86400000);

  const kpis = useMemo(() => {
    const ytd = placements.filter((p) => new Date(p.startDate || p.createdAt || p.placedAt) >= ytdStart);
    const prior90 = placements.filter((p) => {
      const d = new Date(p.startDate || p.createdAt || p.placedAt);
      const _180d = new Date(now.getTime() - 180 * 86400000);
      return d >= _180d && d < _90dStart;
    });
    const cur90 = placements.filter((p) => new Date(p.startDate || p.createdAt || p.placedAt) >= _90dStart);

    const ytdRevenue = ytd.reduce((s, p) => s + (p.feeAmount || 0), 0);
    const cur90Rev   = cur90.reduce((s, p) => s + (p.feeAmount || 0), 0);
    const prior90Rev = prior90.reduce((s, p) => s + (p.feeAmount || 0), 0);
    const revDelta   = prior90Rev > 0 ? Math.round(((cur90Rev - prior90Rev) / prior90Rev) * 100) : 0;

    const activeJobs    = jobs.filter((j) => j.status === "active").length;
    const activeClients = companies.filter((c) => !c.isArchived).length;

    const avgFee = ytd.length > 0 ? ytdRevenue / ytd.length : 0;

    return { ytdRevenue, ytdPlacements: ytd.length, activeJobs, activeClients, avgFee, revDelta };
  }, [placements, jobs, companies]);

  const riskCounts = useMemo(() => {
    const total    = scores.length;
    const critical = scores.filter((s) => s.riskLevel === "critical").length;
    const high     = scores.filter((s) => s.riskLevel === "high").length;
    const medium   = scores.filter((s) => s.riskLevel === "medium").length;
    const low      = scores.filter((s) => s.riskLevel === "low").length;
    return { total, critical, high, medium, low };
  }, [scores]);

  const atRiskClients = useMemo(
    () => scores.filter((s) => s.riskLevel === "high" || s.riskLevel === "critical").sort((a, b) => a.score - b.score).slice(0, 5),
    [scores]
  );

  const loading = placementsLoading || jobsLoading || scoresLoading;

  // US-513: plan gate — executive dashboard requires Pro tier.
  if (!execLoading && !execEnabled) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <FeatureGate feature="executive_dashboard" className="max-w-sm" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-8 space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="space-y-8 p-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground">Executive Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Firm-wide performance snapshot · {now.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </p>
        </div>

        {/* KPI grid */}
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <KPICard
            label="Revenue YTD"
            value={`$${(kpis.ytdRevenue / 1000).toFixed(0)}k`}
            sub="Fees from placed candidates"
            icon={DollarSign}
            iconBg="bg-emerald-50"
            iconColor="text-emerald-600"
            delta={kpis.revDelta}
          />
          <KPICard
            label="Placements YTD"
            value={kpis.ytdPlacements}
            sub="Confirmed starts this year"
            icon={CheckCircle2}
            iconBg="bg-blue-50"
            iconColor="text-blue-600"
          />
          <KPICard
            label="Active reqs"
            value={kpis.activeJobs}
            sub="Open positions in pipeline"
            icon={Briefcase}
            iconBg="bg-violet-50"
            iconColor="text-violet-600"
          />
          <KPICard
            label="Active clients"
            value={kpis.activeClients}
            sub={`Avg fee: $${(kpis.avgFee / 1000).toFixed(1)}k`}
            icon={Users}
            iconBg="bg-amber-50"
            iconColor="text-amber-600"
          />
        </div>

        {/* Two-column */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Client health risk distribution */}
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-semibold text-foreground">Client health</h2>
                <p className="text-xs text-muted-foreground">{riskCounts.total} clients scored</p>
              </div>
              <Link href="/clients" className="text-xs text-brand-600 hover:text-brand-700 font-medium">
                View all →
              </Link>
            </div>
            {riskCounts.total === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No health scores computed yet.</p>
            ) : (
              <div className="space-y-3">
                <RiskBar label="Critical" count={riskCounts.critical} total={riskCounts.total} color="bg-red-500" />
                <RiskBar label="High risk" count={riskCounts.high}     total={riskCounts.total} color="bg-orange-400" />
                <RiskBar label="Medium"   count={riskCounts.medium}   total={riskCounts.total} color="bg-amber-400" />
                <RiskBar label="Healthy"  count={riskCounts.low}      total={riskCounts.total} color="bg-emerald-500" />
              </div>
            )}

            {/* At-risk client list */}
            {atRiskClients.length > 0 && (
              <div className="mt-5 border-t border-border pt-4 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Needs attention</p>
                {atRiskClients.map((s) => (
                  <div key={s.id} className="flex items-center justify-between text-sm">
                    <Link href={`/clients/${s.companyId}`} className="text-foreground hover:text-brand-600 font-medium truncate">
                      {s.companyId}
                    </Link>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={cn(
                        "text-[10px] font-medium px-2 py-0.5 rounded-full",
                        s.riskLevel === "critical" ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"
                      )}>
                        {s.riskLevel}
                      </span>
                      <span className="text-xs text-muted-foreground">{s.score}/100</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recruiter leaderboard */}
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-semibold text-foreground">Recruiter leaderboard</h2>
                <p className="text-xs text-muted-foreground">YTD placements & revenue</p>
              </div>
              <Link href="/analytics" className="text-xs text-brand-600 hover:text-brand-700 font-medium">
                Full stats →
              </Link>
            </div>
            {(!recruiterStats || recruiterStats.length === 0) ? (
              <p className="text-sm text-muted-foreground text-center py-4">No recruiter data yet.</p>
            ) : (
              <div className="space-y-3">
                {recruiterStats.slice(0, 6).map((r, i) => (
                  <div key={r.userId ?? i} className="flex items-center gap-3">
                    <div className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0",
                      i === 0 ? "bg-amber-100 text-amber-700" :
                      i === 1 ? "bg-slate-100 text-slate-600" :
                      i === 2 ? "bg-orange-100 text-orange-700" :
                      "bg-muted text-muted-foreground"
                    )}>
                      {i === 0 ? <Star className="h-3 w-3" /> : i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{r.fullName ?? "Recruiter"}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-foreground">{r.placements ?? 0}</p>
                      <p className="text-[10px] text-muted-foreground">placed</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Pipeline by stage summary */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-base font-semibold text-foreground mb-1">Pipeline overview</h2>
          <p className="text-xs text-muted-foreground mb-5">
            {kpis.activeJobs} active reqs across {kpis.activeClients} clients
          </p>
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
            {[
              { label: "Active",   count: jobs.filter(j => j.status === "active").length,   color: "bg-emerald-500" },
              { label: "Draft",    count: jobs.filter(j => j.status === "draft").length,    color: "bg-slate-300"   },
              { label: "On hold",  count: jobs.filter(j => j.status === "on_hold").length,  color: "bg-amber-400"   },
              { label: "Filled",   count: jobs.filter(j => j.status === "filled").length,   color: "bg-blue-500"    },
              { label: "Closed",   count: jobs.filter(j => j.status === "closed").length,   color: "bg-red-400"     },
              { label: "Total",    count: jobs.length,                                       color: "bg-brand-600"   },
            ].map(({ label, count, color }) => (
              <div key={label} className="rounded-lg bg-muted/50 p-4 text-center">
                <div className={cn("w-2 h-2 rounded-full mx-auto mb-2", color)} />
                <p className="text-2xl font-bold text-foreground">{count}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
