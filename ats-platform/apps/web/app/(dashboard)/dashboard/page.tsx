"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  Users,
  Briefcase,
  Calendar,
  TrendingUp,
  ArrowRight,
  Mail,
  ClipboardList,
  BadgeCheck,
  Clock,
  Star,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  FileSignature,
  Zap,
  Building2,
  BarChart2,
  Loader2,
  Phone,
  Send,
  UserCheck,
  StickyNote,
} from "lucide-react";
import { cn, formatSalary, getInitials, generateAvatarColor, formatRelativeTime } from "@/lib/utils";
import {
  useJobs, useCandidates, useCompanies, useCurrentUser, useRecentActivities, useSLABreaches,
  useScheduledInterviews, useOfferLetters, useOutreachSequences,
} from "@/lib/supabase/hooks";
import type { ScheduledInterview as DBScheduledInterview } from "@/lib/supabase/hooks";
import type { Job } from "@/types";
import type { ActivityActionType, ActivityRecord } from "@/lib/supabase/hooks";
import { PipelineHealthPanel } from "@/components/pipeline/pipeline-health-badge";
import { PlacementAnniversariesCard } from "@/components/alerts/placement-anniversaries-card"; // US-231

// ─── Activity action → display config ────────────────────────────────────────

const ACTION_CONFIG: Record<ActivityActionType, { icon: React.ElementType; color: string; dot: string }> = {
  note:            { icon: StickyNote,    color: "text-amber-600",   dot: "bg-amber-500"   },
  call:            { icon: Phone,         color: "text-green-600",   dot: "bg-green-500"   },
  email:           { icon: Mail,          color: "text-brand-600",    dot: "bg-brand-500"    },
  submission:      { icon: Send,          color: "text-violet-600",  dot: "bg-violet-500"  },
  stage_change:    { icon: ArrowRight,    color: "text-amber-600",   dot: "bg-amber-500"   },
  placement:       { icon: UserCheck,     color: "text-emerald-600", dot: "bg-emerald-500" },
  client_feedback: { icon: Star,          color: "text-amber-600",   dot: "bg-amber-500"   },
  task_created:    { icon: ClipboardList, color: "text-slate-500",   dot: "bg-slate-400"   },
  task_completed:  { icon: BadgeCheck,    color: "text-emerald-600", dot: "bg-emerald-500" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STAGE_COLORS: Record<string, string> = {
  sourced:       "bg-slate-400",
  screened:      "bg-brand-500",
  submitted:     "bg-violet-500",
  client_review: "bg-amber-500",
  interview:     "bg-emerald-500",
  offer:         "bg-cyan-500",
  placed:        "bg-teal-500",
  rejected:      "bg-red-400",
  custom:        "bg-slate-400",
};

const PRIORITY_DOT: Record<string, string> = {
  urgent: "bg-red-500",
  high:   "bg-orange-500",
  medium: "bg-amber-500",
  low:    "bg-slate-400",
};

function greetingPrefix(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function todayLabel(): string {
  return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon: Icon, color, bg, href,
}: {
  label: string; value: string | number; sub: string;
  icon: React.ElementType; color: string; bg: string; href: string;
}) {
  return (
    <Link href={href} className="group rounded-xl border border-border bg-card p-4 hover:shadow-md transition-all">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted-foreground">{label}</span>
        <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg", bg)}>
          <Icon className={cn("h-3.5 w-3.5", color)} />
        </div>
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>
    </Link>
  );
}

function SectionHeader({ title, href, count }: { title: string; href?: string; count?: number }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {count !== undefined && (
          <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold text-brand-700 leading-none">
            {count}
          </span>
        )}
      </div>
      {href && (
        <Link href={href} className="flex items-center gap-0.5 text-[11px] font-medium text-brand-600 hover:text-brand-700 transition-colors">
          View all <ChevronRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}

// ─── Pipeline health card ─────────────────────────────────────────────────────

type JobWithMeta = Job & {
  companyName?: string;
  candidateCount?: number;
  companyId?: string;
  healthScore?: number;        // 0-100
  overdueCount?: number;
};

// Compute a 0-100 health score for a job
function computeHealthScore(job: JobWithMeta, overdueCount: number): number {
  let score = 100;
  const daysOpen = job.createdAt
    ? Math.floor((Date.now() - new Date(job.createdAt).getTime()) / 86_400_000)
    : 0;
  // Penalty for aging reqs
  if (daysOpen > 60) score -= 30;
  else if (daysOpen > 30) score -= 15;
  // Penalty for empty pipeline
  if ((job.candidateCount ?? 0) === 0) score -= 25;
  else if ((job.candidateCount ?? 0) < 3) score -= 10;
  // Penalty per SLA breach (max 30)
  score -= Math.min(overdueCount * 10, 30);
  return Math.max(0, score);
}

const HEALTH_CONFIG = {
  green: { label: "On track",  bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500",  border: "border-emerald-200" },
  amber: { label: "At risk",   bg: "bg-amber-50",   text: "text-amber-700",   dot: "bg-amber-500",    border: "border-amber-200"   },
  red:   { label: "Critical",  bg: "bg-red-50",     text: "text-red-700",     dot: "bg-red-500",      border: "border-red-200"     },
} as const;

function healthTier(score: number): keyof typeof HEALTH_CONFIG {
  if (score >= 70) return "green";
  if (score >= 40) return "amber";
  return "red";
}

function JobHealthCard({ job }: { job: JobWithMeta }) {
  const total   = job.candidateCount ?? 0;
  const score   = job.healthScore ?? 100;
  const tier    = healthTier(score);
  const hcfg    = HEALTH_CONFIG[tier];
  const overdue = job.overdueCount ?? 0;

  return (
    <Link
      href={`/jobs/${job.id}`}
      className="group rounded-xl border border-border bg-card p-4 hover:shadow-md transition-all"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", PRIORITY_DOT[job.priority ?? "medium"])} />
            <p className="text-xs font-semibold text-foreground truncate">{job.title}</p>
          </div>
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Building2 className="h-3 w-3 shrink-0" />
            {job.companyName ?? job.client?.name ?? "—"} · {job.location ?? "—"}
          </p>
        </div>
        {/* Health badge */}
        <span className={cn("shrink-0 flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold border", hcfg.bg, hcfg.text, hcfg.border)}>
          <span className={cn("h-1.5 w-1.5 rounded-full", hcfg.dot)} />
          {hcfg.label}
        </span>
      </div>

      {/* Progress bar */}
      {total > 0 ? (
        <div className="flex h-1.5 w-full rounded-full overflow-hidden gap-px mb-2">
          <div className={cn("rounded-full transition-all", STAGE_COLORS.screened)} style={{ width: "100%" }} title={`${total} in pipeline`} />
        </div>
      ) : (
        <div className="h-1.5 w-full rounded-full bg-border mb-2" />
      )}

      {/* Stat pills */}
      <div className="flex items-center gap-2 flex-wrap">
        {total > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">
            <span className="h-1 w-1 rounded-full bg-brand-500" />
            {total} in pipeline
          </span>
        )}
        {overdue > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
            <AlertTriangle className="h-2.5 w-2.5" />
            {overdue} overdue
          </span>
        )}
        {job.estimatedFee && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground ml-auto">
            <TrendingUp className="h-3 w-3" />
            {formatSalary(job.estimatedFee, "USD", true)} est.
          </span>
        )}
      </div>
    </Link>
  );
}

// ─── Activity feed item ───────────────────────────────────────────────────────

function ActivityItem({ item }: { item: ActivityRecord }) {
  const cfg  = ACTION_CONFIG[item.action] ?? ACTION_CONFIG.note;
  const Icon = cfg.icon;
  // Derive a dot bg with opacity-10 feel: swap "500" → "100"
  const dotBg = cfg.dot.replace("500", "100").replace("400", "100");
  return (
    <div className="flex items-start gap-2.5 py-2.5 border-b border-border last:border-0">
      <div className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full", dotBg)}>
        <Icon className={cn("h-3 w-3", cfg.color)} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground leading-snug">{item.summary}</p>
        {item.actorName && item.actorName !== "System" && (
          <p className="text-[10px] text-muted-foreground mt-0.5">by {item.actorName}</p>
        )}
      </div>
      <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">{formatRelativeTime(item.createdAt)}</span>
    </div>
  );
}

// ─── Focus card ───────────────────────────────────────────────────────────────

function FocusCard({
  icon: Icon, label, count, sub, href, color, bg, ring,
}: {
  icon: React.ElementType; label: string; count: number;
  sub: string; href: string; color: string; bg: string; ring: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-xl border px-4 py-3 transition-all hover:shadow-sm",
        ring, bg
      )}
    >
      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-card/60")}>
        <Icon className={cn("h-4 w-4", color)} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm font-bold", color)}>{count}</p>
        <p className={cn("text-[11px] font-medium", color)}>{label}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>
      </div>
      <ChevronRight className={cn("h-3.5 w-3.5 shrink-0", color)} />
    </Link>
  );
}

