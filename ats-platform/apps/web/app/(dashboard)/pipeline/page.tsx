"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Users, Briefcase, LayoutGrid, List,
  ChevronRight, TrendingUp, ArrowUpDown, User,
} from "lucide-react";
import { useJobs, useCurrentUser } from "@/lib/supabase/hooks";
import { cn, generateAvatarColor, getInitials, JOB_PRIORITY_COLORS } from "@/lib/utils";
import type { Job } from "@/types";

type PipelineScope = "mine" | "team";

type GroupBy   = "recruiter" | "client" | "priority";
type ViewMode  = "card" | "table";
type SortField = "title" | "client" | "priority" | "candidates" | "daysOpen";

const STATUS_ORDER = ["identified", "screened", "submitted", "client_review", "interview_scheduled", "offer", "placed"] as const;

const STAGE_COLORS: Record<string, string> = {
  identified:          "bg-slate-300",
  screened:            "bg-brand-400",
  submitted:           "bg-violet-500",
  client_review:       "bg-purple-500",
  interview_scheduled: "bg-emerald-500",
  offer:               "bg-cyan-500",
  placed:              "bg-teal-600",
};

function MiniPipelineBar({ count }: { count: number }) {
  // Simplified bar — shows candidate volume across pipeline
  const filled = Math.min(count, STATUS_ORDER.length);
  return (
    <div className="flex items-end gap-0.5 h-6">
      {STATUS_ORDER.map((status, i) => (
        <div
          key={status}
          title={status}
          className={cn("flex-1 rounded-sm transition-all", STAGE_COLORS[status], i >= filled && "opacity-20")}
          style={{ height: i < filled ? "100%" : "30%" }}
        />
      ))}
    </div>
  );
}

