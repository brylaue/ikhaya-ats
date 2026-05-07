"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import {
  Settings, Plus, MapPin, DollarSign, Calendar, Users,
  TrendingUp, ChevronLeft, ExternalLink, BarChart2, CheckSquare,
  ListChecks, Loader2, Sparkles, Zap, Star, Mail, Linkedin,
  ChevronDown, ChevronUp, SlidersHorizontal, CheckCircle2, Shield,
} from "lucide-react";
import { useJob, useCandidates, useTasks, useInterviewPlan, useJobRecruiters, useAiMatchScores } from "@/lib/supabase/hooks";
import type { TaskRecord } from "@/lib/supabase/hooks";
import { KanbanBoard } from "@/components/pipeline/kanban-board";
import { FunnelChart } from "@/components/pipeline/funnel-chart";
import { TaskPanel } from "@/components/tasks/task-panel";
import { cn, formatSalary, JOB_PRIORITY_COLORS, getInitials, generateAvatarColor } from "@/lib/utils";
import { toast } from "sonner";
import type { Application, PipelineStage, Candidate, ApplicationStatus } from "@/types";
import type { Task, TaskPriority } from "@/components/tasks/task-panel";
import { ScheduleInterviewModal } from "@/components/pipeline/schedule-interview-modal";
import { InterviewPlanModal, type InterviewPlan } from "@/components/jobs/interview-plan-modal";
import { JobIntakeForm } from "@/components/jobs/job-intake-form";
import { SubmissionReadinessPanel } from "@/components/pipeline/submission-readiness-panel";
import { AiMatchBadge } from "@/components/candidates/ai-match-badge";
import { CandidateOutreachModal } from "@/components/pipeline/candidate-outreach-modal";
import { ScorecardModal, type Scorecard } from "@/components/pipeline/scorecard-modal";
import { OfferModal, type Offer } from "@/components/pipeline/offer-modal";
import { CustomFieldsPanel } from "@/components/ui/custom-fields-panel";
import { ShortlistModal } from "@/components/jobs/shortlist-modal"; // US-384

// ─── Stage type inference from name ───────────────────────────────────────────

function inferStageType(name: string): PipelineStage["type"] {
  const n = name.toLowerCase();
  if (n.includes("offer"))                            return "offer";
  if (n.includes("placed") || n.includes("hired"))    return "placed";
  if (n.includes("reject") || n.includes("declined")) return "rejected";
  if (n.includes("client") || n.includes("review"))   return "client_review";
  if (n.includes("technical") || n.includes("final") || n.includes("interview")) return "interview";
  if (n.includes("submit"))                           return "submitted";
  if (n.includes("phone") || n.includes("screen"))    return "screened";
  return "sourced";
}

// ─── Add to Pipeline Modal ────────────────────────────────────────────────────

interface AddToPipelineModalProps {
  existingCandidateIds: string[];
  onAdd: (candidate: Candidate) => void;
  onClose: () => void;
}

