"use client";

import { useState, useMemo, useEffect } from "react";
import { TrendingUp, TrendingDown, Users, CircleCheck as CheckCircle, DollarSign, Send, Star, Clock, ArrowUpRight, ArrowDownRight, Minus, Calendar, ChevronDown, Briefcase, ChartBar as BarChart3, Mail, LayoutDashboard } from "lucide-react";
import Link from "next/link";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { cn, formatSalary, generateAvatarColor, getInitials } from "@/lib/utils";
import { useJobs, useCompanies, useCandidates, usePlacements, useFunnelCounts, useRecruiterStats, usePermissions, useFeatureFlag } from "@/lib/supabase/hooks";
import { FeatureGate } from "@/components/ui/feature-gate";

// ─── Types ────────────────────────────────────────────────────────────────────

type Period = "30d" | "90d" | "ytd" | "all";

const PERIOD_LABELS: Record<Period, string> = {
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "ytd": "Year to date",
  "all": "All time",
};


const PRIORITY_BADGE: Record<string, string> = {
  high:   "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low:    "bg-slate-100 text-slate-600",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

interface KPICardProps {
  label: string;
  value: string | number;
  delta?: number;
  deltaLabel?: string;
  icon: React.ElementType;
  iconBg?: string;
  iconColor?: string;
}

function KPICard({ label, value, delta, deltaLabel, icon: Icon, iconBg = "bg-brand-50", iconColor = "text-brand-600" }: KPICardProps) {
  const isUp   = delta !== undefined && delta > 0;
  const isDown = delta !== undefined && delta < 0;
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <div className={cn("rounded-lg p-2", iconBg)}>
          <Icon className={cn("h-4 w-4", iconColor)} />
        </div>
      </div>
      <p className="mt-3 text-3xl font-bold text-foreground">{value}</p>
      {delta !== undefined && (
        <div className="mt-2 flex items-center gap-1">
          {isUp   && <ArrowUpRight   className="h-3.5 w-3.5 text-emerald-500" />}
          {isDown && <ArrowDownRight className="h-3.5 w-3.5 text-red-500" />}
          {!isUp && !isDown && <Minus className="h-3.5 w-3.5 text-muted-foreground" />}
          <span className={cn("text-xs font-semibold",
            isUp ? "text-emerald-600" : isDown ? "text-red-500" : "text-muted-foreground"
          )}>
            {isUp ? "+" : ""}{delta}%
          </span>
          {deltaLabel && <span className="text-xs text-muted-foreground">{deltaLabel}</span>}
        </div>
      )}
    </div>
  );
}

