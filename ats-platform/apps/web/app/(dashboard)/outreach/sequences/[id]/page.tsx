"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft, Mail, Clock, Users, Send, CheckCircle2,
  Play, Pause, Edit3, Copy, Trash2, Plus, Loader2,
  MoreHorizontal, X, Calendar, Zap, TrendingUp,
  UserMinus, RotateCcw, AlertCircle, Search,
  ArrowRight, BarChart2,
} from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import { toast } from "sonner";
import {
  useOutreachSequences,
  useSequenceEnrollments,
  useCandidates,
  type OutreachSequence,
  type OutreachSequenceStep,
  type SequenceEnrollment,
  type EnrollmentStatus,
} from "@/lib/supabase/hooks";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<EnrollmentStatus, { label: string; dotClass: string; textClass: string; bgClass: string }> = {
  active:       { label: "Active",       dotClass: "bg-emerald-500", textClass: "text-emerald-700", bgClass: "bg-emerald-100" },
  paused:       { label: "Paused",       dotClass: "bg-amber-500",   textClass: "text-amber-700",   bgClass: "bg-amber-100"   },
  completed:    { label: "Completed",    dotClass: "bg-brand-500",    textClass: "text-brand-700",    bgClass: "bg-brand-100"    },
  unsubscribed: { label: "Unsubscribed", dotClass: "bg-slate-400",   textClass: "text-slate-600",   bgClass: "bg-slate-100"   },
  bounced:      { label: "Bounced",      dotClass: "bg-red-500",     textClass: "text-red-700",     bgClass: "bg-red-100"     },
};

function StatusBadge({ status }: { status: EnrollmentStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold", cfg.bgClass, cfg.textClass)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dotClass)} />
      {cfg.label}
    </span>
  );
}

