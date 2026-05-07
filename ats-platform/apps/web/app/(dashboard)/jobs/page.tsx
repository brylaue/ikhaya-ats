"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Plus, Briefcase, MapPin, DollarSign, Calendar, Users,
  TrendingUp, Eye, Search, Download, AlertTriangle, User,
} from "lucide-react";
import { cn, formatSalary, generateAvatarColor, getInitials, JOB_PRIORITY_COLORS } from "@/lib/utils";
import { AddJobModal } from "@/components/jobs/add-job-modal";
import { useJobs, usePlacements, useSLABreaches, usePipelineHealth, useCurrentUser, useCompanies, type NewJobInput } from "@/lib/supabase/hooks";
import { PipelineHealthBadge } from "@/components/pipeline/pipeline-health-badge";
import { toast } from "sonner";

// ─── Owner scope toggle ───────────────────────────────────────────────────────

type OwnerScope = "mine" | "all";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function JobsPage() {
  const { jobs, loading, addJob }        = useJobs();
  const { placements }                   = usePlacements();
  const { breaches }                     = useSLABreaches();
  const { scores: healthScores }         = usePipelineHealth();
  const { user: currentUser }            = useCurrentUser();
  const { companies }                    = useCompanies();

  // ─── Filter state ───────────────────────────────────────────────────────────
  const [ownerScope, setOwnerScope]       = useState<OwnerScope>("mine");
  const [statusFilter, setStatusFilter]   = useState<string>("active");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [clientFilter, setClientFilter]   = useState<string>("all");
  const [searchQuery, setSearchQuery]     = useState("");
  const [showAddModal, setShowAddModal]   = useState(false);

  // Derived lookups
  const healthByJobId = useMemo(
    () => healthScores.reduce<Record<string, import("@/lib/supabase/hooks").JobHealthScore>>((m, s) => { m[s.jobId] = s; return m; }, {}),
    [healthScores]
  );
  const breachByJob = useMemo(
    () => breaches.reduce<Record<string, number>>((m, b) => { m[b.jobId] = (m[b.jobId] ?? 0) + 1; return m; }, {}),
    [breaches]
  );
  const placedByJobId = useMemo(
    () => placements.reduce<Record<string, number>>((acc, p) => { if (p.jobId) acc[p.jobId] = (acc[p.jobId] ?? 0) + 1; return acc; }, {}),
    [placements]
  );

  // Active clients for the company filter dropdown
  const activeClients = useMemo(
    () => Array.from(new Map(jobs.map((j) => [j.clientId, j.companyName ?? j.client?.name ?? ""])).entries())
              .filter(([, name]) => name)
              .sort((a, b) => a[1].localeCompare(b[1])),
    [jobs]
  );

  // Filtering
  const filtered = useMemo(() => jobs.filter((job) => {
    if (ownerScope === "mine" && currentUser && job.ownerId && job.ownerId !== currentUser.id) return false;
    if (statusFilter !== "all" && job.status !== statusFilter) return false;
    if (priorityFilter !== "all" && job.priority !== priorityFilter) return false;
    if (clientFilter !== "all" && job.clientId !== clientFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!job.title.toLowerCase().includes(q) && !(job.companyName ?? job.client?.name ?? "").toLowerCase().includes(q)) return false;
    }
    return true;
  }), [jobs, ownerScope, currentUser, statusFilter, priorityFilter, clientFilter, searchQuery]);

  // Total counts for the owner toggle label
  const myJobCount  = currentUser ? jobs.filter((j) => j.ownerId === currentUser.id).length : 0;
  const allJobCount = jobs.length;

  const statusCfg: Record<string, string> = {
    active:  "bg-emerald-100 text-emerald-700",
    on_hold: "bg-amber-100 text-amber-700",
    filled:  "bg-brand-100 text-brand-700",
    draft:   "bg-slate-100 text-slate-600",
    closed:  "bg-slate-100 text-slate-500",
  };

  const daysOpen = (createdAt: string) =>
    Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000);

  return (
    <div className="flex flex-col h-screen overflow-hidden">

      {/* ── Header ── */}
      <div className="shrink-0 border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">Sales</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {loading ? "Loading…" : `${filtered.length} open search${filtered.length !== 1 ? "es" : ""}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const cols = ["ID","Title","Client","Status","Priority","Owner","Location","Days Open","Est. Fee"];
                const rows = filtered.map((j) => [
                  j.id, j.title,
                  (j.companyName ?? j.client?.name ?? ""),
                  j.status ?? "", j.priority ?? "",
                  j.owner?.fullName ?? "",
                  j.location ?? "",
                  String(daysOpen(j.createdAt)),
                  String(j.estimatedFee ?? ""),
                ]);
                const csv = [cols, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
                const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
                const a = document.createElement("a"); a.href = url; a.download = `jobs-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
                URL.revokeObjectURL(url);
                toast.success(`Exported ${filtered.length} jobs`);
              }}
              disabled={filtered.length === 0}
              className="flex items-center gap-1.5 rounded-md border border-border bg-background px-3.5 py-1.5 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-40 transition-colors"
            >
              <Download className="h-4 w-4" />Export
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 rounded-md bg-brand-600 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
            >
              <Plus className="h-4 w-4" />New Search
            </button>
          </div>
        </div>

        {/* ── Filter row ── */}
        <div className="flex items-center gap-3 flex-wrap">

          {/* Owner scope — My Jobs / View All */}
          <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-1">
            <button
              onClick={() => setOwnerScope("mine")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors",
                ownerScope === "mine" ? "bg-brand-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <User className="h-3 w-3" />My Jobs
              {myJobCount > 0 && (
                <span className={cn(
                  "rounded-full px-1 text-[10px] font-bold",
                  ownerScope === "mine" ? "bg-brand-500 text-white" : "bg-muted text-muted-foreground"
                )}>{myJobCount}</span>
              )}
            </button>
            <button
              onClick={() => setOwnerScope("all")}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                ownerScope === "all" ? "bg-brand-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              View All
              {ownerScope === "all" && allJobCount > 0 && (
                <span className="ml-1 rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white">{allJobCount}</span>
              )}
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search…"
              className="w-44 rounded-lg border border-border bg-background py-1.5 pl-8 pr-3 text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-brand-500/50"
            />
          </div>

          {/* Status */}
          <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-1">
            {["all","active","on_hold","filled","draft"].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  statusFilter === s ? "bg-brand-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {s === "all" ? "All" : s === "on_hold" ? "On Hold" : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          {/* Priority */}
          <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-1">
            {["all","urgent","high","medium","low"].map((p) => (
              <button
                key={p}
                onClick={() => setPriorityFilter(p)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors capitalize",
                  priorityFilter === p ? "bg-brand-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {p === "all" ? "Priority" : p}
              </button>
            ))}
          </div>

          {/* Company filter */}
          {activeClients.length > 1 && (
            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              className="rounded-lg border border-border bg-background py-1.5 pl-3 pr-7 text-xs text-foreground outline-none focus:ring-2 focus:ring-brand-500/50 appearance-none cursor-pointer"
            >
              <option value="all">All Companies</option>
              {activeClients.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Modal */}
      {showAddModal && (
        <AddJobModal
          onClose={() => setShowAddModal(false)}
          onAdd={async (data: NewJobInput) => {
            await addJob(data);
            setShowAddModal(false);
            toast.success("Job created");
          }}
        />
      )}

      {/* ── Content ── */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-52 rounded-xl border border-border bg-card animate-pulse" />
            ))}
          </div>
        ) : jobs.length === 0 ? (
          /* ── True empty: no jobs exist at all ── */
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 mb-4">
              <Briefcase className="h-7 w-7 text-brand-500" />
            </div>
            <h3 className="text-base font-semibold text-foreground">No searches yet</h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-xs">
              Add your first search to start tracking candidates and fee potential.
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="mt-5 flex items-center gap-1.5 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
            >
              <Plus className="h-4 w-4" />New Search
            </button>
          </div>
        ) : filtered.length === 0 ? (
          /* ── Filtered empty: jobs exist but none match ── */
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Briefcase className="mb-3 h-10 w-10 text-muted-foreground/30" />
            <h3 className="text-base font-semibold text-foreground">No matches</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {ownerScope === "mine"
                ? "No jobs assigned to you — try View All to see the full board."
                : "Try adjusting your filters or search term."}
            </p>
            {ownerScope === "mine" && (
              <button
                onClick={() => setOwnerScope("all")}
                className="mt-4 text-xs font-semibold text-brand-600 hover:text-brand-700 underline"
              >
                View All Jobs
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((job) => {
              const appCount     = job.candidateCount ?? 0;
              const placedCount  = placedByJobId[job.id] ?? 0;
              const days         = daysOpen(job.createdAt);
              const ageClass     = days > 60 ? "text-red-500" : days > 30 ? "text-amber-600" : "text-muted-foreground";
              const overdueCount = breachByJob[job.id] ?? 0;
              const healthData   = healthByJobId[job.id];

              return (
                <div key={job.id} className="flex flex-col rounded-xl border border-border bg-card hover:shadow-md hover:border-brand-200/60 transition-all">

                  {/* Card header */}
                  <div className="p-4 border-b border-border">
                    <div className="flex items-start justify-between gap-2 mb-2.5">
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", statusCfg[job.status] ?? statusCfg.draft)}>
                        {job.status === "on_hold" ? "On Hold" : job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                      </span>
                      <div className="flex items-center gap-1">
                        {healthData && job.status === "active" && (
                          <PipelineHealthBadge score={healthData.score} tier={healthData.tier} />
                        )}
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize", JOB_PRIORITY_COLORS[job.priority])}>
                          {job.priority}
                        </span>
                      </div>
                    </div>
                    <h3 className="text-sm font-bold text-foreground leading-snug">{job.title}</h3>
                    <div className="mt-2 flex items-center gap-2">
                      <div className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded text-[9px] font-bold text-white", generateAvatarColor(job.clientId))}>
                        {getInitials(job.client?.name ?? "")}
                      </div>
                      <span className="text-xs text-muted-foreground truncate">{job.companyName ?? job.client?.name}</span>
                    </div>
                  </div>

                  {/* Card meta */}
                  <div className="flex-1 space-y-1.5 p-4">
                    {job.location && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />{job.location}
                      </div>
                    )}
                    {job.salaryMax && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <DollarSign className="h-3.5 w-3.5 shrink-0" />
                        {job.salaryMin ? `${formatSalary(job.salaryMin,"USD",true)} – ` : "Up to "}
                        {formatSalary(job.salaryMax,"USD",true)}
                      </div>
                    )}
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Users className="h-3.5 w-3.5" />{appCount} in pipeline
                      </span>
                      <span className={cn("flex items-center gap-1.5", ageClass)}>
                        <Calendar className="h-3.5 w-3.5" />{days}d open
                      </span>
                    </div>
                    {job.owner && ownerScope === "all" && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <User className="h-3.5 w-3.5 shrink-0" />
                        {job.owner.fullName}
                      </div>
                    )}
                    {overdueCount > 0 && (
                      <div className="flex items-center gap-1 text-[10px] font-medium text-red-600">
                        <AlertTriangle className="h-3 w-3" />{overdueCount} overdue
                      </div>
                    )}
                    {job.estimatedFee && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <TrendingUp className="h-3.5 w-3.5 shrink-0" />
                        Est. {formatSalary(job.estimatedFee,"USD",true)}
                        {job.feeProbability && ` · ${job.feeProbability}%`}
                      </div>
                    )}

                    {/* Fill bar */}
                    <div className="pt-1">
                      <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                        <div
                          className="h-full rounded-full bg-brand-500 transition-all duration-500"
                          style={{ width: appCount > 0 ? `${Math.round((placedCount / appCount) * 100)}%` : "0%" }}
                        />
                      </div>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {placedCount} placed · {appCount} in pipeline
                      </p>
                    </div>
                  </div>

                  {/* Action */}
                  <div className="border-t border-border p-3">
                    <Link
                      href={`/jobs/${job.id}`}
                      className="flex w-full items-center justify-center gap-1.5 rounded-md border border-brand-200 bg-brand-50 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100 transition-colors"
                    >
                      <Eye className="h-3.5 w-3.5" />View Pipeline
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