function AddToPipelineModal({ existingCandidateIds, onAdd, onClose }: AddToPipelineModalProps) {
  const { candidates, loading } = useCandidates();
  const [query, setQuery] = useState("");

  const available = useMemo(() =>
    candidates
      .filter((c) => !existingCandidateIds.includes(c.id))
      .filter((c) =>
        !query ||
        c.fullName.toLowerCase().includes(query.toLowerCase()) ||
        c.currentTitle?.toLowerCase().includes(query.toLowerCase())
      ),
    [candidates, existingCandidateIds, query]
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">Add Candidate to Pipeline</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
        </div>
        <div className="p-4">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search candidates…"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div className="max-h-72 overflow-y-auto px-4 pb-4 space-y-1">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!loading && available.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">No candidates found</p>
          )}
          {available.map((c) => (
            <button
              key={c.id}
              onClick={() => { onAdd(c); onClose(); }}
              className="flex w-full items-center gap-3 rounded-lg p-2.5 text-left hover:bg-accent transition-colors"
            >
              <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white", generateAvatarColor(c.id))}>
                {getInitials(c.fullName)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{c.fullName}</p>
                <p className="truncate text-xs text-muted-foreground">{c.currentTitle} · {c.currentCompany}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Match Tab ────────────────────────────────────────────────────────────────

interface ScoredCandidate {
  candidate: Candidate;
  score: number;
  matched: string[];
  missing: string[];
  reasons: string[];
}

function ScoreRing({ score }: { score: number }) {
  const r      = 20;
  const circ   = 2 * Math.PI * r;
  const pct    = score / 100;
  const color  = score >= 75 ? "#10b981" : score >= 55 ? "#6366f1" : "#f59e0b";
  return (
    <svg width="52" height="52" viewBox="0 0 52 52" className="shrink-0">
      <circle cx="26" cy="26" r={r} fill="none" stroke="currentColor" strokeWidth="4"
        className="text-muted/20" />
      <circle cx="26" cy="26" r={r} fill="none" stroke={color} strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={`${circ * pct} ${circ * (1 - pct)}`}
        transform="rotate(-90 26 26)" />
      <text x="26" y="30" textAnchor="middle" fontSize="11" fontWeight="700" fill={color}>
        {score}
      </text>
    </svg>
  );
}

interface MatchTabProps {
  scoredCandidates: ScoredCandidate[];
  jobTitle: string;
  onAddToPipeline: (c: Candidate) => Promise<void>;
  aiScores?: Map<string, number>;
  onRequestAiScore?: (candidateId: string) => void;
  generatingAiScore?: Set<string>;
}

function MatchTab({ scoredCandidates, jobTitle, onAddToPipeline, aiScores, onRequestAiScore, generatingAiScore }: MatchTabProps) {
  const [minScore, setMinScore]         = useState(0);
  const [adding, setAdding]             = useState<Set<string>>(new Set());
  const [added, setAdded]               = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId]     = useState<string | null>(null);
  const [shortlisted, setShortlisted]     = useState<Set<string>>(new Set());
  const [shortlistMode, setShortlistMode] = useState(false);
  const [shortlistOpen, setShortlistOpen] = useState(false); // US-384 ShortlistModal

  const filtered = useMemo(() =>
    scoredCandidates.filter((m) => m.score >= minScore),
    [scoredCandidates, minScore]
  );

  const topFive = useMemo(() =>
    scoredCandidates.slice(0, 5).map((m) => m.candidate.id),
    [scoredCandidates]
  );

  async function handleAdd(m: ScoredCandidate) {
    if (added.has(m.candidate.id) || adding.has(m.candidate.id)) return;
    setAdding((prev) => new Set(prev).add(m.candidate.id));
    await onAddToPipeline(m.candidate);
    setAdded((prev) => new Set(prev).add(m.candidate.id));
    setAdding((prev) => { const s = new Set(prev); s.delete(m.candidate.id); return s; });
  }

  function handleAiShortlist() {
    setShortlisted(new Set(topFive));
    setShortlistMode(true);
  }

  const displayList = shortlistMode
    ? filtered.filter((m) => shortlisted.has(m.candidate.id))
    : filtered;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="shrink-0 border-b border-border bg-card px-6 py-3 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 mr-auto">
          <Sparkles className="h-4 w-4 text-violet-500" />
          <span className="text-sm font-semibold text-foreground">
            {scoredCandidates.length} candidates scored
          </span>
          <span className="text-xs text-muted-foreground">· from your talent pool · ranked by fit</span>
        </div>

        {/* Min score filter */}
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Min score</span>
          <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-0.5">
            {[0, 40, 60, 75].map((v) => (
              <button
                key={v}
                onClick={() => setMinScore(v)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  minScore === v
                    ? "bg-brand-600 text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {v === 0 ? "All" : `${v}+`}
              </button>
            ))}
          </div>
        </div>

        {/* AI Shortlist */}
        <div className="flex items-center gap-2">
          {shortlistMode ? (
            <button
              onClick={() => setShortlistMode(false)}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              Show all
            </button>
          ) : (
            <button
              onClick={handleAiShortlist}
              className="flex items-center gap-1.5 rounded-md bg-gradient-to-r from-violet-600 to-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 transition-opacity shadow-sm"
            >
              <Zap className="h-3.5 w-3.5" />
              AI Shortlist Top 5
            </button>
          )}
          {/* US-384: Compile ranked shortlist package */}
          <button
            onClick={() => setShortlistOpen(true)}
            className="flex items-center gap-1.5 rounded-md border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100 transition-colors"
          >
            <Sparkles className="h-3.5 w-3.5" />Compile Shortlist
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {displayList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Sparkles className="mb-3 h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm font-semibold text-foreground">No candidates match your filters</p>
            <p className="mt-1 text-xs text-muted-foreground">Try lowering the minimum score threshold</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {displayList.map((m) => {
              const c          = m.candidate;
              const isAdding   = adding.has(c.id);
              const isAdded    = added.has(c.id);
              const isExpanded = expandedId === c.id;
              const isShortlisted = shortlisted.has(c.id);
              const scoreColor =
                m.score >= 75 ? "text-emerald-600" :
                m.score >= 55 ? "text-violet-600"  :
                                "text-amber-600";

              return (
                <div key={c.id} className={cn(
                  "px-6 py-4 hover:bg-accent/30 transition-colors",
                  isShortlisted && "bg-violet-50/40"
                )}>
                  <div className="flex items-start gap-4">
                    {/* Score ring */}
                    <ScoreRing score={m.score} />

                    {/* Avatar */}
                    <div className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white mt-0.5",
                      generateAvatarColor(c.fullName)
                    )}>
                      {getInitials(c.fullName)}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-foreground">{c.fullName}</span>
                        {isShortlisted && (
                          <span className="flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">
                            <Star className="h-2.5 w-2.5" />AI Pick
                          </span>
                        )}
                        <AiMatchBadge
                          score={aiScores?.get(c.id)}
                          generating={generatingAiScore?.has(c.id)}
                          onRequest={onRequestAiScore ? () => onRequestAiScore(c.id) : undefined}
                          showLabel
                        />
                        {c.status === "active" && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                            Actively Looking
                          </span>
                        )}
                        {c.status === "passive" && (
                          <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold text-brand-700">
                            Open to Opportunities
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {[c.currentTitle, c.currentCompany].filter(Boolean).join(" · ")}
                      </p>
                      {c.location?.city && (
                        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {[c.location.city, c.location.state].filter(Boolean).join(", ")}
                          {c.openToRemote && " · Open to remote"}
                        </p>
                      )}

                      {/* Skill chips */}
                      <div className="mt-2 flex flex-wrap gap-1">
                        {m.matched.map((sk) => (
                          <span key={sk} className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                            ✓ {sk}
                          </span>
                        ))}
                        {m.missing.slice(0, 3).map((sk) => (
                          <span key={sk} className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                            {sk}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : c.id)}
                        className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-accent transition-colors"
                        title="See fit breakdown"
                      >
                        {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </button>
                      {c.linkedinUrl && (
                        <a
                          href={c.linkedinUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-accent transition-colors"
                        >
                          <Linkedin className="h-3.5 w-3.5" />
                        </a>
                      )}
                      <button
                        className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-accent transition-colors"
                        title="Send email"
                      >
                        <Mail className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleAdd(m)}
                        disabled={isAdded || isAdding}
                        className={cn(
                          "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all",
                          isAdded
                            ? "bg-emerald-100 text-emerald-700 cursor-default"
                            : isAdding
                            ? "bg-brand-100 text-brand-600 cursor-wait"
                            : "bg-brand-600 text-white hover:bg-brand-700 shadow-sm"
                        )}
                      >
                        {isAdded ? (
                          <><CheckCircle2 className="h-3.5 w-3.5" />Added</>
                        ) : isAdding ? (
                          <><Loader2 className="h-3.5 w-3.5 animate-spin" />Adding…</>
                        ) : (
                          <><Plus className="h-3.5 w-3.5" />Add to Pipeline</>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Expanded fit breakdown */}
                  {isExpanded && (
                    <div className="mt-3 ml-14 rounded-xl border border-border bg-muted/30 p-4">
                      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Fit breakdown for {jobTitle}
                      </p>
                      <div className="space-y-1.5">
                        {m.reasons.length > 0 ? m.reasons.map((r, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs text-foreground">
                            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                            {r}
                          </div>
                        )) : (
                          <p className="text-xs text-muted-foreground">Partial title or skill overlap detected.</p>
                        )}
                        {m.missing.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-border">
                            <p className="text-[10px] text-muted-foreground mb-1">Potential gaps:</p>
                            <p className="text-xs text-amber-600">{m.missing.join(", ")}</p>
                          </div>
                        )}
                      </div>
                      {c.desiredSalary && (
                        <p className="mt-2 pt-2 border-t border-border text-xs text-muted-foreground">
                          Target comp: {formatSalary(c.desiredSalary, c.salaryCurrency ?? "USD", true)}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function JobDetailPage({ params }: { params: { id: string } }) {
  const { job, stages: dbStages, entries, loading, notFound, moveEntry, addEntry } = useJob(params.id);
  const { plan: savedInterviewPlan, savePlan: persistInterviewPlan } = useInterviewPlan(params.id);
  const { recruiters } = useJobRecruiters(params.id);

  const { tasks: rawTasks, addTask, toggleTask, deleteTask } = useTasks(params.id, "job");
  const [activeTab, setActiveTab]                 = useState<"pipeline" | "funnel" | "tasks" | "match" | "intake" | "checklist">("pipeline");
  const [checklistCandidateId, setChecklistCandidateId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal]           = useState(false);
  const [tasks, setTasks]                         = useState<Task[]>([]);

  useEffect(() => {
    setTasks(rawTasks.map((r: TaskRecord): Task => ({
      id:           r.id,
      title:        r.title,
      priority:     r.priority as TaskPriority,
      status:       r.status as Task["status"],
      dueDate:      r.dueDate,
      assigneeId:   r.assigneeId,
      assigneeName: r.assigneeName,
      entityType:   r.entityType as Task["entityType"],
      entityId:     r.entityId,
      createdAt:    r.createdAt,
    })));
  }, [rawTasks]);
  // Interview plan — local override layer over the persisted plan
  const [localInterviewPlan, setLocalInterviewPlan] = useState<InterviewPlan | undefined>(undefined);
  const interviewPlan: InterviewPlan | undefined = localInterviewPlan
    ?? (savedInterviewPlan ? { jobId: savedInterviewPlan.jobId, stages: savedInterviewPlan.stages as InterviewPlan["stages"], notes: savedInterviewPlan.notes } : undefined);

  const [scheduleApp, setScheduleApp]             = useState<Application | null>(null);
  const [showInterviewPlan, setShowInterviewPlan] = useState(false);
  const [outreachApp, setOutreachApp]             = useState<Application | null>(null);
  const [scorecardApp, setScorecardApp]           = useState<Application | null>(null);
  const [scorecards, setScorecards]               = useState<Scorecard[]>([]);
  const [offerApp, setOfferApp]                   = useState<Application | null>(null);
  const [offers, setOffers]                       = useState<Map<string, Offer>>(new Map());
  const [placedAppIds, setPlacedAppIds]           = useState<Set<string>>(new Set());

  // ── Map DB types → component types ──────────────────────────────────────────

  const pipeline: PipelineStage[] = useMemo(() =>
    dbStages.map((s, i) => ({
      id:         s.id,
      pipelineId: params.id,
      name:       s.name,
      order:      s.position ?? i + 1,
      type:       inferStageType(s.name),
      color:      s.color,
      slaDays:    s.slaDays,
    })),
    [dbStages, params.id]
  );

  const applications: Application[] = useMemo(() =>
    entries.map((e) => {
      const enteredAt   = e.enteredStageAt ?? new Date().toISOString();
      const daysInStage = Math.floor(
        (Date.now() - new Date(enteredAt).getTime()) / 86_400_000
      );
      const stageName = dbStages.find((s) => s.id === e.stageId)?.name ?? "";
      return {
        id:             e.id,
        candidateId:    e.candidateId,
        candidate:      e.candidate,
        jobId:          params.id,
        stageId:        e.stageId,
        status:         (inferStageType(stageName) as ApplicationStatus),
        daysInStage,
        appliedAt:      enteredAt,
        lastActivityAt: enteredAt,
      };
    }),
    [entries, dbStages, params.id]
  );

  // ── Loading / not-found states ───────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !job) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-semibold text-foreground">Job not found</p>
          <Link href="/jobs" className="mt-2 text-sm text-brand-600 hover:underline">← Back to jobs</Link>
        </div>
      </div>
    );
  }

  const daysOpen             = Math.floor((Date.now() - new Date(job.createdAt).getTime()) / 86_400_000);
  const firstStageId         = pipeline[0]?.id ?? "";
  const existingCandidateIds = applications.map((a) => a.candidateId);
  const scorecardedIds       = new Set(scorecards.map((sc) => sc.applicationId));

  const statusColors: Record<string, string> = {
    active:  "bg-emerald-100 text-emerald-700",
    open:    "bg-emerald-100 text-emerald-700",
    on_hold: "bg-amber-100 text-amber-700",
    filled:  "bg-brand-100 text-brand-700",
    draft:   "bg-slate-100 text-slate-600",
  };

  // ── Handlers ────────────────────────────────────────────────────────────────

  async function handleSubmitToPortal(appId: string) {
    // Find the "client review" or "submitted" stage to move the candidate to
    const targetStage = pipeline.find(
      (s) => s.type === "client_review" || s.type === "submitted"
    ) ?? pipeline.find((s) => s.order === Math.max(...pipeline.map((p) => p.order)));
    if (targetStage) {
      await moveEntry(appId, targetStage.id);
    }
    const portalSlug = job.client?.portalSlug;
    if (portalSlug) {
      window.open(`/portal/${portalSlug}`, "_blank");
    }
    toast.success("Candidate submitted to client portal");
  }

  async function handleStageChange(entryId: string, newStageId: string) {
    await moveEntry(entryId, newStageId);
  }

  async function handleAddCandidate(candidate: Candidate) {
    if (!firstStageId) {
      toast.error("No pipeline stages configured");
      return;
    }
    const entry = await addEntry(candidate.id, firstStageId);
    if (entry) {
      toast.success(`${candidate.fullName} added to pipeline`);
    } else {
      toast.error("Failed to add candidate");
    }
  }

  function handleOfferSave(offer: Offer) {
    setOffers((prev) => new Map(prev).set(offer.applicationId, offer));
    toast.success("Offer record saved");
  }

  function handlePlacement(offer: Offer) {
    setPlacedAppIds((prev) => new Set(prev).add(offer.applicationId));
    setOffers((prev) => new Map(prev).set(offer.applicationId, offer));
    toast.success(
      `${offerApp?.candidate?.fullName ?? "Candidate"} placed! 🎉`,
      { description: offer.estimatedFee ? `Fee: ${formatSalary(offer.estimatedFee, offer.currency)}` : undefined }
    );
  }

  // ── Interview plan helpers ───────────────────────────────────────────────────

  function resolveInterviewPlanStage(app: Application) {
    if (!interviewPlan || interviewPlan.stages.length === 0) return undefined;
    const interviewStages = pipeline.filter(
      (s) => s.type === "client_review" || s.type === "interview"
    );
    const idx = interviewStages.findIndex((s) => s.id === app.stageId);
    return interviewPlan.stages[idx >= 0 ? idx : 0];
  }

  function resolveSchedulingUrl(app: Application): string | undefined {
    return resolveInterviewPlanStage(app)?.schedulingUrl;
  }

  function resolveOutreachStageName(app: Application): string {
    return (
      resolveInterviewPlanStage(app)?.name ??
      pipeline.find((s) => s.id === app.stageId)?.name ??
      "Interview"
    );
  }

  function resolveScorecardStageName(app: Application): string {
    return (
      resolveInterviewPlanStage(app)?.name ??
      pipeline.find((s) => s.id === app.stageId)?.name ??
      "Interview"
    );
  }

  // ── Talent match scoring (run when match tab is active) ─────────────────────

  const { candidates: allCandidates } = useCandidates();
  const { scores: aiScores, generating: aiGenerating, requestEmbedding } = useAiMatchScores(params.id);
  const aiScoreMap = useMemo(
    () => new Map(aiScores.map((s) => [s.candidateId, s.score])),
    [aiScores]
  );

  const scoredCandidates = useMemo(() => {
    if (!job) return [];

    const jobTitle    = job.title.toLowerCase();
    const jobLocation = (job.location ?? "").toLowerCase();
    const salMin      = job.salaryMin ?? 0;
    const salMax      = job.salaryMax ?? 999_999;

    // Infer required skill keywords from job title
    const TITLE_SKILL_MAP: Record<string, string[]> = {
      engineer:   ["python","typescript","javascript","react","node","aws","go","java","rust","sql"],
      frontend:   ["react","typescript","css","vue","javascript","nextjs","tailwind"],
      backend:    ["python","node","go","java","postgres","sql","redis","aws","docker"],
      fullstack:  ["react","typescript","python","node","postgres","aws"],
      "product manager": ["roadmap","agile","jira","strategy","analytics","sql","stakeholder"],
      "data scientist": ["python","ml","machine learning","sql","pandas","statistics","tensorflow"],
      design:     ["figma","sketch","ux","user research","prototyping","design systems"],
      director:   ["leadership","strategy","stakeholder","p&l","hiring","management"],
      vp:         ["leadership","strategy","p&l","hiring","executive","management","board"],
      cto:        ["leadership","engineering","architecture","hiring","strategy","board","roadmap"],
      cfo:        ["finance","accounting","gaap","forecasting","fundraising","m&a"],
      cro:        ["sales","revenue","go-to-market","forecasting","crm","pipeline"],
      marketing:  ["seo","analytics","campaigns","brand","content","growth","paid media"],
      recruiter:  ["sourcing","boolean","linkedin","ats","stakeholder","talent acquisition"],
    };

    const requiredSkills: string[] = [];
    for (const [keyword, skills] of Object.entries(TITLE_SKILL_MAP)) {
      if (jobTitle.includes(keyword)) {
        requiredSkills.push(...skills);
      }
    }

    return allCandidates
      .filter((c) => !existingCandidateIds.includes(c.id) && c.status !== "do_not_contact")
      .map((c) => {
        let score = 0;
        const matched: string[] = [];
        const missing: string[] = [];
        const reasons: string[] = [];

        // Title relevance (+30)
        const cTitle = (c.currentTitle ?? "").toLowerCase();
        const titleWords = jobTitle.split(/\s+/).filter((w) => w.length > 3);
        const titleHits  = titleWords.filter((w) => cTitle.includes(w));
        if (titleHits.length >= 2) {
          score += 30;
          reasons.push("Title closely matches the role");
        } else if (titleHits.length === 1) {
          score += 15;
          reasons.push("Title partially aligns with the role");
        }

        // Skills (+5 per match, up to +40)
        const candidateSkills = (c.skills ?? []).map((cs) => cs.skill.name.toLowerCase());
        let skillPts = 0;
        for (const sk of requiredSkills.slice(0, 10)) {
          const hits = candidateSkills.some((cs) => cs.includes(sk) || sk.includes(cs.split(" ")[0]));
          if (hits) {
            matched.push(sk);
            skillPts = Math.min(skillPts + 5, 40);
          } else {
            missing.push(sk);
          }
        }
        score += skillPts;
        if (matched.length > 0) reasons.push(`Skilled in ${matched.slice(0, 3).join(", ")}`);

        // Availability (+12 / -8)
        if (c.status === "active") {
          score += 12;
          reasons.push("Actively looking");
        } else if (c.status === "passive") {
          score += 4;
        } else if (c.status === "not_looking") {
          score -= 8;
        }

        // Location match (+8)
        const cCity = (c.location?.city ?? "").toLowerCase();
        const cState = (c.location?.state ?? "").toLowerCase();
        if (jobLocation && (jobLocation.includes(cCity) || cCity.includes(jobLocation.split(",")[0]))) {
          score += 8;
          reasons.push("Based in target location");
        } else if (c.openToRemote && (jobLocation.includes("remote") || jobLocation === "")) {
          score += 6;
          reasons.push("Open to remote");
        } else if (cCity) {
          reasons.push(`Located in ${[c.location?.city, c.location?.state].filter(Boolean).join(", ")}`);
        }

        // Salary alignment (+8)
        const desired = c.desiredSalary ?? 0;
        if (desired > 0 && salMax > 0 && desired <= salMax * 1.1 && desired >= salMin * 0.85) {
          score += 8;
          reasons.push("Salary expectations aligned");
        }

        // Recent activity boost (+4)
        if (c.lastActivityAt) {
          const daysSince = Math.floor((Date.now() - new Date(c.lastActivityAt).getTime()) / 86_400_000);
          if (daysSince <= 14) score += 4;
        }

        // Clamp
        const finalScore = Math.max(5, Math.min(99, score));
        return {
          candidate: c,
          score:     finalScore,
          matched:   [...new Set(matched)].slice(0, 5),
          missing:   [...new Set(missing)].slice(0, 4),
          reasons:   reasons.slice(0, 3),
        };
      })
      .sort((a, b) => b.score - a.score);
  }, [job, allCandidates, existingCandidateIds]);

  return (
    <div className="flex flex-col h-screen overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-border bg-card px-6 py-4">
        <div className="mb-3">
          <Link href="/jobs" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-fit">
            <ChevronLeft className="h-3.5 w-3.5" />
            All Jobs
          </Link>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-bold text-foreground">{job.title}</h1>
              <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", statusColors[job.status] ?? statusColors.draft)}>
                {job.status === "on_hold" ? "On Hold" : job.status.charAt(0).toUpperCase() + job.status.slice(1)}
              </span>
              <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", JOB_PRIORITY_COLORS[job.priority])}>
                {job.priority.charAt(0).toUpperCase() + job.priority.slice(1)} priority
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{job.client?.name ?? job.companyName}</p>

            {/* Meta chips */}
            <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              {job.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />{job.location}
                </span>
              )}
              {job.salaryMax && (
                <span className="flex items-center gap-1">
                  <DollarSign className="h-3.5 w-3.5" />
                  {job.salaryMin ? `${formatSalary(job.salaryMin, "USD", true)} – ` : "Up to "}
                  {formatSalary(job.salaryMax, "USD", true)}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />{daysOpen}d open
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />{applications.length} candidates
              </span>
              {job.feePct && (
                <span className="flex items-center gap-1">
                  <TrendingUp className="h-3.5 w-3.5" />{job.feePct}% fee
                </span>
              )}
              {recruiters.length > 0 && (
                <span className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  <span className="flex -space-x-1.5">
                    {recruiters.slice(0, 4).map((r) => (
                      <div
                        key={r.id}
                        title={`${r.fullName} (${r.role})`}
                        className="flex h-5 w-5 items-center justify-center rounded-full border border-card bg-brand-600 text-[9px] font-bold text-white"
                      >
                        {r.fullName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                      </div>
                    ))}
                  </span>
                  {recruiters.length === 1 ? recruiters[0].fullName : `${recruiters.length} recruiters`}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              href={`/portal/${job.client?.portalSlug ?? ""}`}
              target="_blank"
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Client Portal
            </Link>
            <button
              onClick={() => setShowInterviewPlan(true)}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                interviewPlan
                  ? "border-brand-300 bg-brand-50 text-brand-700 hover:bg-brand-100"
                  : "border-border text-muted-foreground hover:bg-accent"
              )}
            >
              <ListChecks className="h-3.5 w-3.5" />
              {interviewPlan
                ? `Interview Plan · ${interviewPlan.stages.length} stages`
                : "Interview Plan"}
            </button>
            <Link
              href={`/jobs/${params.id}/settings`}
              className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-accent transition-colors inline-flex items-center"
              title="Job Settings"
            >
              <Settings className="h-4 w-4" />
            </Link>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-4 flex gap-0">
          {(["pipeline", "funnel", "match", "tasks", "intake", "checklist"] as const).map((tab) => {
            const openTaskCount = tasks.filter((t) => t.status === "open").length;
            const topMatchCount = scoredCandidates.filter((m) => m.score >= 60).length;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors",
                  activeTab === tab
                    ? "border-brand-600 text-brand-600"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {tab === "pipeline" && <><Users className="h-3.5 w-3.5" />Pipeline</>}
                {tab === "funnel"   && <><BarChart2 className="h-3.5 w-3.5" />Funnel</>}
                {tab === "match"    && (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    Match
                    {topMatchCount > 0 && (
                      <span className="ml-0.5 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-700 leading-none">
                        {topMatchCount}
                      </span>
                    )}
                  </>
                )}
                {tab === "tasks"    && (
                  <>
                    <CheckSquare className="h-3.5 w-3.5" />Tasks
                    {openTaskCount > 0 && (
                      <span className="ml-0.5 rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold text-brand-700 leading-none">
                        {openTaskCount}
                      </span>
                    )}
                  </>
                )}
                {tab === "intake"     && <><ListChecks className="h-3.5 w-3.5" />Intake</>}
                {tab === "checklist" && <><Shield className="h-3.5 w-3.5" />Checklist</>}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        {activeTab === "pipeline" && (
          <div className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {applications.length} candidates · drag cards between stages
              </p>
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Candidate
              </button>
            </div>
            {pipeline.length > 0 ? (
              <KanbanBoard
                stages={pipeline}
                applications={applications}
                onSubmitToPortal={handleSubmitToPortal}
                onStageChange={handleStageChange}
                onScheduleInterview={(app) => setScheduleApp(app)}
                onOutreach={(app) => setOutreachApp(app)}
                onScorecard={(app) => setScorecardApp(app)}
                onOffer={(app) => setOfferApp(app)}
                scorecardedAppIds={scorecardedIds}
                placedAppIds={placedAppIds}
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-100 mb-4">
                  <ListChecks className="h-8 w-8 text-brand-600" />
                </div>
                <p className="text-sm font-semibold text-foreground">No pipeline stages configured</p>
                <p className="mt-1 text-xs text-muted-foreground max-w-xs">
                  Set up the interview stages for this search to start tracking candidates through the pipeline.
                </p>
                <button
                  onClick={() => setShowInterviewPlan(true)}
                  className="mt-4 flex items-center gap-1.5 rounded-md bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
                >
                  <ListChecks className="h-3.5 w-3.5" />
                  Set up Interview Plan
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === "funnel" && (
          <div className="mx-auto max-w-2xl p-6">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-foreground">Conversion Funnel</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Stage-by-stage conversion rates for this search — identifies where candidates are dropping off.
              </p>
            </div>
            <FunnelChart stages={pipeline} applications={applications} />
          </div>
        )}

        {activeTab === "match" && (
          <MatchTab
            scoredCandidates={scoredCandidates}
            jobTitle={job.title}
            onAddToPipeline={handleAddCandidate}
            aiScores={aiScoreMap}
            onRequestAiScore={requestEmbedding}
            generatingAiScore={aiGenerating}
          />
        )}

        {activeTab === "tasks" && (
          <div className="mx-auto max-w-xl p-6 space-y-4">
            <div className="rounded-xl border border-border bg-card p-5">
              <TaskPanel
                tasks={tasks}
                entityId={job.id}
                entityType="job"
                onTasksChange={setTasks}
                onAddTask={(input) => addTask(input) as Promise<Task | null>}
                onToggleTask={toggleTask}
                onDeleteTask={deleteTask}
              />
            </div>
            {/* Custom fields for this job */}
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Custom Fields</p>
              <CustomFieldsPanel entity="job" recordId={job.id} />
            </div>
          </div>
        )}

        {activeTab === "intake" && (
          <div className="mx-auto max-w-2xl p-6">
            <div className="rounded-xl border border-border bg-card p-6">
              <JobIntakeForm jobId={job.id} />
            </div>
          </div>
        )}

        {activeTab === "checklist" && (
          <div className="mx-auto max-w-xl p-6 space-y-4">
            {/* Candidate picker */}
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Select Candidate
              </p>
              {applications.length === 0 ? (
                <p className="text-sm text-muted-foreground">No candidates in pipeline yet.</p>
              ) : (
                <div className="grid grid-cols-1 gap-1.5">
                  {applications.map((app) => {
                    const c = app.candidate;
                    if (!c) return null;
                    const selected = checklistCandidateId === c.id;
                    return (
                      <button
                        key={c.id}
                        onClick={() => setChecklistCandidateId(selected ? null : c.id)}
                        className={cn(
                          "flex items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                          selected
                            ? "border-brand-300 bg-brand-50 text-brand-700"
                            : "border-border bg-background hover:bg-accent"
                        )}
                      >
                        <div className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white",
                          selected ? "bg-brand-600" : "bg-slate-500"
                        )}>
                          {c.fullName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium">{c.fullName}</p>
                          {c.currentTitle && <p className="text-xs text-muted-foreground">{c.currentTitle}</p>}
                        </div>
                        {selected && <CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-brand-600" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Checklist panel */}
            {checklistCandidateId ? (
              <div className="rounded-xl border border-border bg-card p-5">
                <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Submission Readiness
                </p>
                <SubmissionReadinessPanel
                  jobId={job.id}
                  candidateId={checklistCandidateId}
                  clientId={job.clientId}
                  onSubmit={(blocked, incomplete) => {
                    if (!blocked) {
                      toast.success("Submission recorded — all required items complete");
                    } else {
                      toast.warning(`Submitted with ${incomplete.length} incomplete required item${incomplete.length !== 1 ? "s" : ""}`);
                    }
                  }}
                />
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border p-8 text-center">
                <Shield className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Select a candidate above to view their checklist</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}

      {showAddModal && (
        <AddToPipelineModal
          existingCandidateIds={existingCandidateIds}
          onAdd={handleAddCandidate}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {scheduleApp?.candidate && (
        <ScheduleInterviewModal
          candidate={scheduleApp.candidate}
          defaultJobId={job.id}
          onClose={() => setScheduleApp(null)}
          onScheduled={() => setScheduleApp(null)}
        />
      )}

      {outreachApp?.candidate && (
        <CandidateOutreachModal
          candidate={outreachApp.candidate}
          jobTitle={job.title}
          clientName={job.client?.name ?? job.companyName ?? "the client"}
          stageName={resolveOutreachStageName(outreachApp)}
          schedulingUrl={resolveSchedulingUrl(outreachApp)}
          onClose={() => setOutreachApp(null)}
          onSent={() => setOutreachApp(null)}
        />
      )}

      {scorecardApp?.candidate && (
        <ScorecardModal
          candidate={scorecardApp.candidate}
          applicationId={scorecardApp.id}
          stageName={resolveScorecardStageName(scorecardApp)}
          jobTitle={job.title}
          onSubmit={(sc) => {
            setScorecards((prev) => [...prev, sc]);
            setScorecardApp(null);
          }}
          onClose={() => setScorecardApp(null)}
        />
      )}

      {showInterviewPlan && (
        <InterviewPlanModal
          jobTitle={job.title}
          jobId={job.id}
          existingPlan={interviewPlan}
          onSave={async (plan) => {
            setLocalInterviewPlan(plan);
            const ok = await persistInterviewPlan(plan);
            if (!ok) toast.error("Failed to save interview plan");
          }}
          onClose={() => setShowInterviewPlan(false)}
        />
      )}

      {offerApp?.candidate && (
        <OfferModal
          candidate={offerApp.candidate}
          applicationId={offerApp.id}
          jobId={job.id}
          jobTitle={job.title}
          clientName={job.client?.name ?? (job as { companyName?: string }).companyName ?? "the client"}
          existingOffer={offers.get(offerApp.id)}
          onSave={handleOfferSave}
          onPlace={handlePlacement}
          onClose={() => setOfferApp(null)}
        />
      )}

      {/* US-384: AI Shortlist Compiler */}
      {shortlistOpen && job && (
        <ShortlistModal
          jobId={job.id}
          jobTitle={job.title}
          onClose={() => setShortlistOpen(false)}
        />
      )}
    </div>
  );
}