function StepBadge({ step }: { step: OutreachSequenceStep; index?: number }) {
  if (step.type === "wait") {
    return (
      <div className="flex items-center gap-1.5 rounded-full border border-dashed border-border bg-muted/40 px-2.5 py-1 text-[10px] text-muted-foreground">
        <Clock className="h-3 w-3" />{step.delayDays}d wait
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-[10px] font-medium text-brand-700">
      <Mail className="h-3 w-3" />Email
    </div>
  );
}

// ─── Enroll Modal (with scheduling) ──────────────────────────────────────────

function EnrollModal({
  seq,
  onClose,
  onEnroll,
}: {
  seq: OutreachSequence;
  onClose: () => void;
  onEnroll: (candidateIds: string[], firstSendAt?: string) => Promise<void>;
}) {
  const { candidates } = useCandidates();
  const [query, setQuery]           = useState("");
  const [selected, setSelected]     = useState<Set<string>>(new Set());
  const [enrolling, setEnrolling]   = useState(false);
  const [sendMode, setSendMode]     = useState<"now" | "scheduled">("now");
  const [scheduleDate, setScheduleDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d.toISOString().slice(0, 16); // datetime-local format
  });

  const filtered = candidates.filter((c) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      c.fullName.toLowerCase().includes(q) ||
      (c.currentTitle ?? "").toLowerCase().includes(q) ||
      (c.currentCompany ?? "").toLowerCase().includes(q)
    );
  });

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleEnroll() {
    if (selected.size === 0) { toast.error("Select at least one candidate"); return; }
    setEnrolling(true);
    try {
      const firstSendAt = sendMode === "scheduled"
        ? new Date(scheduleDate).toISOString()
        : new Date().toISOString();
      await onEnroll([...selected], firstSendAt);
      toast.success(`${selected.size} candidate${selected.size > 1 ? "s" : ""} enrolled in "${seq.name}"`);
      onClose();
    } catch {
      toast.error("Failed to enroll candidates");
    } finally {
      setEnrolling(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex w-full max-w-lg flex-col rounded-2xl bg-card border border-border shadow-2xl overflow-hidden" style={{ maxHeight: "85vh" }}>
        {/* Header */}
        <div className="shrink-0 border-b border-border px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Enroll Candidates</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Add to "{seq.name}"</p>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search candidates…"
              className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground text-foreground"
            />
            {query && <button onClick={() => setQuery("")} className="text-muted-foreground hover:text-foreground text-base leading-none">×</button>}
          </div>
        </div>

        {/* Candidate list */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No candidates found</p>
            </div>
          ) : (
            filtered.map((c) => {
              const isChecked = selected.has(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => toggle(c.id)}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-3 border-b border-border text-left transition-colors",
                    isChecked ? "bg-brand-50" : "hover:bg-accent/50"
                  )}
                >
                  <div className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors", isChecked ? "bg-brand-600 border-brand-600" : "border-border bg-background")}>
                    {isChecked && <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 12 10" fill="none"><path d="M1 5l3 4 7-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  </div>
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[10px] font-bold text-violet-700">
                    {c.fullName.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{c.fullName}</p>
                    {(c.currentTitle || c.currentCompany) && (
                      <p className="text-xs text-muted-foreground truncate">{[c.currentTitle, c.currentCompany].filter(Boolean).join(" · ")}</p>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Scheduling + footer */}
        <div className="shrink-0 border-t border-border px-5 py-4 space-y-3">
          {/* Send timing */}
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">First email send time</p>
            <div className="flex gap-2">
              <button
                onClick={() => setSendMode("now")}
                className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-colors", sendMode === "now" ? "border-brand-500 bg-brand-50 text-brand-700" : "border-border text-muted-foreground hover:bg-accent")}
              >
                <Zap className="h-3.5 w-3.5" />Send immediately
              </button>
              <button
                onClick={() => setSendMode("scheduled")}
                className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-colors", sendMode === "scheduled" ? "border-brand-500 bg-brand-50 text-brand-700" : "border-border text-muted-foreground hover:bg-accent")}
              >
                <Calendar className="h-3.5 w-3.5" />Schedule
              </button>
            </div>
            {sendMode === "scheduled" && (
              <input
                type="datetime-local"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-brand-500"
              />
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {selected.size > 0 ? `${selected.size} selected` : "No candidates selected"}
            </p>
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent transition-colors">Cancel</button>
              <button
                onClick={handleEnroll}
                disabled={enrolling || selected.size === 0}
                className="flex items-center gap-1.5 rounded-md bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {enrolling ? <><Loader2 className="h-4 w-4 animate-spin" />Enrolling…</> : <><Users className="h-4 w-4" />Enroll {selected.size > 0 ? selected.size : ""}</>}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Enrollment Row ────────────────────────────────────────────────────────────

function EnrollmentRow({
  enrollment,
  emailSteps,
  onPause,
  onResume,
  onRemove,
}: {
  enrollment: SequenceEnrollment;
  emailSteps: OutreachSequenceStep[];
  onPause:  (id: string) => void;
  onResume: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const initials = enrollment.candidateName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  const currentEmailStep = emailSteps[enrollment.currentStep];
  const progressPct = emailSteps.length > 0 ? Math.round((enrollment.currentStep / emailSteps.length) * 100) : 0;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    if (menuOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  return (
    <div className="group flex items-center gap-4 px-5 py-3.5 border-b border-border hover:bg-accent/30 transition-colors">
      {/* Avatar */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[11px] font-bold text-violet-700">
        {initials}
      </div>

      {/* Name + meta */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-foreground truncate">{enrollment.candidateName}</p>
          <StatusBadge status={enrollment.status} />
          {enrollment.replied && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Replied</span>
          )}
          {enrollment.opened && !enrollment.replied && (
            <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold text-brand-700">Opened</span>
          )}
        </div>
        {(enrollment.candidateTitle || enrollment.candidateCompany) && (
          <p className="mt-0.5 text-xs text-muted-foreground truncate">
            {[enrollment.candidateTitle, enrollment.candidateCompany].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>

      {/* Step progress */}
      <div className="hidden md:flex flex-col items-end gap-1 shrink-0 w-28">
        <p className="text-[10px] text-muted-foreground">
          Step {enrollment.currentStep + 1} / {emailSteps.length} · {enrollment.emailsSent} sent
        </p>
        <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {/* Next send */}
      <div className="hidden lg:block shrink-0 w-32 text-right">
        {enrollment.status === "active" && enrollment.nextSendAt ? (
          <div>
            <p className="text-[10px] font-medium text-foreground">Next send</p>
            <p className="text-[10px] text-muted-foreground">{formatRelativeTime(enrollment.nextSendAt)}</p>
          </div>
        ) : enrollment.status === "completed" ? (
          <p className="text-[10px] text-muted-foreground">Completed {enrollment.completedAt ? formatRelativeTime(enrollment.completedAt) : ""}</p>
        ) : enrollment.status === "paused" ? (
          <p className="text-[10px] text-amber-600 font-medium">Paused</p>
        ) : null}
      </div>

      {/* Actions */}
      <div className="relative shrink-0" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-accent transition-all"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-8 z-20 w-44 rounded-xl border border-border bg-card shadow-xl p-1.5 space-y-0.5">
            {enrollment.status === "active" ? (
              <button
                onClick={() => { onPause(enrollment.id); setMenuOpen(false); }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-foreground hover:bg-accent transition-colors"
              >
                <Pause className="h-3.5 w-3.5 text-amber-500" />Pause sends
              </button>
            ) : enrollment.status === "paused" ? (
              <button
                onClick={() => { onResume(enrollment.id); setMenuOpen(false); }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-foreground hover:bg-accent transition-colors"
              >
                <Play className="h-3.5 w-3.5 text-emerald-500" />Resume sends
              </button>
            ) : null}
            <button
              onClick={() => { onRemove(enrollment.id); setMenuOpen(false); }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-red-600 hover:bg-red-50 transition-colors"
            >
              <UserMinus className="h-3.5 w-3.5" />Remove from sequence
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Step Analytics Panel ─────────────────────────────────────────────────────

function StepAnalyticsPanel({
  steps,
  enrollments,
}: {
  steps: OutreachSequenceStep[];
  enrollments: SequenceEnrollment[];
}) {
  const emailSteps = steps.filter((s) => s.type === "email");
  const totalEnrolled = enrollments.length;

  // Compute per-step funnel: how many enrollments reached/passed this step
  const stepStats = emailSteps.map((step, i) => {
    const reached  = enrollments.filter((e) => e.currentStep > i || e.status === "completed").length;
    const sent     = enrollments.filter((e) => e.emailsSent > i).length;
    const openRate = totalEnrolled > 0 && i === 0 ? Math.round((enrollments.filter((e) => e.opened).length / totalEnrolled) * 100) : 0;
    const replyRate = i === 0 ? Math.round((enrollments.filter((e) => e.replied).length / Math.max(totalEnrolled, 1)) * 100) : 0;
    return { step, index: i, reached, sent, openRate, replyRate };
  });

  let renderIdx = 0;

  return (
    <div className="space-y-0">
      {steps.map((step, i) => {
        if (step.type === "wait") {
          return (
            <div key={step.id} className="flex items-center gap-3 px-5 py-2">
              <div className="w-px h-5 bg-border ml-4 shrink-0" />
              <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground">Wait {step.delayDays} {step.delayDays === 1 ? "day" : "days"}</span>
            </div>
          );
        }

        const stat = stepStats[renderIdx];
        renderIdx++;
        const emailNum = renderIdx;

        return (
          <div key={step.id} className="border-b border-border px-5 py-3">
            <div className="flex items-start gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[11px] font-bold text-brand-700 mt-0.5">
                {emailNum}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-foreground truncate">{step.subject || `Email ${emailNum}`}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground line-clamp-1">{step.body?.split("\n")[0]}</p>

                {/* Mini funnel bar */}
                {totalEnrolled > 0 && (
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-[10px] text-muted-foreground w-10">Sent</p>
                      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-brand-400 rounded-full" style={{ width: `${Math.round((stat?.sent ?? 0) / totalEnrolled * 100)}%` }} />
                      </div>
                      <p className="text-[10px] font-medium text-foreground w-8 text-right">{stat?.sent ?? 0}</p>
                    </div>
                    {emailNum === 1 && (
                      <>
                        <div className="flex items-center gap-2">
                          <p className="text-[10px] text-muted-foreground w-10">Opened</p>
                          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className="h-full bg-violet-400 rounded-full" style={{ width: `${stat?.openRate ?? 0}%` }} />
                          </div>
                          <p className={cn("text-[10px] font-medium w-8 text-right", (stat?.openRate ?? 0) >= 30 ? "text-emerald-600" : "text-foreground")}>{stat?.openRate ?? 0}%</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="text-[10px] text-muted-foreground w-10">Replied</p>
                          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${stat?.replyRate ?? 0}%` }} />
                          </div>
                          <p className={cn("text-[10px] font-medium w-8 text-right", (stat?.replyRate ?? 0) >= 10 ? "text-emerald-600" : "text-foreground")}>{stat?.replyRate ?? 0}%</p>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SequenceDetailPage() {
  const params  = useParams<{ id: string }>();
  const router  = useRouter();
  const seqId   = params.id;

  const { sequences, loading: seqsLoading, updateSequence, deleteSequence, cloneSequence, toggleStatus } = useOutreachSequences();
  const { enrollments, loading: enrollLoading, enroll, pauseEnrollment, resumeEnrollment, removeEnrollment } = useSequenceEnrollments(seqId);

  const [enrollOpen, setEnrollOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<EnrollmentStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Find the sequence in the loaded list
  const seq: OutreachSequence | undefined = sequences.find((s) => s.id === seqId);

  const emailSteps = (seq?.steps ?? []).filter((s) => s.type === "email");
  const totalSteps = emailSteps.length;

  // Filtered enrollments
  const visibleEnrollments = enrollments.filter((e) => {
    if (filterStatus !== "all" && e.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      return e.candidateName.toLowerCase().includes(q) ||
        (e.candidateTitle ?? "").toLowerCase().includes(q) ||
        (e.candidateCompany ?? "").toLowerCase().includes(q);
    }
    return true;
  });

  // KPI derived from enrollment records
  const totalEnrolled  = enrollments.length;
  const activeCount    = enrollments.filter((e) => e.status === "active").length;
  const openedCount    = enrollments.filter((e) => e.opened).length;
  const repliedCount   = enrollments.filter((e) => e.replied).length;
  const sentCount      = enrollments.reduce((s, e) => s + e.emailsSent, 0);
  const openRate       = sentCount > 0 ? Math.round((openedCount / Math.max(totalEnrolled, 1)) * 100) : 0;
  const replyRate      = sentCount > 0 ? Math.round((repliedCount / Math.max(totalEnrolled, 1)) * 100) : 0;

  async function handleEnroll(candidateIds: string[], firstSendAt?: string) {
    const n = await enroll(candidateIds, firstSendAt);
    if (n > 0 && seq) {
      await updateSequence(seqId, { enrolled: seq.enrolled + n });
    }
  }

  async function handleToggle() {
    await toggleStatus(seqId);
    toast.success(`Sequence ${seq?.status === "active" ? "paused" : "resumed"}`);
  }

  async function handleDelete() {
    setDeleting(true);
    const ok = await deleteSequence(seqId);
    if (ok) {
      toast.success("Sequence deleted");
      router.push("/outreach");
    } else {
      toast.error("Failed to delete");
      setDeleting(false);
    }
  }

  async function handleClone() {
    if (!seq) return;
    const cloned = await cloneSequence(seq);
    if (cloned) {
      toast.success(`Cloned "${seq.name}"`);
      router.push(`/outreach/sequences/${cloned.id}`);
    } else {
      toast.error("Failed to clone");
    }
  }

  async function handlePause(id: string) {
    await pauseEnrollment(id);
    toast.success("Enrollment paused");
  }

  async function handleResume(id: string) {
    await resumeEnrollment(id);
    toast.success("Enrollment resumed");
  }

  async function handleRemove(id: string) {
    const e = enrollments.find((en) => en.id === id);
    await removeEnrollment(id);
    toast.success(`Removed ${e?.candidateName ?? "candidate"} from sequence`);
  }

  const loading = seqsLoading || (!seq && !seqsLoading);

  if (seqsLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!seq) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <AlertCircle className="h-10 w-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Sequence not found</p>
        <Link href="/outreach" className="text-sm text-brand-600 hover:underline">← Back to Outreach</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">

      {/* Header */}
      <div className="shrink-0 border-b border-border bg-card px-6 py-4">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
          <Link href="/outreach" className="hover:text-foreground transition-colors flex items-center gap-1">
            <ChevronLeft className="h-3.5 w-3.5" />Outreach
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium truncate max-w-[200px]">{seq.name}</span>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-foreground">{seq.name}</h1>
              {seq.tag && (
                <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-medium text-secondary-foreground">
                  {seq.tag}
                </span>
              )}
              <span className={cn(
                "rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase",
                seq.status === "active" ? "bg-emerald-100 text-emerald-700" :
                seq.status === "paused" ? "bg-amber-100 text-amber-700" :
                                          "bg-slate-100 text-slate-600"
              )}>
                {seq.status}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {totalSteps} emails · {totalEnrolled} enrolled · Created {formatRelativeTime(seq.createdAt)}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleToggle}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-colors",
                seq.status === "active"
                  ? "border-amber-200 text-amber-700 hover:bg-amber-50"
                  : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
              )}
            >
              {seq.status === "active" ? <><Pause className="h-3.5 w-3.5" />Pause</> : <><Play className="h-3.5 w-3.5" />Resume</>}
            </button>
            <Link
              href={`/outreach?edit=${seqId}`}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
            >
              <Edit3 className="h-3.5 w-3.5" />Edit
            </Link>
            <button
              onClick={handleClone}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
            >
              <Copy className="h-3.5 w-3.5" />Clone
            </button>

            {/* Delete with confirmation */}
            <div className="relative">
              {confirmDelete ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Delete?</span>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="rounded-md bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700 transition-colors disabled:opacity-60"
                  >
                    {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Yes, delete"}
                  </button>
                  <button onClick={() => setConfirmDelete(false)} className="rounded-md border border-border px-2 py-2 text-xs text-muted-foreground hover:bg-accent">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1.5 rounded-md border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />Delete
                </button>
              )}
            </div>

            <button
              onClick={() => setEnrollOpen(true)}
              className="flex items-center gap-1.5 rounded-md bg-brand-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />Enroll Candidates
            </button>
          </div>
        </div>

        {/* KPI strip */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Enrolled",   value: totalEnrolled,                       icon: Users,       iconClass: "text-brand-500"    },
            { label: "Active",     value: activeCount,                         icon: Zap,         iconClass: "text-emerald-500" },
            { label: "Open rate",  value: sentCount > 0 ? `${openRate}%` : "—", icon: BarChart2,  iconClass: "text-violet-500"  },
            { label: "Reply rate", value: sentCount > 0 ? `${replyRate}%` : "—", icon: TrendingUp,iconClass: "text-teal-500"    },
          ].map(({ label, value, icon: Icon, iconClass }) => (
            <div key={label} className="rounded-xl border border-border bg-background px-4 py-3">
              <div className="flex items-center gap-2 mb-1">
                <Icon className={cn("h-3.5 w-3.5", iconClass)} />
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
              </div>
              <p className="text-xl font-bold text-foreground">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Body: two-column */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left: enrollment list */}
        <div className="flex flex-col flex-1 overflow-hidden border-r border-border">
          {/* Toolbar */}
          <div className="shrink-0 flex items-center gap-2 border-b border-border px-5 py-3">
            <div className="flex flex-1 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5">
              <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search enrolled candidates…"
                className="flex-1 text-xs bg-transparent outline-none placeholder:text-muted-foreground text-foreground"
              />
              {search && <button onClick={() => setSearch("")} className="text-muted-foreground hover:text-foreground text-sm leading-none">×</button>}
            </div>

            {/* Status filter */}
            <div className="flex items-center gap-1">
              {(["all", "active", "paused", "completed"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilterStatus(f)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors capitalize",
                    filterStatus === f ? "bg-brand-600 text-white" : "bg-muted text-muted-foreground hover:bg-accent"
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Column headers */}
          <div className="shrink-0 grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-5 py-2 border-b border-border bg-muted/30">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Candidate</p>
            <p className="hidden md:block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-right w-28">Progress</p>
            <p className="hidden lg:block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-right w-32">Next send</p>
            <div className="w-7" />
          </div>

          {/* Rows */}
          <div className="flex-1 overflow-y-auto">
            {enrollLoading ? (
              <div className="space-y-px">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center gap-4 px-5 py-3.5 border-b border-border animate-pulse">
                    <div className="h-8 w-8 rounded-full bg-muted shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 w-36 rounded bg-muted" />
                      <div className="h-2.5 w-24 rounded bg-muted" />
                    </div>
                  </div>
                ))}
              </div>
            ) : visibleEnrollments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center px-8">
                <Users className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-sm font-medium text-foreground">
                  {enrollments.length === 0 ? "No candidates enrolled yet" : "No matches for this filter"}
                </p>
                {enrollments.length === 0 && (
                  <button
                    onClick={() => setEnrollOpen(true)}
                    className="mt-4 flex items-center gap-1.5 rounded-md bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />Enroll your first candidates
                  </button>
                )}
              </div>
            ) : (
              visibleEnrollments.map((e) => (
                <EnrollmentRow
                  key={e.id}
                  enrollment={e}
                  emailSteps={emailSteps}
                  onPause={handlePause}
                  onResume={handleResume}
                  onRemove={handleRemove}
                />
              ))
            )}
          </div>
        </div>

        {/* Right: sequence structure + analytics */}
        <div className="w-80 xl:w-96 shrink-0 flex flex-col overflow-hidden">
          <div className="shrink-0 border-b border-border px-5 py-3">
            <p className="text-xs font-semibold text-foreground">Sequence structure</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">{totalSteps} emails · {seq.steps.filter((s) => s.type === "wait").length} wait steps</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {seq.steps.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <Mail className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-xs text-muted-foreground">No steps defined yet</p>
                <Link
                  href={`/outreach?edit=${seqId}`}
                  className="mt-3 text-xs text-brand-600 hover:underline"
                >
                  Edit sequence →
                </Link>
              </div>
            ) : (
              <StepAnalyticsPanel steps={seq.steps} enrollments={enrollments} />
            )}
          </div>

          {/* Sequence footer actions */}
          <div className="shrink-0 border-t border-border p-4 space-y-2">
            <Link
              href={`/outreach?edit=${seqId}`}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border py-2 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
            >
              <Edit3 className="h-3.5 w-3.5" />Edit sequence steps
            </Link>
            <button
              onClick={() => setEnrollOpen(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-md bg-brand-600 py-2 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />Enroll more candidates
            </button>
          </div>
        </div>
      </div>

      {/* Enroll modal */}
      {enrollOpen && (
        <EnrollModal
          seq={seq}
          onClose={() => setEnrollOpen(false)}
          onEnroll={handleEnroll}
        />
      )}
    </div>
  );
}
