"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Calendar, Clock, Video, Phone, Building2, Users, ChevronRight,
  CheckCircle2, XCircle, AlertCircle, MapPin, Loader2, Plus,
  User, ExternalLink,
} from "lucide-react";
import { useScheduledInterviews, type ScheduledInterview } from "@/lib/supabase/hooks";
import { cn, getInitials, generateAvatarColor } from "@/lib/utils";
import { toast } from "sonner";

// ─── Helpers ──────────────────────────────────────────────────────────────────

type InterviewStatus = ScheduledInterview["status"];
type InterviewFormat = ScheduledInterview["format"];

const STATUS_CFG: Record<InterviewStatus, { label: string; bg: string; text: string; icon: React.ElementType }> = {
  scheduled:  { label: "Scheduled",  bg: "bg-brand-50",    text: "text-brand-700",    icon: Clock         },
  completed:  { label: "Completed",  bg: "bg-emerald-50", text: "text-emerald-700", icon: CheckCircle2  },
  cancelled:  { label: "Cancelled",  bg: "bg-slate-100",  text: "text-slate-500",   icon: XCircle       },
  no_show:    { label: "No show",    bg: "bg-red-50",     text: "text-red-600",     icon: AlertCircle   },
};

const FORMAT_CFG: Record<InterviewFormat, { label: string; icon: React.ElementType }> = {
  video:  { label: "Video call",    icon: Video     },
  phone:  { label: "Phone screen",  icon: Phone     },
  onsite: { label: "On-site",       icon: Building2 },
  panel:  { label: "Panel",         icon: Users     },
};

function formatTime(t: string) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")}${ampm}`;
}

function formatDate(d: string) {
  if (!d) return "";
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}

function isToday(d: string)   { return d === new Date().toISOString().slice(0, 10); }
function isFuture(d: string)  { return d >  new Date().toISOString().slice(0, 10); }
function isPast(d: string)    { return d <  new Date().toISOString().slice(0, 10); }

// ─── Interview Card ───────────────────────────────────────────────────────────