// ─── Interview schedule card ──────────────────────────────────────────────────

// US-315: all hardcoded interview / KPI mocks removed. Values now come from
// useScheduledInterviews, useOfferLetters, and useOutreachSequences below.

type DashboardInterview = DBScheduledInterview;

function durationMinutes(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return 0;
  return (eh * 60 + em) - (sh * 60 + sm);
}

function InterviewCard({ interview }: { interview: DashboardInterview }) {
  const fmtColor =
    interview.format === "video"  ? "bg-brand-100 text-brand-700"  :
    interview.format === "onsite" ? "bg-violet-100 text-violet-700" :
                                    "bg-slate-100 text-slate-600";
  const mins = durationMinutes(interview.startTime, interview.endTime);
  // HH:MM:SS → HH:MM
  const displayTime = interview.startTime.slice(0, 5);
  return (
    <Link
      href={`/candidates/${interview.candidateId}`}
      className="flex items-center gap-3 rounded-lg border border-border bg-background p-3 hover:bg-accent/40 transition-colors group"
    >
      <div className="text-center shrink-0 w-12">
        <p className="text-sm font-bold text-foreground">{displayTime}</p>
        <p className="text-[10px] text-muted-foreground">{mins}m</p>
      </div>
      <div className={cn("w-px h-8 rounded-full shrink-0", "bg-border")} />
      <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white", generateAvatarColor(interview.candidateName))}>
        {getInitials(interview.candidateName)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-foreground truncate">{interview.candidateName}</p>
        <p className="text-[10px] text-muted-foreground truncate">{interview.jobTitle}{interview.clientName ? ` · ${interview.clientName}` : ""}</p>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-semibold", fmtColor)}>
          {interview.format}
        </span>
      </div>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user: currentUser } = useCurrentUser();
  const { jobs, loading: jobsLoading } = useJobs();
  const { candidates, loading: candsLoading } = useCandidates();
  const { companies, loading: companiesLoading } = useCompanies();
  const { activities: recentActivities, loading: activitiesLoading } = useRecentActivities(15);
  const { breaches, count: slaBreachCount } = useSLABreaches();
  const { interviews: allInterviews } = useScheduledInterviews();
  const { offers } = useOfferLetters();
  const { sequences: outreachSequences } = useOutreachSequences();

  // US-315: derive real KPI values
  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);
  const weekRange = useMemo(() => {
    const d = new Date();
    const day = d.getDay(); // 0 = Sun
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((day + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const fmt = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
    return { start: fmt(monday), end: fmt(sunday) };
  }, []);
  const todayInterviews = useMemo(
    () => allInterviews.filter((i) => i.date === today && i.status === "scheduled"),
    [allInterviews, today]
  );
  const weekInterviewCount = useMemo(
    () => allInterviews.filter(
      (i) => i.status === "scheduled" && i.date >= weekRange.start && i.date <= weekRange.end
    ).length,
    [allInterviews, weekRange.start, weekRange.end]
  );
  // "In flight" = sent but not yet accepted/declined/expired
  const offersInFlight = useMemo(
    () => offers.filter((o) => o.status === "sent" || o.status === "pending_approval" || o.status === "approved").length,
    [offers]
  );
  // Outreach pending = active-sequence messages sent but not yet replied
  const outreachPending = useMemo(
    () => outreachSequences
      .filter((s) => s.status === "active")
      .reduce((sum, s) => sum + Math.max(0, (s.sent ?? 0) - (s.replied ?? 0)), 0),
    [outreachSequences]
  );

  const loading = jobsLoading || candsLoading || companiesLoading;

  // Build a map from companyId → companyName for the client health grid
  const companyMap = useMemo(() => {
    const m: Record<string, { name: string; id: string }> = {};
    companies.forEach((c) => { m[c.id] = { name: c.name, id: c.id }; });
    return m;
  }, [companies]);

  const activeJobs = useMemo(
    () => (jobs as JobWithMeta[]).filter((j) => j.status === "active"),
    [jobs]
  );

  const activeCands = useMemo(
    () => candidates.filter((c) => c.status === "active" || c.status === "passive"),
    [candidates]
  );

  // Build breach count per job for health scoring
  const breachCountByJob = useMemo(() => {
    const m: Record<string, number> = {};
    breaches.forEach((b) => { m[b.jobId] = (m[b.jobId] ?? 0) + 1; });
    return m;
  }, [breaches]);

  // Enrich jobs with company name + health score
  const enrichedJobs: JobWithMeta[] = useMemo(
    () => activeJobs.map((j) => {
      const overdueCount = breachCountByJob[j.id] ?? 0;
      const base = { ...j, companyId: j.clientId, companyName: j.clientId ? companyMap[j.clientId]?.name : j.client?.name, overdueCount };
      return { ...base, healthScore: computeHealthScore(base, overdueCount) };
    }),
    [activeJobs, companyMap, breachCountByJob]
  );

  const kpis = useMemo(() => {
    const highPriority = activeJobs.filter((j) => j.priority === "urgent" || j.priority === "high").length;
    const pipelineValue = activeJobs.reduce(
      (s, j) => s + (j.estimatedFee ?? 0) * ((j.feeProbability ?? 50) / 100),
      0
    );
    // Quick stats derived from real data
    const placements = recentActivities.filter((a) => a.action === "placement").length;
    const submissions = recentActivities.filter((a) => a.action === "submission").length;
    return { highPriority, pipelineValue, placements, submissions };
  }, [activeJobs, recentActivities]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen overflow-auto bg-background">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-border bg-card px-6 py-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <Zap className="h-4 w-4 text-brand-600" />
              <h1 className="text-xl font-bold text-foreground">
                {greetingPrefix()}, {currentUser?.firstName ?? "there"}
              </h1>
            </div>
            <p className="text-xs text-muted-foreground">{todayLabel()}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/candidates"
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
            >
              <Users className="h-3.5 w-3.5" />
              Add Candidate
            </Link>
            <Link
              href="/jobs"
              className="flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
            >
              <Briefcase className="h-3.5 w-3.5" />
              New Search
            </Link>
          </div>
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <div className="flex-1 p-6 space-y-6 max-w-[1400px] w-full mx-auto">

        {/* KPI strip */}
        <div className="grid grid-cols-4 gap-4">
          <KpiCard
            label="Active Candidates"
            value={activeCands.length}
            sub={`${activeCands.length} in your pipeline`}
            icon={Users}
            color="text-brand-600"
            bg="bg-brand-50"
            href="/candidates"
          />
          <KpiCard
            label="Open Searches"
            value={activeJobs.length}
            sub={`${kpis.highPriority} high priority`}
            icon={Briefcase}
            color="text-violet-600"
            bg="bg-violet-50"
            href="/jobs"
          />
          <KpiCard
            label="Interviews This Week"
            value={weekInterviewCount}
            sub={`${todayInterviews.length} scheduled today`}
            icon={Calendar}
            color="text-emerald-600"
            bg="bg-emerald-50"
            href="/pipeline"
          />
          <KpiCard
            label="Pipeline Value"
            value={formatSalary(kpis.pipelineValue, "USD", true)}
            sub="Probability-weighted fees"
            icon={TrendingUp}
            color="text-teal-600"
            bg="bg-teal-50"
            href="/placements"
          />
        </div>

        {/* Today's focus row */}
        <div>
          <SectionHeader title="Today's Focus" />
          <div className="grid grid-cols-4 gap-3">
            <FocusCard
              icon={Calendar}
              label="Interviews Today"
              count={todayInterviews.length}
              sub={`Next: ${todayInterviews[0]?.candidateName ?? "—"} at ${todayInterviews[0]?.startTime?.slice(0, 5) ?? "—"}`}
              href="/pipeline"
              color="text-emerald-700"
              bg="bg-emerald-50"
              ring="border-emerald-200"
            />
            <FocusCard
              icon={Mail}
              label="Outreach Pending"
              count={outreachPending}
              sub="Replies awaiting follow-up"
              href="/outreach"
              color="text-brand-700"
              bg="bg-brand-50"
              ring="border-brand-200"
            />
            <FocusCard
              icon={FileSignature}
              label="Offers in Flight"
              count={offersInFlight}
              sub="Awaiting candidate response"
              href="/placements"
              color="text-cyan-700"
              bg="bg-cyan-50"
              ring="border-cyan-200"
            />
            <FocusCard
              icon={AlertTriangle}
              label="SLA Breaches"
              count={slaBreachCount}
              sub="Candidates overdue for action"
              href="/pipeline"
              color="text-amber-700"
              bg="bg-amber-50"
              ring="border-amber-200"
            />
          </div>
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-[1fr_360px] gap-6">

          {/* Left column */}
          <div className="space-y-6">

            {/* At-risk alert banner */}
            {breaches.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                  <p className="text-xs font-semibold text-amber-800">
                    {breaches.length} candidate{breaches.length !== 1 ? "s" : ""} overdue for action
                  </p>
                </div>
                <div className="space-y-1.5">
                  {breaches.slice(0, 5).map((b) => (
                    <Link
                      key={b.entryId}
                      href={`/candidates/${b.candidateId}`}
                      className="flex items-center justify-between rounded-lg bg-card/70 px-3 py-1.5 hover:bg-card transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-medium text-foreground truncate">{b.candidateName}</span>
                        <span className="text-[10px] text-muted-foreground truncate">· {b.jobTitle}</span>
                      </div>
                      <span className="shrink-0 ml-2 text-[10px] font-semibold text-red-600">
                        {b.daysOverdue}d overdue
                      </span>
                    </Link>
                  ))}
                  {breaches.length > 5 && (
                    <p className="text-[10px] text-amber-700 text-center pt-0.5">
                      +{breaches.length - 5} more — <Link href="/pipeline" className="underline">view all</Link>
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* At-risk requisitions (from usePipelineHealth) */}
            <PipelineHealthPanel />

            {/* US-231: Placement anniversaries & backfill alerts */}
            <PlacementAnniversariesCard limit={5} />

            {/* Pipeline health */}
            <div className="rounded-xl border border-border bg-card p-5">
              <SectionHeader title="Pipeline Health" href="/jobs" count={activeJobs.length} />
              {enrichedJobs.length > 0 ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    {enrichedJobs.map((job) => (
                      <JobHealthCard key={job.id} job={job} />
                    ))}
                  </div>
                  {/* Legend */}
                  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1">
                    {[
                      { type: "sourced",       label: "Sourced" },
                      { type: "screened",      label: "Screened" },
                      { type: "client_review", label: "Client Review" },
                      { type: "interview",     label: "Interview" },
                      { type: "offer",         label: "Offer" },
                    ].map(({ type, label }) => (
                      <div key={type} className="flex items-center gap-1">
                        <span className={cn("h-2 w-2 rounded-full", STAGE_COLORS[type])} />
                        <span className="text-[10px] text-muted-foreground">{label}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Briefcase className="h-8 w-8 text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">No active searches</p>
                  <Link href="/jobs/new" className="mt-2 text-xs font-medium text-brand-600 hover:underline">
                    Create your first search →
                  </Link>
                </div>
              )}
            </div>

            {/* Clients at a glance */}
            <div className="rounded-xl border border-border bg-card p-5">
              <SectionHeader title="Client Health" href="/clients" />
              {companies.length > 0 ? (
                <div className="grid grid-cols-2 gap-3">
                  {companies.slice(0, 8).map((company) => (
                    <Link
                      key={company.id}
                      href={`/clients/${company.id}`}
                      className="flex items-center gap-3 rounded-lg border border-border bg-background p-3 hover:bg-accent/40 transition-colors group"
                    >
                      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white", generateAvatarColor(company.id))}>
                        {getInitials(company.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">{company.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {activeJobs.filter((j) => j.clientId === company.id).length} open searches
                        </p>
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Building2 className="h-8 w-8 text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">No clients yet</p>
                  <Link href="/clients" className="mt-2 text-xs font-medium text-brand-600 hover:underline">
                    Add your first client →
                  </Link>
                </div>
              )}
            </div>

          </div>

          {/* Right column */}
          <div className="space-y-5">

            {/* Today's interviews */}
            <div className="rounded-xl border border-border bg-card p-4">
              <SectionHeader title="Today's Interviews" href="/pipeline" count={todayInterviews.length} />
              <div className="space-y-2">
                {todayInterviews.map((interview) => (
                  <InterviewCard key={interview.id} interview={interview} />
                ))}
              </div>
              <Link
                href="/pipeline"
                className="mt-3 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-border py-2 text-[11px] font-medium text-muted-foreground hover:border-brand-300 hover:text-brand-600 hover:bg-brand-50 transition-colors"
              >
                View full schedule <ChevronRight className="h-3 w-3" />
              </Link>
            </div>

            {/* Recent activity */}
            <div className="rounded-xl border border-border bg-card p-4">
              <SectionHeader title="Recent Activity" />
              {activitiesLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : recentActivities.length > 0 ? (
                <div className="divide-y divide-border -mx-1 px-1">
                  {recentActivities.map((item) => (
                    <ActivityItem key={item.id} item={item} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-center gap-1.5">
                  <Clock className="h-7 w-7 text-muted-foreground/30" />
                  <p className="text-xs text-muted-foreground">No activity yet — start adding notes, calls, and submissions</p>
                </div>
              )}
            </div>

            {/* Quick stats */}
            <div className="rounded-xl border border-border bg-card p-4">
              <SectionHeader title="Quick Stats" />
              <div className="space-y-3">
                {[
                  { label: "Active candidates",   value: activeCands.length,          icon: Users,        color: "text-brand-600" },
                  { label: "Open searches",       value: activeJobs.length,           icon: Briefcase,    color: "text-violet-600" },
                  { label: "Submissions (recent)",value: kpis.submissions,            icon: Send,         color: "text-violet-600" },
                  { label: "Placements (recent)", value: kpis.placements,             icon: CheckCircle2, color: "text-emerald-600" },
                  { label: "Pipeline value",      value: formatSalary(kpis.pipelineValue, "USD", true), icon: TrendingUp, color: "text-teal-600" },
                ].map(({ label, value, icon: Icon, color }) => (
                  <div key={label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className={cn("h-3.5 w-3.5", color)} />
                      <span className="text-xs text-muted-foreground">{label}</span>
                    </div>
                    <span className="text-xs font-bold text-foreground">{value}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
