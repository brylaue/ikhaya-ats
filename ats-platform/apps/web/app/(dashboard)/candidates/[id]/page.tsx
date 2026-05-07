"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Mail, Phone, Linkedin, MapPin, ChevronLeft, FileText,
  Briefcase, Star, Send, CheckCircle2, Clock, Download,
  Building2, Calendar, ExternalLink, GraduationCap, Award,
  Sparkles, FileSignature, Kanban, Loader2, TrendingUp, Plus,
} from "lucide-react";
import { useCandidate, useActivities, useTasks, useWorkHistory, useEducation, useEmailTimeline, useEmailConflicts } from "@/lib/supabase/hooks";
import type { ActivityRecord, TaskRecord } from "@/lib/supabase/hooks";
import { cn, getInitials, generateAvatarColor, formatSalary, STATUS_LABELS, STATUS_COLORS } from "@/lib/utils";
import { ActivityTimeline } from "@/components/candidates/activity-timeline";
import { TaskPanel } from "@/components/tasks/task-panel";
import type { Activity } from "@/types";
import type { Task, TaskPriority } from "@/components/tasks/task-panel";
import { toast } from "sonner";
import { EmailComposeModal } from "@/components/outreach/email-compose-modal";
import { SubmitToClientModal } from "@/components/candidates/submit-to-client-modal";
import { ScheduleInterviewModal } from "@/components/pipeline/schedule-interview-modal";
import { AICopilot } from "@/components/ai/ai-copilot";
import type { CandidateContext } from "@/components/ai/ai-copilot";
import { ResumeViewer } from "@/components/candidates/resume-viewer";
// CandidateEmailTimeline removed — emails now surface in unified Activity tab
import { TagEditor } from "@/components/candidates/tag-editor";
import { CustomFieldsPanel } from "@/components/ui/custom-fields-panel";
import { ScorecardPanel } from "@/components/candidates/ScorecardPanel";
import { OfferLetterPanel } from "@/components/candidates/OfferLetterPanel";
import { BrandedResumeModal, type ResumeCandidate } from "@/components/candidates/branded-resume-modal";
import { ConsentPanel } from "@/components/candidates/consent-panel"; // US-344
import { CandidatePortalPanel } from "@/components/candidates/candidate-portal-panel"; // US-240
import { MatchScoreBreakdown } from "@/components/candidates/match-score-breakdown"; // US-110
import { AiAssistedBadge } from "@/components/ai/ai-assisted-badge"; // US-422


// ─── NormaliseSkillsButton ────────────────────────────────────────────────────