function InterviewCard({ interview, onStatusChange }: {
  interview: ScheduledInterview;
  onStatusChange: (id: string, status: InterviewStatus) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const statusCfg  = STATUS_CFG[interview.status];
  const formatCfg  = FORMAT_CFG[interview.format];
  const StatusIcon = statusCfg.icon;
  const FormatIcon = formatCfg.icon;
  const today = isToday(interview.date);
  const past  = isPast(interview.date);

  return (
    <div className={cn(
      "rounded-xl border bg-card shadow-sm overflow-hidden transition-all",
      today ? "border-brand-200 ring-1 ring-brand-200" : "border-border"
    )}>
      {today && (
        <div className="bg-brand-50 px-4 py-1.5 border-b border-brand-100 flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-500 animate-pulse" />
          <span className="text-[11px] font-semibold text-brand-700 uppercase tracking-wider">Today</span>
        </div>
      )}

      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Candidate avatar */}
          <div className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white",
            generateAvatarColor(interview.candidateId)
          )}>
            {getInitials(interview.candidateName)}
          </div>

          {/* Main info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link
                  href={`/candidates/${interview.candidateId}`}
                  className="text-sm font-semibold text-foreground hover:text-brand-600 transition-colors flex items-center gap-1"
                >
                  {interview.candidateName}
                  <ExternalLink className="h-3 w-3 text-muted-foreground" />
                </Link>
                {interview.candidateTitle && (
                  <p className="text-xs text-muted-foreground truncate">{interview.candidateTitle}</p>
                )}
              </div>

              {/* Status badge */}
              <div className="relative shrink-0">
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  className={cn(
                    "flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors hover:opacity-80",
                    statusCfg.bg, statusCfg.text
                  )}
                >
                  <StatusIcon className="h-3 w-3" />
                  {statusCfg.label}
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-7 z-20 w-40 rounded-xl border border-border bg-card shadow-xl py-1">
                    {(Object.entries(STATUS_CFG) as [InterviewStatus, typeof STATUS_CFG[InterviewStatus]][]).map(([key, cfg]) => {
                      const Icon = cfg.icon;
                      return (
                        <button
                          key={key}
                          onClick={() => { onStatusChange(interview.id, key); setMenuOpen(false); }}
                          className={cn(
                            "flex w-full items-center gap-2 px-3 py-2 text-xs font-medium hover:bg-accent transition-colors",
                            key === interview.status ? "opacity-40 cursor-default" : ""
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {cfg.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Job + client */}
            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
              <Link href={`/jobs/${interview.jobId}`} className="text-xs text-brand-600 hover:underline flex items-center gap-1">
                <ChevronRight className="h-3 w-3" />{interview.jobTitle}
              </Link>
              {interview.clientName && (
                <span className="text-xs text-muted-foreground">· {interview.clientName}</span>
              )}
            </div>
          </div>
        </div>

        {/* Time + format row */}
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1 font-medium text-foreground">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            {formatDate(interview.date)}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {formatTime(interview.startTime)}{interview.endTime ? ` – ${formatTime(interview.endTime)}` : ""}
          </span>
          <span className="flex items-center gap-1">
            <FormatIcon className="h-3.5 w-3.5" />
            {formatCfg.label}
          </span>
          {(interview.location || interview.meetingLink) && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {interview.meetingLink
                ? <a href={interview.meetingLink} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">Join link</a>
                : interview.location}
            </span>
          )}
        </div>

        {/* Interviewers */}
        {interview.interviewers.length > 0 && (
          <div className="mt-2.5 flex items-center gap-2 flex-wrap">
            <User className="h-3 w-3 text-muted-foreground shrink-0" />
            {interview.interviewers.slice(0, 4).map((iv) => (
              <span key={iv.id} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {iv.name}{iv.role ? ` · ${iv.role}` : ""}
              </span>
            ))}
            {interview.interviewers.length > 4 && (
              <span className="text-[10px] text-muted-foreground">+{interview.interviewers.length - 4} more</span>
            )}
          </div>
        )}

        {/* Notes */}
        {interview.notes && (
          <p className="mt-2.5 text-[11px] text-muted-foreground italic leading-relaxed border-t border-border pt-2.5">
            {interview.notes}
          </p>
        )}

        {/* Past actions */}
        {past && interview.status === "scheduled" && (
          <div className="mt-3 flex gap-2 border-t border-border pt-3">
            <button
              onClick={() => onStatusChange(interview.id, "completed")}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />Mark Completed
            </button>
            <button
              onClick={() => onStatusChange(interview.id, "no_show")}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-red-200 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors"
            >
              <AlertCircle className="h-3.5 w-3.5" />No Show
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <p className="text-sm font-semibold text-foreground">{label}</p>
      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{count}</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type FilterType = "all" | "scheduled" | "completed" | "cancelled";


export default function InterviewsPage() {
  const { interviews: dbInterviews, loading, updateStatus } = useScheduledInterviews();
  const [filter, setFilter] = useState<FilterType>("all");
  const [localStatuses, setLocalStatuses] = useState<Record<string, InterviewStatus>>({});

  const interviews = dbInterviews.map((iv) => ({
    ...iv,
    status: localStatuses[iv.id] ?? iv.status,
  }));

  const filtered = useMemo(() =>
    filter === "all" ? interviews : interviews.filter((iv) => iv.status === filter),
    [interviews, filter]
  );

  const today   = filtered.filter((iv) => isToday(iv.date));
  const upcoming = filtered.filter((iv) => isFuture(iv.date));
  const past    = filtered.filter((iv) => isPast(iv.date));

  async function handleStatusChange(id: string, status: InterviewStatus) {
    setLocalStatuses((prev) => ({ ...prev, [id]: status }));
    await updateStatus(id, status);
    const labels: Record<InterviewStatus, string> = {
      scheduled: "Marked as scheduled",
      completed: "Marked as completed ✓",
      cancelled: "Interview cancelled",
      no_show:   "No show recorded",
    };
    toast.success(labels[status]);
  }

  const kpis = useMemo(() => {
    const all = interviews;
    return {
      total:      all.length,
      today:      all.filter((iv) => isToday(iv.date) && iv.status === "scheduled").length,
      thisWeek:   all.filter((iv) => {
        const d = new Date(iv.date + "T00:00:00");
        const now = new Date();
        const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay());
        const weekEnd   = new Date(now); weekEnd.setDate(now.getDate() + (6 - now.getDay()));
        return d >= weekStart && d <= weekEnd && iv.status === "scheduled";
      }).length,
      completed:  all.filter((iv) => iv.status === "completed").length,
    };
  }, [interviews]);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Interviews</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {loading ? "Loading…" : `${kpis.today} today · ${kpis.thisWeek} this week`}
            </p>
          </div>
          <Link
            href="/pipeline"
            className="flex items-center gap-1.5 rounded-md bg-brand-600 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
          >
            <Plus className="h-4 w-4" />Schedule from Pipeline
          </Link>
        </div>

        {/* KPI strip */}
        <div className="mt-4 grid grid-cols-4 gap-3">
          {[
            { label: "Today",        value: kpis.today,     color: "text-brand-600"    },
            { label: "This Week",    value: kpis.thisWeek,  color: "text-foreground"   },
            { label: "Total",        value: kpis.total,     color: "text-foreground"   },
            { label: "Completed",    value: kpis.completed, color: "text-emerald-600"  },
          ].map((k) => (
            <div key={k.label} className="rounded-xl border border-border bg-background px-4 py-3">
              <p className={`text-xl font-bold ${k.color}`}>{k.value}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{k.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="shrink-0 border-b border-border bg-card px-6">
        <div className="flex gap-0">
          {(["all", "scheduled", "completed", "cancelled"] as FilterType[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize",
                filter === f ? "border-brand-600 text-brand-600" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {f === "all" ? `All (${interviews.length})` : f}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex flex-1 items-center justify-center py-24">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Calendar className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="text-base font-semibold text-foreground">No interviews found</h3>
            <p className="mt-1 text-sm text-muted-foreground">Schedule interviews from candidate pipeline cards</p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-6 py-6 space-y-8">
            {today.length > 0 && (
              <div>
                <SectionHeader label="Today" count={today.length} />
                <div className="space-y-3">
                  {today.map((iv) => (
                    <InterviewCard key={iv.id} interview={iv} onStatusChange={handleStatusChange} />
                  ))}
                </div>
              </div>
            )}
            {upcoming.length > 0 && (
              <div>
                <SectionHeader label="Upcoming" count={upcoming.length} />
                <div className="space-y-3">
                  {upcoming.map((iv) => (
                    <InterviewCard key={iv.id} interview={iv} onStatusChange={handleStatusChange} />
                  ))}
                </div>
              </div>
            )}
            {past.length > 0 && (
              <div>
                <SectionHeader label="Past" count={past.length} />
                <div className="space-y-3">
                  {past.map((iv) => (
                    <InterviewCard key={iv.id} interview={iv} onStatusChange={handleStatusChange} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