function JobCard({ job }: { job: Job & { companyName?: string; candidateCount?: number } }) {
  const count    = job.candidateCount ?? 0;
  const daysOpen = Math.floor((Date.now() - new Date(job.createdAt).getTime()) / 86_400_000);
  const ageClass = daysOpen > 60 ? "text-red-500" : daysOpen > 30 ? "text-amber-600" : "text-muted-foreground";

  return (
    <Link
      href={`/pipeline/${job.id}`}
      className="flex flex-col rounded-xl border border-border bg-card p-4 hover:shadow-md hover:border-brand-200 transition-all group"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground group-hover:text-brand-600 transition-colors leading-snug">{job.title}</p>
          <div className="mt-1 flex items-center gap-1.5">
            <div className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded text-[9px] font-bold text-white", generateAvatarColor(job.clientId))}>
              {getInitials(job.client?.name ?? "")}
            </div>
            <p className="text-[10px] text-muted-foreground truncate">{job.companyName ?? job.client?.name}</p>
          </div>
        </div>
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", JOB_PRIORITY_COLORS[job.priority])}>
          {job.priority}
        </span>
      </div>

      {/* Mini bar */}
      <MiniPipelineBar count={count} />

      {/* Stats */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="text-center">
          <p className="text-xs font-bold text-foreground">{count}</p>
          <p className="text-[9px] text-muted-foreground">candidates</p>
        </div>
        <div className="text-center">
          <p className="text-xs font-bold text-foreground">{job.headcount ?? 1}</p>
          <p className="text-[9px] text-muted-foreground">headcount</p>
        </div>
        <div className="text-center">
          <p className={cn("text-xs font-bold", ageClass)}>{daysOpen}d</p>
          <p className="text-[9px] text-muted-foreground">open</p>
        </div>
      </div>
    </Link>
  );
}

// ─── Table view ───────────────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<string, number> = { exclusive: 0, high: 1, medium: 2, low: 3 };

function JobTableRow({ job }: { job: Job & { companyName?: string; candidateCount?: number } }) {
  const count    = job.candidateCount ?? 0;
  const daysOpen = Math.floor((Date.now() - new Date(job.createdAt).getTime()) / 86_400_000);
  const ageClass = daysOpen > 60 ? "text-red-500 font-semibold" : daysOpen > 30 ? "text-amber-600 font-semibold" : "text-muted-foreground";
  return (
    <tr className="group border-b border-border hover:bg-accent/40 transition-colors">
      <td className="py-2.5 pl-4 pr-2">
        <Link href={`/pipeline/${job.id}`} className="font-medium text-sm text-foreground group-hover:text-brand-600 transition-colors">
          {job.title}
        </Link>
      </td>
      <td className="py-2.5 px-2">
        <div className="flex items-center gap-1.5">
          <div className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded text-[9px] font-bold text-white", generateAvatarColor(job.clientId))}>
            {getInitials(job.companyName ?? job.client?.name ?? "")}
          </div>
          <span className="text-xs text-muted-foreground truncate max-w-[140px]">{job.companyName ?? job.client?.name ?? "—"}</span>
        </div>
      </td>
      <td className="py-2.5 px-2">
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", JOB_PRIORITY_COLORS[job.priority])}>
          {job.priority}
        </span>
      </td>
      <td className="py-2.5 px-2 text-center">
        <span className="text-sm font-bold text-foreground">{count}</span>
      </td>
      <td className="py-2.5 px-2 text-center">
        <span className="text-xs font-semibold text-foreground">{job.headcount ?? 1}</span>
      </td>
      <td className="py-2.5 px-2 text-center">
        <span className={cn("text-xs", ageClass)}>{daysOpen}d</span>
      </td>
      <td className="py-2.5 pl-2 pr-4">
        <span className={cn(
          "rounded-full px-2 py-0.5 text-[10px] font-semibold",
          job.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"
        )}>
          {job.status}
        </span>
      </td>
    </tr>
  );
}

function JobTable({ jobs }: { jobs: (Job & { companyName?: string; candidateCount?: number })[] }) {
  const [sortField, setSortField] = useState<SortField>("daysOpen");
  const [sortAsc,   setSortAsc]   = useState(false);

  function toggleSort(f: SortField) {
    if (sortField === f) setSortAsc((a) => !a);
    else { setSortField(f); setSortAsc(false); }
  }

  const sorted = [...jobs].sort((a, b) => {
    let cmp = 0;
    if (sortField === "title")      cmp = a.title.localeCompare(b.title);
    if (sortField === "client")     cmp = (a.companyName ?? "").localeCompare(b.companyName ?? "");
    if (sortField === "priority")   cmp = (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9);
    if (sortField === "candidates") cmp = (a.candidateCount ?? 0) - (b.candidateCount ?? 0);
    if (sortField === "daysOpen") {
      const ageA = Date.now() - new Date(a.createdAt).getTime();
      const ageB = Date.now() - new Date(b.createdAt).getTime();
      cmp = ageA - ageB;
    }
    return sortAsc ? cmp : -cmp;
  });

  function Th({ field, label, center }: { field: SortField; label: string; center?: boolean }) {
    const active = sortField === field;
    return (
      <th
        className={cn("px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap", center && "text-center")}
        onClick={() => toggleSort(field)}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          <ArrowUpDown className={cn("h-3 w-3", active ? "text-brand-600" : "opacity-30")} />
        </span>
      </th>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-muted/40">
          <tr>
            <Th field="title"      label="Job title" />
            <Th field="client"     label="Client" />
            <Th field="priority"   label="Priority" />
            <Th field="candidates" label="Candidates" center />
            <th className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Headcount</th>
            <Th field="daysOpen"   label="Age" center />
            <th className="pl-2 pr-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((job) => <JobTableRow key={job.id} job={job} />)}
        </tbody>
      </table>
    </div>
  );
}

export default function PipelinePage() {
  const { jobs, loading }       = useJobs();
  const { user: currentUser }   = useCurrentUser();
  const [pipelineScope, setPipelineScope] = useState<PipelineScope>("mine");
  const [groupBy,  setGroupBy]  = useState<GroupBy>("recruiter");
  const [viewMode, setViewMode] = useState<ViewMode>("card");

  // Scope filter: mine = my searches, team = everyone
  const scopedJobs = pipelineScope === "mine" && currentUser
    ? jobs.filter((j) => j.status === "active" && (j.ownerId === currentUser.id || !j.ownerId))
    : jobs.filter((j) => j.status === "active");

  // Compute grouped jobs from scoped set
  const groups = (() => {
    const map: Record<string, { label: string; avatarId?: string; jobs: typeof scopedJobs }> = {};
    scopedJobs.forEach((job) => {
      let key: string;
      let label: string;
      let avatarId: string | undefined;

      if (groupBy === "recruiter") {
        key      = job.ownerId ?? "unassigned";
        label    = job.owner?.fullName ?? "Unassigned";
        avatarId = job.ownerId;
      } else if (groupBy === "client") {
        key      = job.clientId ?? "unknown";
        label    = job.companyName ?? job.client?.name ?? "Unknown Client";
        avatarId = job.clientId;
      } else {
        key   = job.priority;
        label = job.priority.charAt(0).toUpperCase() + job.priority.slice(1) + " Priority";
      }

      if (!map[key]) map[key] = { label, avatarId, jobs: [] };
      map[key].jobs.push(job);
    });
    return map;
  })();

  // KPIs derived from scoped set
  const totalCandidates = scopedJobs.reduce((s, j) => s + (j.candidateCount ?? 0), 0);
  const urgentJobs      = scopedJobs.filter((j) => j.priority === "urgent" || j.priority === "high").length;
  const myJobCount      = currentUser ? jobs.filter((j) => j.status === "active" && j.ownerId === currentUser.id).length : 0;
  const teamJobCount    = jobs.filter((j) => j.status === "active").length;

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* ── Header ── */}
      <div className="shrink-0 border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">Talent Pipeline</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {loading ? "Loading…" : `${scopedJobs.length} active search${scopedJobs.length !== 1 ? "es" : ""} · ${totalCandidates} candidates in play`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* My Pipeline / Full Team scope */}
            <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-1">
              <button
                onClick={() => setPipelineScope("mine")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors",
                  pipelineScope === "mine" ? "bg-brand-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <User className="h-3 w-3" />My Pipeline
                {myJobCount > 0 && (
                  <span className={cn("rounded-full px-1 text-[10px] font-bold",
                    pipelineScope === "mine" ? "bg-brand-500 text-white" : "bg-muted text-muted-foreground"
                  )}>{myJobCount}</span>
                )}
              </button>
              <button
                onClick={() => setPipelineScope("team")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors",
                  pipelineScope === "team" ? "bg-brand-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Users className="h-3 w-3" />Full Team
                {pipelineScope === "team" && teamJobCount > 0 && (
                  <span className="rounded-full bg-brand-500 px-1 text-[10px] font-bold text-white">{teamJobCount}</span>
                )}
              </button>
            </div>

            {/* View mode */}
            <div className="flex items-center gap-0.5 rounded-lg border border-border bg-background p-1">
              <button
                onClick={() => setViewMode("card")}
                className={cn("rounded-md p-1.5 transition-colors", viewMode === "card" ? "bg-brand-600 text-white" : "text-muted-foreground hover:text-foreground")}
                title="Card view"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setViewMode("table")}
                className={cn("rounded-md p-1.5 transition-colors", viewMode === "table" ? "bg-brand-600 text-white" : "text-muted-foreground hover:text-foreground")}
                title="Table view"
              >
                <List className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Group toggle (card mode only) */}
            {viewMode === "card" && (
              <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-1">
                {(["recruiter", "client", "priority"] as const).map((g) => (
                  <button
                    key={g}
                    onClick={() => setGroupBy(g)}
                    className={cn(
                      "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                      groupBy === g ? "bg-brand-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {g === "recruiter" ? "Recruiter" : g === "client" ? "Client" : "Priority"}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* KPI strip */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-sm">
            <Briefcase className="h-4 w-4 text-brand-500" />
            <span className="font-bold text-foreground">{loading ? "…" : scopedJobs.length}</span>
            <span className="text-muted-foreground">active searches</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Users className="h-4 w-4 text-emerald-500" />
            <span className="font-bold text-foreground">{loading ? "…" : totalCandidates}</span>
            <span className="text-muted-foreground">candidates in play</span>
          </div>
          {urgentJobs > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <TrendingUp className="h-4 w-4 text-red-500" />
              <span className="font-bold text-red-600">{urgentJobs}</span>
              <span className="text-muted-foreground">urgent searches</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Table view ── */}
      {viewMode === "table" && (
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-24 text-muted-foreground text-sm">Loading…</div>
          ) : scopedJobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <Briefcase className="mb-3 h-10 w-10 text-muted-foreground/30" />
              <h3 className="text-base font-semibold text-foreground">No active searches</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {pipelineScope === "mine" ? "You have no active searches assigned." : "No active searches in the team."}
              </p>
              {pipelineScope === "mine" && (
                <button onClick={() => setPipelineScope("team")} className="mt-4 text-xs font-semibold text-brand-600 hover:underline">
                  View Full Team Pipeline
                </button>
              )}
            </div>
          ) : (
            <JobTable jobs={scopedJobs} />
          )}
        </div>
      )}

      {/* ── Card / grouped view ── */}
      {viewMode === "card" && (
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-40 rounded-xl border border-border bg-card animate-pulse" />
              ))}
            </div>
          ) : scopedJobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 mb-4">
                <Briefcase className="h-7 w-7 text-brand-500" />
              </div>
              <h3 className="text-base font-semibold text-foreground">
                {pipelineScope === "mine" ? "No searches in your pipeline" : "No active team searches"}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground max-w-xs">
                {pipelineScope === "mine"
                  ? "Searches assigned to you will appear here."
                  : "Create a search to start tracking candidates."}
              </p>
              {pipelineScope === "mine" && (
                <button onClick={() => setPipelineScope("team")} className="mt-4 text-xs font-semibold text-brand-600 hover:underline">
                  View Full Team
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-8">
              {Object.entries(groups).map(([key, group]) => (
                <div key={key}>
                  <div className="flex items-center gap-3 mb-4">
                    {group.avatarId && (
                      <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white", generateAvatarColor(group.avatarId))}>
                        {getInitials(group.label)}
                      </div>
                    )}
                    <h2 className="text-sm font-bold text-foreground">{group.label}</h2>
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      {group.jobs.length} search{group.jobs.length !== 1 ? "es" : ""}
                    </span>
                    <Link
                      href={groupBy === "recruiter" ? "/analytics?tab=recruiters" : groupBy === "client" ? "/clients" : "/jobs"}
                      className="ml-auto flex items-center gap-1 text-[10px] font-medium text-brand-600 hover:underline"
                    >
                      Details<ChevronRight className="h-3 w-3" />
                    </Link>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {group.jobs.map((job) => (
                      <JobCard key={job.id} job={job} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