function NormaliseSkillsButton({ candidateId }: { candidateId: string }) {
  const [normalising, setNormalising] = useState(false);
  async function run() {
    setNormalising(true);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/normalize-skills`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { updated, normalised } = await res.json();
      if (updated) toast.success(`Skills normalised — ${normalised.canonical.length} canonical skills`);
      else toast.success("Skills already normalised");
    } catch { toast.error("Normalisation failed"); }
    finally { setNormalising(false); }
  }
  return (
    <button onClick={run} disabled={normalising}
      className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-brand-600 hover:bg-brand-50 disabled:opacity-50 transition-colors">
      {normalising ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
      {normalising ? "Normalising…" : "Normalise"}
    </button>
  );
}

// ─── MatchingJobsPanel ────────────────────────────────────────────────────────
// US-382: Shows top open jobs for this candidate ranked by AI match score.

interface MatchingJob {
  id: string; title: string; company: string | null; companyId: string | null;
  location: string | null; status: string; score: number; mode: "scored" | "vector";
}

function MatchingJobsPanel({ candidateId }: { candidateId: string }) {
  const [jobs, setJobs]     = useState<MatchingJob[]>([]);
  const [mode, setMode]     = useState<"scored" | "vector" | "pending" | "loading">("loading");
  const [adding, setAdding] = useState<string | null>(null);
  const [explain, setExplain] = useState<MatchingJob | null>(null); // US-110

  useEffect(() => {
    fetch(`/api/candidates/${candidateId}/matching-jobs`)
      .then((r) => r.json())
      .then(({ jobs: j, mode: m }) => { setJobs(j ?? []); setMode(m ?? "pending"); })
      .catch(() => setMode("pending"));
  }, [candidateId]);

  async function addToPipeline(job: MatchingJob) {
    setAdding(job.id);
    try {
      const res = await fetch(`/api/jobs/${job.id}/pipeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Added to ${job.title}`);
    } catch {
      toast.error("Could not add to pipeline");
    } finally {
      setAdding(null);
    }
  }

  if (mode === "loading") return null;
  if (mode === "pending" || jobs.length === 0) return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        <TrendingUp className="h-3 w-3" /> Matching Jobs
      </p>
      <p className="text-[10px] text-muted-foreground">Scores pending — run embedding backfill to see matches.</p>
    </div>
  );

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
          <TrendingUp className="h-3 w-3" /> Matching Jobs
        </p>
        <span className="text-[9px] text-muted-foreground">{mode === "vector" ? "live similarity" : "AI scored"}</span>
      </div>
      <div className="space-y-1">
        {jobs.map((job) => (
          <div key={job.id} className="flex items-center justify-between gap-1 rounded-md border border-border px-2 py-1.5 hover:bg-accent transition-colors">
            <div className="min-w-0 flex-1">
              <Link href={`/jobs/${job.id}`} className="block truncate text-[11px] font-medium text-foreground hover:text-brand-600">
                {job.title}
              </Link>
              {job.company && <p className="truncate text-[10px] text-muted-foreground">{job.company}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                onClick={() => setExplain(job)}
                title="Why this score?"
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums transition-colors hover:ring-2 hover:ring-brand-300",
                  job.score >= 80 ? "bg-emerald-100 text-emerald-700" :
                  job.score >= 60 ? "bg-amber-100 text-amber-700" : "bg-secondary text-muted-foreground"
                )}
              >
                {job.score}%
              </button>
              <button
                onClick={() => addToPipeline(job)}
                disabled={adding === job.id}
                title="Add to pipeline"
                className="rounded p-0.5 text-muted-foreground hover:bg-brand-50 hover:text-brand-600 disabled:opacity-40 transition-colors"
              >
                {adding === job.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              </button>
            </div>
          </div>
        ))}
      </div>
      {explain && (
        <MatchScoreBreakdown
          candidateId={candidateId}
          jobId={explain.id}
          jobTitle={explain.title}
          initialScore={explain.score}
          onClose={() => setExplain(null)}
        />
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const MAIN_TABS = ["activity", "pipeline", "resume", "tasks", "scorecards", "offers"] as const;
type MainTab = typeof MAIN_TABS[number];

export default function CandidatePage({ params }: { params: { id: string } }) {
  const { candidate, loading, notFound }           = useCandidate(params.id);
  const { activities: rawActivities, addActivity } = useActivities(params.id, "candidate");
  const { tasks: rawTasks, addTask, toggleTask, deleteTask } = useTasks(params.id, "candidate");
  const { workHistory } = useWorkHistory(params.id);
  const { educationList } = useEducation(params.id);
  const { messages: emailMessages } = useEmailTimeline(params.id);
  const { hasConflict: hasEmailConflict } = useEmailConflicts(params.id);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [mainTab, setMainTab]         = useState<MainTab>("activity");
  const [composeOpen, setComposeOpen]     = useState(false);
  const [submitOpen, setSubmitOpen]       = useState(false);
  const [scheduleOpen, setScheduleOpen]   = useState(false);
  const [aiOpen, setAiOpen]               = useState(false);
  const [brandedPackOpen, setBrandedPackOpen] = useState(false);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (notFound || !candidate) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Candidate not found. <Link href="/candidates" className="text-brand-600 hover:underline">← Back</Link></p>
      </div>
    );
  }

  const applications: { id: string; jobId: string; status: string }[] = [];
  const openTaskCount = tasks.filter((t) => t.status === "open").length;

  // Sync TaskRecord[] from hook → Task[] for TaskPanel UI type
  useEffect(() => {
    setTasks(rawTasks.map((r: TaskRecord): Task => ({
      id:          r.id,
      title:       r.title,
      priority:    r.priority as TaskPriority,
      status:      r.status as Task["status"],
      dueDate:     r.dueDate,
      assigneeId:  r.assigneeId,
      assigneeName: r.assigneeName,
      entityType:  r.entityType as Task["entityType"],
      entityId:    r.entityId,
      createdAt:   r.createdAt,
    })));
  }, [rawTasks]);

  async function handleAddNote(text: string) {
    const result = await addActivity("note", text);
    if (result) {
      toast.success("Note saved");
    } else {
      toast.error("Failed to save note");
    }
  }

  // Map ActivityRecord (DB shape) → Activity (UI type) for the timeline component
  const activities: Activity[] = rawActivities.map((r: ActivityRecord): Activity => ({
    id:         r.id,
    entityType: r.entityType as Activity["entityType"],
    entityId:   r.entityId,
    actorId:    r.actorId ?? "system",
    type:       r.action as Activity["type"],
    summary:    r.summary,
    metadata:   r.metadata,
    createdAt:  r.createdAt,
  }));

  const loc         = candidate.location;
  const locationStr = [loc?.city, loc?.state].filter(Boolean).join(", ");

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <div className="shrink-0 border-b border-border bg-card px-6 py-3">
        <Link href="/candidates" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground w-fit transition-colors">
          <ChevronLeft className="h-3.5 w-3.5" />All Candidates
        </Link>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Sidebar ── */}
        <div className="w-72 shrink-0 overflow-y-auto border-r border-border bg-card p-5 space-y-5">

          <div className="flex flex-col items-center text-center gap-2">
            <div className={cn("flex h-16 w-16 items-center justify-center rounded-full text-xl font-bold text-white", generateAvatarColor(candidate.id))}>
              {getInitials(candidate.fullName)}
            </div>
            <div>
              <h1 className="text-base font-bold text-foreground">{candidate.fullName}</h1>
              <p className="text-sm text-muted-foreground">{candidate.currentTitle}</p>
              <p className="text-xs text-muted-foreground">{candidate.currentCompany}</p>
            </div>
            <span className={cn("rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", STATUS_COLORS[candidate.status])}>
              {STATUS_LABELS[candidate.status]}
            </span>
            {/* US-422: AI transparency badge — opens decision log for this candidate */}
            <div className="ml-auto">
              <AiAssistedBadge candidateId={candidate.id} />
            </div>
          </div>

          {/* Contact */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Contact</p>
            <a href={`mailto:${candidate.email}`} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <Mail className="h-3.5 w-3.5 shrink-0 text-brand-500" /><span className="truncate">{candidate.email}</span>
            </a>
            {candidate.phone && (
              <a href={`tel:${candidate.phone}`} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <Phone className="h-3.5 w-3.5 shrink-0 text-green-500" />{candidate.phone}
              </a>
            )}
            {locationStr && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-rose-400" />{locationStr}
                {candidate.openToRemote && <span className="ml-1 text-emerald-600">· Remote OK</span>}
              </div>
            )}
            {candidate.linkedinUrl && (
              <a href={candidate.linkedinUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <Linkedin className="h-3.5 w-3.5 shrink-0 text-brand-600" />LinkedIn profile
              </a>
            )}
          </div>

          {/* Compensation */}
          {(candidate.currentSalary || candidate.desiredSalary) && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Compensation</p>
              {candidate.currentSalary && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Current</span>
                  <span className="font-medium text-foreground">{formatSalary(candidate.currentSalary, candidate.salaryCurrency ?? "USD", true)}</span>
                </div>
              )}
              {candidate.desiredSalary && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Desired</span>
                  <span className="font-medium text-foreground">{formatSalary(candidate.desiredSalary, candidate.salaryCurrency ?? "USD", true)}</span>
                </div>
              )}
            </div>
          )}

          {/* Skills */}
          {candidate.skills.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Skills</p>
                <NormaliseSkillsButton candidateId={params.id} />
              </div>
              <div className="flex flex-wrap gap-1">
                {candidate.skills.map((cs) => (
                  <span key={cs.skillId} className="rounded-md bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">
                    {cs.skill.name}{cs.yearsExperience ? ` · ${cs.yearsExperience}y` : ""}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Tags */}
          <TagEditor candidateId={params.id} />

          {/* Details */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Details</p>
            {candidate.source && <div className="flex justify-between text-xs"><span className="text-muted-foreground">Source</span><span className="font-medium text-foreground">{candidate.source}</span></div>}
            {candidate.owner && <div className="flex justify-between text-xs"><span className="text-muted-foreground">Owner</span><span className="font-medium text-foreground">{candidate.owner.fullName}</span></div>}
          </div>

          {/* Custom fields */}
          <CustomFieldsPanel entity="candidate" recordId={params.id} />

          {/* Privacy & Consent — US-344 */}
          <ConsentPanel candidateId={params.id} />

          {/* Matching Jobs — US-382 */}
          <MatchingJobsPanel candidateId={params.id} />

          {/* Candidate Portal — US-240/242 */}
          <CandidatePortalPanel candidateId={params.id} />

          {/* Actions */}
          <div className="space-y-2 pt-1">
            <button
              onClick={() => setSubmitOpen(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-md bg-brand-600 py-2 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
            >
              <Send className="h-3.5 w-3.5" />Submit to Client
            </button>
            <button
              onClick={() => setScheduleOpen(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
            >
              <Calendar className="h-3.5 w-3.5" />Schedule Interview
            </button>
            <button
              onClick={() => setComposeOpen(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border py-2 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
            >
              <Mail className="h-3.5 w-3.5" />Send Email
            </button>
            <button
              onClick={() => setBrandedPackOpen(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border py-2 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
            >
              <FileText className="h-3.5 w-3.5" />Branded Pack
            </button>
            <button
              onClick={() => setAiOpen(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-brand-200 bg-gradient-to-r from-brand-50 to-violet-50 py-2 text-xs font-semibold text-brand-700 hover:from-brand-100 hover:to-violet-100 transition-colors"
            >
              <Sparkles className="h-3.5 w-3.5" />AI Copilot
            </button>
          </div>
        </div>

        {/* ── Main ── */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* No persistent header strip — pipeline content lives in the Pipeline tab */}

          {/* Email conflict banner */}
          {hasEmailConflict && (
            <div className="shrink-0 flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-5 py-2">
              <Mail className="h-4 w-4 text-amber-600 shrink-0" />
              <p className="text-xs text-amber-800">
                Some messages on this profile may belong to another candidate.{" "}
                <a href="/integrations/email/review" className="font-semibold text-amber-900 underline hover:no-underline">
                  Review &rarr;
                </a>
              </p>
            </div>
          )}

          {/* Tab bar */}
          <div className="shrink-0 flex gap-0 border-b border-border bg-card px-5">
            {MAIN_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setMainTab(tab)}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
                  mainTab === tab ? "border-brand-600 text-brand-600" : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {tab === "activity"   && "Activity"}
                {tab === "pipeline"   && <><Kanban className="h-3.5 w-3.5" />Pipeline</>}
                {tab === "resume"     && <><FileText className="h-3.5 w-3.5" />Resume</>}
                {tab === "tasks"      && (
                  <>Tasks{openTaskCount > 0 && <span className="rounded-full bg-brand-100 px-1.5 text-[10px] font-bold text-brand-700">{openTaskCount}</span>}</>
                )}
                {tab === "scorecards" && <><Star className="h-3.5 w-3.5" />Scorecards</>}
                {tab === "offers"     && <><FileSignature className="h-3.5 w-3.5" />Offers</>}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-6">
            {mainTab === "activity" && (
              <div className="rounded-xl border border-border bg-card">
                <div className="border-b border-border px-4 py-3">
                  <h2 className="text-sm font-semibold text-foreground">Activity Timeline</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">All touchpoints, notes, and stage changes</p>
                </div>
                <div className="p-4">
                  <ActivityTimeline
                    activities={activities}
                    onAddNote={handleAddNote}
                    draftKey={candidate.id}
                    emailMessages={emailMessages.map((m) => ({
                      id: m.id,
                      threadId: m.threadId,
                      provider: "google" as const, // TODO: derive from message metadata
                      direction: m.direction,
                      from: m.from,
                      to: m.to,
                      cc: m.cc,
                      subject: m.subject,
                      snippet: m.snippet,
                      timestamp: m.timestamp,
                      matchStrategy: "exact" as const, // TODO: derive from link
                      matchConfidence: 1.0,
                      threadMessageCount: 1,
                    }))}
                  />
                </div>
              </div>
            )}

            {mainTab === "pipeline" && (
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="mb-4 border-b border-border pb-3 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">Active Searches</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">Current position across all open jobs</p>
                  </div>
                </div>
                {/* Pipeline entries will populate from useApplications hook when wired */}
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Kanban className="h-8 w-8 text-muted-foreground/30 mb-3" />
                  <p className="text-sm font-medium text-foreground">Not in any active search</p>
                  <p className="mt-1 text-xs text-muted-foreground max-w-xs">
                    Submit this candidate to a job to track their pipeline position here.
                  </p>
                  <button
                    onClick={() => setSubmitOpen(true)}
                    className="mt-4 flex items-center gap-1.5 rounded-md bg-brand-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
                  >
                    <Send className="h-3.5 w-3.5" />Submit to Client
                  </button>
                </div>
              </div>
            )}

            {mainTab === "resume" && (
              <ResumeViewer
                candidate={candidate}
                work={workHistory.map((r) => ({
                  id:       r.id,
                  company:  r.company,
                  title:    r.title,
                  start:    r.startDate,
                  end:      r.endDate ?? undefined,
                  location: r.location ?? undefined,
                  bullets:  r.bullets,
                }))}
                education={educationList.map((r) => ({
                  id:     r.id,
                  school: r.school,
                  degree: r.degree,
                  field:  r.field,
                  year:   r.gradYear,
                }))}
              />
            )}

            {mainTab === "tasks" && (
              <div className="rounded-xl border border-border bg-card p-5">
                <TaskPanel
                  tasks={tasks}
                  entityId={candidate.id}
                  entityType="candidate"
                  onTasksChange={setTasks}
                  onAddTask={(input) => addTask(input) as Promise<Task | null>}
                  onToggleTask={toggleTask}
                  onDeleteTask={deleteTask}
                />
              </div>
            )}

            {mainTab === "scorecards" && (
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="mb-4 border-b border-border pb-3">
                  <h2 className="text-sm font-semibold text-foreground">Interview Scorecards</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">Structured ratings from interviewers</p>
                </div>
                <ScorecardPanel candidateId={params.id} />
              </div>
            )}

            {mainTab === "offers" && (
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="mb-4 border-b border-border pb-3">
                  <h2 className="text-sm font-semibold text-foreground">Offer Letters</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">Generate, approve, and send offer letters</p>
                </div>
                <OfferLetterPanel
                  candidateId={params.id}
                  candidateName={candidate.fullName}
                />
              </div>
            )}
          </div>
        </div>

        {/* ── AI Copilot drawer ── */}
        {aiOpen && (
          <div className="w-96 shrink-0 border-l border-border overflow-hidden bg-card flex flex-col">
            <AICopilot
              candidate={{
                id: candidate.id,
                fullName: candidate.fullName,
                currentTitle: candidate.currentTitle,
                currentCompany: candidate.currentCompany,
                skills: candidate.skills?.map((cs: { skill: { name: string } }) => cs.skill.name) ?? [],
                location: [candidate.location?.city, candidate.location?.state].filter(Boolean).join(", "),
                yearsExperience: candidate.yearsExperience,
                summary: candidate.summary,
              }}
              onClose={() => setAiOpen(false)}
            />
          </div>
        )}
      </div>

      {/* Email compose */}
      {composeOpen && (
        <EmailComposeModal
          to={candidate.email ? [{ name: candidate.fullName, email: candidate.email }] : []}
          onClose={() => setComposeOpen(false)}
        />
      )}

      {/* Submit to client */}
      {submitOpen && (
        <SubmitToClientModal
          candidate={candidate}
          onClose={() => setSubmitOpen(false)}
        />
      )}

      {/* Schedule interview */}
      {scheduleOpen && (
        <ScheduleInterviewModal
          candidate={candidate}
          defaultJobId={applications[0]?.jobId}
          onClose={() => setScheduleOpen(false)}
        />
      )}

      {/* Branded submission pack */}
      {brandedPackOpen && (
        <BrandedResumeModal
          candidate={{
            id:              candidate.id,
            firstName:       candidate.firstName,
            lastName:        candidate.lastName,
            email:           candidate.email,
            phone:           candidate.phone ?? undefined,
            location:        candidate.location ? [candidate.location.city, candidate.location.state].filter(Boolean).join(", ") : undefined,
            currentTitle:    candidate.currentTitle ?? undefined,
            currentCompany:  candidate.currentCompany ?? undefined,
            linkedinUrl:     candidate.linkedinUrl ?? undefined,
            summary:         candidate.summary ?? undefined,
            skills:          Array.isArray(candidate.skills) ? candidate.skills.map((s: string | { skill: string }) => typeof s === "string" ? s : s.skill) : undefined,
          } satisfies ResumeCandidate}
          onClose={() => setBrandedPackOpen(false)}
        />
      )}
    </div>
  );
}