function MiniFunnelBar({
  label, count, max, color, conversion,
}: {
  label: string; count: number; max: number; color: string; conversion?: number;
}) {
  const width = max > 0 ? Math.max((count / max) * 100, 4) : 4;
  return (
    <div className="flex items-center gap-3">
      <div className="w-28 shrink-0 text-right">
        <p className="text-xs font-medium text-foreground">{label}</p>
        <p className="text-[10px] text-muted-foreground">{count}</p>
      </div>
      <div className="flex-1">
        <div className={cn("h-6 rounded-md transition-all", color)} style={{ width: `${width}%` }} />
      </div>
      {conversion !== undefined && (
        <div className="w-12 shrink-0 text-right">
          <span className={cn("text-xs font-semibold",
            conversion >= 70 ? "text-emerald-600" : conversion >= 40 ? "text-amber-600" : "text-red-500"
          )}>
            {conversion}%
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Custom tooltip for recharts ──────────────────────────────────────────────

function RevenueTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg">
      <p className="mb-1 text-xs font-semibold text-foreground">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 text-xs">
          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="text-muted-foreground capitalize">{p.name}:</span>
          <span className="font-semibold text-foreground">${(p.value / 1000).toFixed(0)}k</span>
        </div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const TABS = ["overview", "recruiters", "clients", "revenue", "email-sync"] as const;
type Tab = typeof TABS[number];

export default function AnalyticsPage() {
  const [activeTab, setActiveTab]   = useState<Tab>("overview");
  const [period, setPeriod]         = useState<Period>("30d");
  const [gpCostRate, setGpCostRate] = useState(30); // % of fee — default 30%
  const [periodOpen, setPeriodOpen] = useState(false);

  const { can, loading: permLoading } = usePermissions();
  const { enabled: analyticsEnabled, loading: featureLoading } = useFeatureFlag("analytics");

  const { jobs }              = useJobs();
  const { companies }         = useCompanies();
  const { candidates }        = useCandidates();
  const { placements }        = usePlacements();
  const { stages: funnelStages } = useFunnelCounts();
  const { stats: recruiterStats } = useRecruiterStats();

  const totalPlacementFees = useMemo(
    () => placements.reduce((s, p) => s + (p.feeAmount ?? 0), 0),
    [placements]
  );

  // Build company lookup map
  const companyMap = useMemo(() => {
    const m: Record<string, { name: string; industry: string }> = {};
    companies.forEach((c) => { m[c.id] = { name: c.name, industry: c.industry ?? "—" }; });
    return m;
  }, [companies]);

  // Revenue pipeline — all jobs with an estimated fee
  const revenueJobs = useMemo(() =>
    jobs
      .filter((j) => j.estimatedFee && j.estimatedFee > 0)
      .map((j) => ({
        id:             j.id,
        title:          j.title,
        clientName:     j.clientId ? companyMap[j.clientId]?.name : j.client?.name ?? "—",
        estimatedFee:   j.estimatedFee ?? 0,
        feeProbability: j.feeProbability ?? 50,
        status:         j.status,
      }))
      .sort((a, b) => (b.estimatedFee * b.feeProbability) - (a.estimatedFee * a.feeProbability)),
    [jobs, companyMap]
  );

  // Active jobs for the searches table
  const activeJobs = useMemo(() =>
    jobs.filter((j) => j.status === "active"),
    [jobs]
  );

  // Client stats — real job counts + placement counts + fees
  const clientStats = useMemo(() =>
    companies.map((c) => {
      const clientJobs       = jobs.filter((j) => j.clientId === c.id);
      const clientPlacements = placements.filter((p) => p.clientId === c.id);
      const totalFees        = clientPlacements.reduce((s, p) => s + (p.feeAmount ?? 0), 0);
      const openJobs         = clientJobs.filter((j) => j.status === "active").length;
      const totalCandidates  = clientJobs.reduce((s, j) => s + (j.candidateCount ?? 0), 0);
      const avgFill = clientPlacements.length > 0
        ? Math.round(
            clientPlacements.reduce((s, p) => {
              if (!p.placedAt) return s;
              const job = clientJobs.find((j) => j.id === p.jobId);
              if (!job) return s;
              return s + Math.floor((new Date(p.placedAt).getTime() - new Date(job.createdAt).getTime()) / 86_400_000);
            }, 0) / clientPlacements.length
          )
        : null;
      return {
        id:            c.id,
        name:          c.name,
        industry:      c.industry ?? "—",
        jobCount:      clientJobs.length,
        openJobs,
        candidates:    totalCandidates,
        placements:    clientPlacements.length,
        totalFees,
        avgFillDays:   avgFill,
      };
    }).filter((c) => c.jobCount > 0).sort((a, b) => b.totalFees - a.totalFees),
    [companies, jobs, placements]
  );

  const funnelMax  = Math.max(...funnelStages.map((s) => s.count), 1);
  const totalRevenue = revenueJobs.reduce((s, j) => s + j.estimatedFee, 0);
  const weightedRev  = revenueJobs.reduce((s, j) => s + (j.estimatedFee * j.feeProbability / 100), 0);
  const closedRevenue = totalPlacementFees;

  // GP calculations
  const costRateFraction = gpCostRate / 100;
  const gpPlacements = useMemo(() =>
    placements
      .filter((p) => p.feeAmount && p.feeAmount > 0)
      .map((p) => {
        const fee    = p.feeAmount;
        const cost   = fee * costRateFraction;
        const gp     = fee - cost;
        const margin = (gp / fee) * 100;
        return { id: p.id, candidateName: p.candidateName, clientName: p.clientName, fee, cost, gp, margin, placedAt: p.placedAt };
      })
      .sort((a, b) => b.gp - a.gp),
    [placements, costRateFraction]
  );
  const totalGP    = gpPlacements.reduce((s, p) => s + p.gp, 0);
  const avgMargin  = closedRevenue > 0 ? (totalGP / closedRevenue) * 100 : 0;
  const totalCost  = gpPlacements.reduce((s, p) => s + p.cost, 0);

  // Compute monthly revenue from real placement data (last 7 months)
  const monthlyRevenue = useMemo(() => {
    const now = new Date();
    const months: { month: string; closed: number; pipeline: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.toLocaleString("default", { month: "short" });
      const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const closed = placements
        .filter((p) => (p.placedAt ?? "").startsWith(monthStr))
        .reduce((s, p) => s + (p.feeAmount ?? 0), 0);
      months.push({ month: label, closed, pipeline: 0 });
    }
    return months;
  }, [placements]);

  // Access guard — recruiters and researchers can't view analytics
  if (!permLoading && !can("analytics:view")) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-sm">
          <BarChart3 className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
          <h2 className="text-base font-semibold text-foreground mb-1">Analytics not available</h2>
          <p className="text-sm text-muted-foreground">
            You need Senior Recruiter access or above to view analytics. Contact your admin to upgrade your role.
          </p>
        </div>
      </div>
    );
  }

  // Plan gate — analytics requires Growth or above
  if (!featureLoading && !analyticsEnabled) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <FeatureGate feature="analytics" className="max-w-sm" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="space-y-6 p-8">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">Agency performance · Ikhaya Talent</p>
            <Link
              href="/analytics/executive"
              className="inline-flex items-center gap-1.5 mt-2 text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              Executive dashboard →
            </Link>
          </div>

          {/* Period selector */}
          <div className="relative">
            <button
              onClick={() => setPeriodOpen(v => !v)}
              className="flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors"
            >
              <Calendar className="h-4 w-4 text-muted-foreground" />
              {PERIOD_LABELS[period]}
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            {periodOpen && (
              <div className="absolute right-0 top-10 z-20 w-44 rounded-xl border border-border bg-card shadow-xl overflow-hidden">
                {(Object.entries(PERIOD_LABELS) as [Period, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => { setPeriod(key); setPeriodOpen(false); }}
                    className={cn(
                      "flex w-full items-center justify-between px-3.5 py-2.5 text-sm transition-colors hover:bg-accent",
                      period === key ? "text-brand-600 font-semibold" : "text-foreground"
                    )}
                  >
                    {label}
                    {period === key && <span className="h-1.5 w-1.5 rounded-full bg-brand-600" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 border-b border-border">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-5 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize",
                activeTab === tab
                  ? "border-brand-600 text-brand-600"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* ── Overview ── */}
        {activeTab === "overview" && (
          <div className="space-y-6">

            {/* KPIs */}
            <div className="grid grid-cols-4 gap-4">
              <KPICard
                label="Active Candidates"
                value={candidates.filter((c) => c.status === "active" || c.status === "passive").length}
                icon={Users}
                iconBg="bg-violet-50"
                iconColor="text-violet-600"
              />
              <KPICard
                label="Open Searches"
                value={activeJobs.length}
                icon={Briefcase}
                iconBg="bg-brand-50"
                iconColor="text-brand-600"
              />
              <KPICard
                label="Active Clients"
                value={clientStats.length}
                icon={CheckCircle}
                iconBg="bg-emerald-50"
                iconColor="text-emerald-600"
              />
              <KPICard
                label="Weighted Pipeline"
                value={`$${(weightedRev / 1000).toFixed(0)}k`}
                icon={DollarSign}
                iconBg="bg-amber-50"
                iconColor="text-amber-600"
              />
            </div>

            {/* Revenue chart + funnel */}
            <div className="grid grid-cols-5 gap-6">

              {/* Monthly revenue chart */}
              <div className="col-span-3 rounded-xl border border-border bg-card p-5">
                <div className="mb-4">
                  <h2 className="text-sm font-semibold text-foreground">Monthly Revenue</h2>
                  <p className="text-xs text-muted-foreground">Closed fees vs. pipeline value</p>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={monthlyRevenue} barCategoryGap="30%" barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(v) => `$${v/1000}k`} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={44} />
                    <Tooltip content={<RevenueTooltip />} cursor={{ fill: "hsl(var(--accent))" }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="closed"   name="Closed"   fill="#7c3aed" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="pipeline" name="Pipeline" fill="#e5e7eb" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Agency funnel */}
              <div className="col-span-2 rounded-xl border border-border bg-card p-5">
                <div className="mb-4">
                  <h2 className="text-sm font-semibold text-foreground">Agency Funnel</h2>
                  <p className="text-xs text-muted-foreground">Stage-by-stage throughput</p>
                </div>
                <div className="space-y-2">
                  {funnelStages.length === 0 ? (
                    <p className="py-6 text-center text-xs text-muted-foreground">No pipeline activity yet</p>
                  ) : funnelStages.map((stage, i) => {
                    const prev = i > 0 ? funnelStages[i - 1].count : stage.count;
                    const conv = prev > 0 ? Math.round((stage.count / prev) * 100) : 100;
                    return (
                      <MiniFunnelBar
                        key={stage.stageName}
                        label={stage.stageName}
                        count={stage.count}
                        max={funnelMax}
                        color="bg-brand-500"
                        conversion={i > 0 ? conv : undefined}
                      />
                    );
                  })}
                </div>
                <div className="mt-3 flex gap-4 border-t border-border pt-3">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Source → Place</p>
                    <p className="text-base font-bold text-foreground">6.1%</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Sub → Place</p>
                    <p className="text-base font-bold text-foreground">14.0%</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Avg days</p>
                    <p className="text-base font-bold text-foreground">41d</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Active searches table */}
            <div className="rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border px-5 py-3">
                <h2 className="text-sm font-semibold text-foreground">Active Searches</h2>
                <span className="text-xs text-muted-foreground">{activeJobs.length} open</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      {["Role", "Client", "Est. Fee", "Probability", "Weighted", "Priority"].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activeJobs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">No active searches</td>
                      </tr>
                    ) : (
                      activeJobs.map((job) => {
                        const clientName = job.clientId ? companyMap[job.clientId]?.name : job.client?.name ?? "—";
                        const fee = job.estimatedFee ?? 0;
                        const prob = job.feeProbability ?? 50;
                        const priority = job.priority ?? "medium";
                        return (
                          <tr key={job.id} className="border-b border-border last:border-0 hover:bg-accent/40 transition-colors">
                            <td className="px-4 py-3 text-sm font-medium text-foreground">{job.title}</td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">{clientName}</td>
                            <td className="px-4 py-3 text-sm font-semibold text-foreground">{fee > 0 ? `$${(fee / 1000).toFixed(0)}k` : "—"}</td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">{prob}%</td>
                            <td className="px-4 py-3 text-sm font-semibold text-emerald-700">{fee > 0 ? `$${((fee * prob / 100) / 1000).toFixed(0)}k` : "—"}</td>
                            <td className="px-4 py-3">
                              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize", PRIORITY_BADGE[priority] ?? PRIORITY_BADGE.medium)}>
                                {priority}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                    {activeJobs.length > 0 && (
                      <tr className="border-t border-border bg-muted/20">
                        <td colSpan={4} className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">Total weighted pipeline</td>
                        <td className="px-4 py-2.5 text-sm font-bold text-emerald-700">
                          ${(weightedRev / 1000).toFixed(0)}k
                        </td>
                        <td />
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── Recruiters ── */}
        {activeTab === "recruiters" && (
          <div className="space-y-6">

            {/* Quick KPIs */}
            <div className="grid grid-cols-4 gap-4">
              <KPICard label="Team Submissions" value="93"  delta={8}  deltaLabel="vs last period" icon={Send}         iconBg="bg-brand-50"    iconColor="text-brand-600" />
              <KPICard label="Total Interviews"  value="54"  delta={15} deltaLabel="vs last period" icon={Users}        iconBg="bg-violet-50"  iconColor="text-violet-600" />
              <KPICard label="Total Placements"  value="14"  delta={17} deltaLabel="vs last period" icon={CheckCircle}  iconBg="bg-emerald-50" iconColor="text-emerald-600" />
              <KPICard label="Revenue Generated" value="$704k" delta={22} deltaLabel="vs last period" icon={DollarSign} iconBg="bg-amber-50"   iconColor="text-amber-600" />
            </div>

            {/* Leaderboard */}
            <div className="rounded-xl border border-border bg-card">
              <div className="border-b border-border px-5 py-3">
                <h2 className="text-sm font-semibold text-foreground">Recruiter Leaderboard</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">Performance metrics · {PERIOD_LABELS[period]}</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      {["Recruiter", "Submissions", "Interviews", "Sub → Int", "Placements", "Int → Place", "Avg Days", "Revenue"].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recruiterStats.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">
                          No recruiter data yet — submissions will appear here as they are recorded
                        </td>
                      </tr>
                    ) : recruiterStats.map((r, i) => (
                      <tr key={r.userId} className="border-b border-border last:border-0 hover:bg-accent/40 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            {i === 0 && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400 shrink-0" />}
                            {i > 0  && <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground shrink-0">{i + 1}</span>}
                            <p className="text-sm font-medium text-foreground">{r.fullName}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-foreground">{r.submissions}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">—</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">—</td>
                        <td className="px-4 py-3 text-sm font-bold text-foreground">{r.placements}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">—</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">—</td>
                        <td className="px-4 py-3 text-sm font-semibold text-emerald-700">${(r.revenue / 1000).toFixed(0)}k</td>
                      </tr>
                    ))}
                    {recruiterStats.length > 0 && (
                      <tr className="border-t border-border bg-muted/20">
                        <td className="px-4 py-2.5 text-xs font-semibold text-muted-foreground">Team total</td>
                        <td className="px-4 py-2.5 text-sm font-bold text-foreground">{recruiterStats.reduce((s, r) => s + r.submissions, 0)}</td>
                        <td colSpan={2} />
                        <td className="px-4 py-2.5 text-sm font-bold text-foreground">{recruiterStats.reduce((s, r) => s + r.placements, 0)}</td>
                        <td colSpan={2} />
                        <td className="px-4 py-2.5 text-sm font-bold text-emerald-700">
                          ${(recruiterStats.reduce((s, r) => s + r.revenue, 0) / 1000).toFixed(0)}k
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Individual breakdowns */}
            {recruiterStats.length > 0 && (
              <div className="grid grid-cols-4 gap-4">
                {recruiterStats.map((r) => {
                  const placementRate = r.submissions > 0 ? Math.round((r.placements / r.submissions) * 100) : 0;
                  return (
                    <div key={r.userId} className="rounded-xl border border-border bg-card p-4">
                      <p className="text-sm font-semibold text-foreground">{r.fullName}</p>
                      <p className="mb-3 text-[10px] text-muted-foreground">Recruiter</p>

                      <div className="mb-2">
                        <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
                          <span>Submissions → Placements</span>
                          <span className="font-semibold text-foreground">{placementRate}%</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                          <div
                            className={cn("h-full rounded-full",
                              placementRate >= 20 ? "bg-emerald-500" : placementRate >= 10 ? "bg-amber-400" : "bg-red-400"
                            )}
                            style={{ width: `${placementRate}%` }}
                          />
                        </div>
                      </div>

                      <div className="mt-3 pt-2 border-t border-border flex justify-between text-xs">
                        <span className="text-muted-foreground">Revenue</span>
                        <span className="font-bold text-emerald-700">${(r.revenue / 1000).toFixed(0)}k</span>
                      </div>
                      <div className="flex justify-between text-xs mt-1">
                        <span className="text-muted-foreground">Placements</span>
                        <span className="font-semibold text-foreground">{r.placements}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Clients ── */}
        {activeTab === "clients" && (
          <div className="space-y-6">

            <div className="grid grid-cols-4 gap-4">
              <KPICard label="Active Clients"    value={clientStats.length}              icon={Briefcase}  iconBg="bg-brand-50"    iconColor="text-brand-600" />
              <KPICard label="Open Searches"     value={activeJobs.length}               icon={Send}       iconBg="bg-violet-50"  iconColor="text-violet-600" />
              <KPICard label="Total Placements"  value={placements.length}                                  icon={CheckCircle} iconBg="bg-emerald-50" iconColor="text-emerald-600" />
              <KPICard label="Total Fees"        value={formatSalary(totalPlacementFees, "USD", true)}   icon={DollarSign} iconBg="bg-amber-50"   iconColor="text-amber-600" />
            </div>

            {/* Client health table */}
            <div className="rounded-xl border border-border bg-card">
              <div className="border-b border-border px-5 py-3">
                <h2 className="text-sm font-semibold text-foreground">Client Health</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">Placements, fees, and pipeline depth · {PERIOD_LABELS[period]}</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      {["Client", "Industry", "Total Jobs", "Open", "Candidates", "Placements", "Avg Fill", "Total Fees"].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {clientStats.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">No clients with searches yet</td>
                      </tr>
                    ) : clientStats.map((c) => (
                      <tr key={c.id} className="border-b border-border last:border-0 hover:bg-accent/40 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded text-[9px] font-bold text-white", generateAvatarColor(c.id))}>
                              {getInitials(c.name)}
                            </div>
                            <Link href={`/clients/${c.id}`} className="text-sm font-medium text-foreground hover:text-brand-600 transition-colors">
                              {c.name}
                            </Link>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{c.industry}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-foreground">{c.jobCount}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{c.openJobs}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{c.candidates}</td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            "text-sm font-semibold",
                            c.placements > 0 ? "text-emerald-600" : "text-muted-foreground"
                          )}>{c.placements}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {c.avgFillDays != null ? `${c.avgFillDays}d` : "—"}
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-foreground">
                          {c.totalFees > 0 ? formatSalary(c.totalFees, "USD", true) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Engagement insight — data-driven */}
            {(() => {
              const lowEngagement = clientStats.filter(
                (c) => c.candidates > 2 && c.placements === 0
              );
              if (!lowEngagement.length) return null;
              const names = lowEngagement.slice(0, 2).map((c) => c.name).join(" and ");
              const more  = lowEngagement.length > 2 ? ` (+${lowEngagement.length - 2} more)` : "";
              return (
                <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-4">
                  <div className="flex items-start gap-3">
                    <Clock className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">Engagement Insight</p>
                      <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
                        {names}{more} {lowEngagement.length === 1 ? "has" : "have"} active candidates but no placements yet — consider scheduling a check-in to move the deal forward.
                      </p>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Client revenue bar chart */}
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-foreground">Revenue by Client</h2>
                <p className="text-xs text-muted-foreground">Placement fees earned per client</p>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={revenueJobs.reduce<{ name: string; fees: number }[]>((acc, j) => {
                    const existing = acc.find((x) => x.name === (j.clientName ?? "").split(" ")[0]);
                    if (existing) { existing.fees += j.estimatedFee; } else { acc.push({ name: (j.clientName ?? "—").split(" ")[0], fees: j.estimatedFee }); }
                    return acc;
                  }, [])}
                  barCategoryGap="35%"
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v) => `$${v/1000}k`} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={44} />
                  <Tooltip formatter={(v: number) => [`$${(v / 1000).toFixed(0)}k`, "Fees"]} cursor={{ fill: "hsl(var(--accent))" }} />
                  <Bar dataKey="fees" name="Fees" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ── Revenue ── */}
        {activeTab === "revenue" && (
          <div className="space-y-6">

            {/* Revenue KPIs */}
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-xl border border-border bg-card p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Closed Revenue</p>
                <p className="mt-2 text-3xl font-bold text-foreground">${(closedRevenue / 1000).toFixed(0)}k</p>
                <div className="mt-1 flex items-center gap-1">
                  <ArrowUpRight className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="text-xs font-semibold text-emerald-600">+22%</span>
                  <span className="text-xs text-muted-foreground">vs last period</span>
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">13 placements</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pipeline Value</p>
                <p className="mt-2 text-3xl font-bold text-foreground">${(totalRevenue / 1000).toFixed(0)}k</p>
                <p className="mt-1 text-[10px] text-muted-foreground">unweighted · {revenueJobs.length} searches with fees</p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Weighted Pipeline</p>
                <p className="mt-2 text-3xl font-bold text-emerald-700">${(weightedRev / 1000).toFixed(0)}k</p>
                <p className="mt-1 text-[10px] text-emerald-600">probability-adjusted expected value</p>
              </div>
            </div>

            {/* Revenue trend chart */}
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-foreground">Revenue Trend</h2>
                <p className="text-xs text-muted-foreground">Monthly closed fees and pipeline value</p>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={monthlyRevenue}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v) => `$${v/1000}k`} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={44} />
                  <Tooltip content={<RevenueTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line dataKey="closed"   name="Closed"   stroke="#7c3aed" strokeWidth={2.5} dot={{ r: 3, fill: "#7c3aed" }} />
                  <Line dataKey="pipeline" name="Pipeline" stroke="#d1d5db" strokeWidth={2}   dot={{ r: 3, fill: "#d1d5db" }} strokeDasharray="4 4" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* GP KPIs */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Gross Profit View</h2>
                  <p className="text-xs text-muted-foreground">Based on cost rate assumption applied to closed placements</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Cost rate</span>
                  <div className="relative flex items-center">
                    <input
                      type="number" min={0} max={100} step={1}
                      value={gpCostRate}
                      onChange={(e) => setGpCostRate(Math.max(0, Math.min(100, Number(e.target.value))))}
                      className="w-16 rounded-lg border border-border bg-background px-2 py-1.5 pr-5 text-xs font-semibold text-foreground outline-none focus:ring-2 focus:ring-brand-500 text-right"
                    />
                    <span className="absolute right-1.5 text-xs text-muted-foreground">%</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-xl border border-border bg-card p-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Gross Profit</p>
                  <p className="mt-2 text-3xl font-bold text-foreground">${(totalGP / 1000).toFixed(0)}k</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    from ${(closedRevenue / 1000).toFixed(0)}k closed revenue
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-card p-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">GP Margin</p>
                  <p className="mt-2 text-3xl font-bold text-foreground">{avgMargin.toFixed(1)}%</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    cost rate {gpCostRate}% · net of delivery cost
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-card p-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Cost</p>
                  <p className="mt-2 text-3xl font-bold text-foreground">${(totalCost / 1000).toFixed(0)}k</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    implied delivery cost across {gpPlacements.length} placements
                  </p>
                </div>
              </div>
            </div>

            {/* Per-placement GP breakdown */}
            <div className="rounded-xl border border-border bg-card">
              <div className="border-b border-border px-5 py-3">
                <h2 className="text-sm font-semibold text-foreground">Gross Profit by Placement</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">Fee · implied cost · GP · margin per closed placement</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      {["Candidate", "Client", "Fee", "Cost", "GP", "Margin"].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {gpPlacements.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                          No closed placements with fee data yet
                        </td>
                      </tr>
                    ) : gpPlacements.map((p) => (
                      <tr key={p.id} className="border-b border-border last:border-0 hover:bg-accent/40 transition-colors">
                        <td className="px-4 py-3 text-sm font-medium text-foreground">{p.candidateName}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{p.clientName}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-foreground">${p.fee.toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm text-rose-600">−${p.cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                        <td className="px-4 py-3 text-sm font-bold text-emerald-700">${p.gp.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-16 rounded-full bg-secondary overflow-hidden">
                              <div
                                className={cn("h-full rounded-full",
                                  p.margin >= 60 ? "bg-emerald-500" : p.margin >= 40 ? "bg-amber-400" : "bg-red-400"
                                )}
                                style={{ width: `${Math.min(p.margin, 100)}%` }}
                              />
                            </div>
                            <span className={cn("text-xs font-semibold",
                              p.margin >= 60 ? "text-emerald-600" : p.margin >= 40 ? "text-amber-600" : "text-red-500"
                            )}>
                              {p.margin.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {gpPlacements.length > 0 && (
                    <tfoot>
                      <tr className="border-t border-border bg-muted/20">
                        <td colSpan={2} className="px-4 py-3 text-xs font-semibold text-muted-foreground">Totals</td>
                        <td className="px-4 py-3 text-sm font-bold text-foreground">${closedRevenue.toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-rose-600">−${totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                        <td className="px-4 py-3 text-sm font-bold text-emerald-700">${totalGP.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                        <td className="px-4 py-3 text-xs font-bold text-foreground">{avgMargin.toFixed(1)}%</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            {/* Revenue pipeline by search */}
            <div className="rounded-xl border border-border bg-card">
              <div className="border-b border-border px-5 py-3">
                <h2 className="text-sm font-semibold text-foreground">Revenue Pipeline by Search</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">Estimated fee × close probability</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      {["Role", "Client", "Est. Fee", "Probability", "Weighted Value", "Status"].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {revenueJobs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                          No jobs with estimated fees — add fee details to your open searches
                        </td>
                      </tr>
                    ) : revenueJobs.map((job) => {
                        const weighted = job.estimatedFee * job.feeProbability / 100;
                        return (
                          <tr key={job.id} className="border-b border-border last:border-0 hover:bg-accent/40 transition-colors">
                            <td className="px-4 py-3 text-sm font-medium text-foreground">{job.title}</td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">{job.clientName}</td>
                            <td className="px-4 py-3 text-sm font-semibold text-foreground">${(job.estimatedFee / 1000).toFixed(0)}k</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="h-1.5 w-20 rounded-full bg-secondary overflow-hidden">
                                  <div
                                    className={cn("h-full rounded-full",
                                      job.feeProbability >= 70 ? "bg-emerald-500" : job.feeProbability >= 40 ? "bg-amber-400" : "bg-red-400"
                                    )}
                                    style={{ width: `${job.feeProbability}%` }}
                                  />
                                </div>
                                <span className={cn("text-xs font-semibold",
                                  job.feeProbability >= 70 ? "text-emerald-600" : job.feeProbability >= 40 ? "text-amber-600" : "text-red-500"
                                )}>
                                  {job.feeProbability}%
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm font-bold text-emerald-700">${(weighted / 1000).toFixed(0)}k</td>
                            <td className="px-4 py-3">
                              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold",
                                job.status === "active"  ? "bg-emerald-100 text-emerald-700" :
                                job.status === "on_hold" ? "bg-amber-100 text-amber-700"   :
                                job.status === "filled"  ? "bg-brand-100 text-brand-700"      :
                                                            "bg-slate-100 text-slate-600"
                              )}>
                                {job.status === "on_hold" ? "On Hold" : job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border bg-muted/20">
                      <td colSpan={4} className="px-4 py-3 text-xs font-semibold text-muted-foreground">Total weighted pipeline</td>
                      <td className="px-4 py-3 text-sm font-bold text-emerald-700">${(weightedRev / 1000).toFixed(0)}k</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── Email Sync ── */}
        {activeTab === "email-sync" && (
          <EmailSyncMetricsCard />
        )}

      </div>
    </div>
  );
}

// ─── Email Sync Metrics Card (lazy-loaded data) ──────────────────────────────

function EmailSyncMetricsCard() {
  const [metrics, setMetrics] = useState<{
    connectionCountGoogle: number;
    connectionCountMicrosoft: number;
    messagesSyncedTotal: number;
    matchPrecisionRate: number | null;
    activationRate: number | null;
    freshnessP50Seconds: number | null;
    errorCount: number;
    history: { date: string; messages: number; errors: number }[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: userRow } = await supabase
          .from("users")
          .select("agency_id")
          .eq("id", user.id)
          .single();
        if (!userRow) return;

        const agencyId = userRow.agency_id;

        // Fetch recent metrics snapshots
        const { data: snapshots } = await supabase
          .from("metrics_email_sync")
          .select("*")
          .eq("agency_id", agencyId)
          .order("recorded_at", { ascending: false })
          .limit(30);

        if (snapshots && snapshots.length > 0) {
          const latest = snapshots[0];
          const history = snapshots
            .slice(0, 14)
            .reverse()
            .map((s) => ({
              date: new Date(s.recorded_at).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              }),
              messages: s.messages_synced_total ?? 0,
              errors: s.error_count ?? 0,
            }));

          setMetrics({
            connectionCountGoogle: latest.connection_count_google ?? 0,
            connectionCountMicrosoft: latest.connection_count_microsoft ?? 0,
            messagesSyncedTotal: latest.messages_synced_total ?? 0,
            matchPrecisionRate: latest.match_precision_rate != null ? Number(latest.match_precision_rate) : null,
            activationRate: latest.activation_rate != null ? Number(latest.activation_rate) : null,
            freshnessP50Seconds: latest.freshness_p50_seconds,
            errorCount: latest.error_count ?? 0,
            history,
          });
        } else {
          // No metrics yet — show empty state with zeros
          setMetrics({
            connectionCountGoogle: 0,
            connectionCountMicrosoft: 0,
            messagesSyncedTotal: 0,
            matchPrecisionRate: null,
            activationRate: null,
            freshnessP50Seconds: null,
            errorCount: 0,
            history: [],
          });
        }
      } catch {
        // Silent fail — metrics are non-critical
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Loading email sync metrics...
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Unable to load metrics
      </div>
    );
  }

  const freshLabel =
    metrics.freshnessP50Seconds != null
      ? metrics.freshnessP50Seconds < 3600
        ? `${Math.round(metrics.freshnessP50Seconds / 60)}m`
        : `${Math.round(metrics.freshnessP50Seconds / 3600)}h`
      : "—";

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-5 gap-4">
        {[
          { label: "Google Connections", value: metrics.connectionCountGoogle },
          { label: "Microsoft Connections", value: metrics.connectionCountMicrosoft },
          { label: "Total Messages", value: metrics.messagesSyncedTotal.toLocaleString() },
          {
            label: "Match Rate",
            value: metrics.matchPrecisionRate != null
              ? `${(metrics.matchPrecisionRate * 100).toFixed(1)}%`
              : "—",
          },
          { label: "Freshness P50", value: freshLabel },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {kpi.label}
            </p>
            <p className="mt-2 text-2xl font-bold text-foreground">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Activity rate + errors */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground">Activation Rate</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Percentage of agency users with at least one email connection
          </p>
          <p className="mt-3 text-3xl font-bold text-foreground">
            {metrics.activationRate != null
              ? `${(metrics.activationRate * 100).toFixed(0)}%`
              : "—"}
          </p>
        </div>
        <div className={cn(
          "rounded-xl border bg-card p-5",
          metrics.errorCount > 0 ? "border-red-200" : "border-border"
        )}>
          <h3 className="text-sm font-semibold text-foreground">Errors (24h)</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Sync errors in the last 24 hours
          </p>
          <p className={cn(
            "mt-3 text-3xl font-bold",
            metrics.errorCount > 0 ? "text-red-600" : "text-foreground"
          )}>
            {metrics.errorCount}
          </p>
        </div>
      </div>

      {/* History chart */}
      {metrics.history.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-foreground">Sync Activity</h3>
            <p className="text-xs text-muted-foreground">Messages synced over time</p>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={metrics.history} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                width={44}
              />
              <Tooltip />
              <Bar dataKey="messages" name="Messages" fill="#7c3aed" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {metrics.history.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <Mail className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            No sync metrics recorded yet. Metrics will appear here after email syncs run.
          </p>
        </div>
      )}
    </div>
  );
}
