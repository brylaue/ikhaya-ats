"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  ChevronLeft, Settings, ExternalLink, Users, MapPin,
  DollarSign, Calendar, TrendingUp, Plus, Loader2,
  Kanban,
} from "lucide-react";
import { useJob, useCandidates } from "@/lib/supabase/hooks";
import { KanbanBoard } from "@/components/pipeline/kanban-board";
import { ScheduleInterviewModal } from "@/components/pipeline/schedule-interview-modal";
import { CandidateOutreachModal } from "@/components/pipeline/candidate-outreach-modal";
import { ScorecardModal, type Scorecard } from "@/components/pipeline/scorecard-modal";
import { OfferModal, type Offer } from "@/components/pipeline/offer-modal";
import { SubmissionReadinessPanel } from "@/components/pipeline/submission-readiness-panel";
import { InterviewPrepModal } from "@/components/pipeline/interview-prep-modal"; // US-485
import { cn, formatSalaryRange, JOB_PRIORITY_COLORS, getInitials, generateAvatarColor } from "@/lib/utils";
import { toast } from "sonner";
import type { Application, PipelineStage, Candidate } from "@/types";

// ─── Stage type inference ──────────────────────────────────────────────────────

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

// ─── Add to Pipeline Modal ─────────────────────────────────────────────────────

function AddToPipelineModal({
  existingCandidateIds,
  onAdd,
  onClose,
}: {
  existingCandidateIds: string[];
  onAdd: (candidate: Candidate) => void;
  onClose: () => void;
}) {
  const { candidates, loading } = useCandidates();
  const [query, setQuery] = useState("");
  const available = candidates.filter(
    (c) => !existingCandidateIds.includes(c.id) &&
      (c.fullName.toLowerCase().includes(query.toLowerCase()) ||
       (c.currentTitle ?? "").toLowerCase().includes(query.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-card border border-border shadow-2xl overflow-hidden" style={{ maxHeight: "70vh" }}>
        <div className="border-b border-border px-5 py-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Add to Pipeline</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
        </div>
        <div className="px-4 py-3 border-b border-border">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search candidates…"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div className="overflow-y-auto" style={{ maxHeight: "400px" }}>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : available.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Users className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No candidates found</p>
            </div>
          ) : (
            available.map((c) => (
              <button
                key={c.id}
                onClick={() => { onAdd(c); onClose(); }}
                className="flex w-full items-center gap-3 px-4 py-3 border-b border-border text-left hover:bg-accent/50 transition-colors"
              >
                <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white", generateAvatarColor(c.id))}>
                  {getInitials(c.fullName)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{c.fullName}</p>
                  {(c.currentTitle || c.currentCompany) && (
                    <p className="text-xs text-muted-foreground truncate">
                      {[c.currentTitle, c.currentCompany].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function PipelineJobPage({ params }: { params: { jobId: string } }) {
  const { job, stages: rawStages, entries, loading, notFound, moveEntry, addEntry } = useJob(params.jobId);

  const [scheduleApp, setScheduleApp]       = useState<Application | null>(null);
  const [outreachApp, setOutreachApp]       = useState<Application | null>(null);
  const [scorecardApp, setScorecardApp]     = useState<Application | null>(null);
  const [offerApp, setOfferApp]             = useState<Application | null>(null);
  const [readinessApp, setReadinessApp]     = useState<Application | null>(null);
  const [prepApp,      setPrepApp]          = useState<Application | null>(null); // US-485
  const [scorecards, setScorecards]         = useState<Record<string, Scorecard>>({});
  const [offers, setOffers]                 = useState<Record<string, Offer>>({});
  const [showAdd, setShowAdd]               = useState(false);

  // Build PipelineStage objects
  const stages: PipelineStage[] = useMemo(() => {
    if (rawStages.length === 0) {
      return [
        { id: "sourced",   name: "Sourced",      type: "sourced",       order: 0, pipelineId: params.jobId, color: "#94a3b8" },
        { id: "screened",  name: "Screened",      type: "screened",      order: 1, pipelineId: params.jobId, color: "#60a5fa" },
        { id: "submitted", name: "Submitted",     type: "submitted",     order: 2, pipelineId: params.jobId, color: "#818cf8" },
        { id: "cr",        name: "Client Review", type: "client_review", order: 3, pipelineId: params.jobId, color: "#a78bfa" },
        { id: "interview", name: "Interview",     type: "interview",     order: 4, pipelineId: params.jobId, color: "#34d399" },
        { id: "offer",     name: "Offer",         type: "offer",         order: 5, pipelineId: params.jobId, color: "#fbbf24" },
        { id: "placed",    name: "Placed",        type: "placed",        order: 6, pipelineId: params.jobId, color: "#10b981" },
      ];
    }
    return rawStages.map((s) => ({
      id:         s.id,
      name:       s.name,
      type:       inferStageType(s.name),
      order:      s.position,
      pipelineId: params.jobId,
      color:      s.color ?? "#94a3b8",
    }));
  }, [rawStages, params.jobId]);

  // Build Application objects from pipeline entries
  const applications: Application[] = useMemo(() =>
    entries.map((e) => {
      const enteredAt = e.enteredStageAt ?? new Date().toISOString();
      const daysInStage = Math.floor((Date.now() - new Date(enteredAt).getTime()) / 86_400_000);
      return {
        id:             e.id,
        candidateId:    e.candidateId,
        jobId:          params.jobId,
        stageId:        e.stageId,
        status:         "identified" as const,
        appliedAt:      enteredAt,
        lastActivityAt: enteredAt,
        daysInStage,
        candidate:      e.candidate,
      };
    }),
    [entries, params.jobId]
  );

  const scorecardedAppIds = useMemo(() => new Set(Object.keys(scorecards)), [scorecards]);
  const placedAppIds      = useMemo(() =>
    new Set(applications.filter((a) => {
      const stage = stages.find((s) => s.id === a.stageId);
      return stage?.type === "placed";
    }).map((a) => a.id)),
    [applications, stages]
  );

  async function handleStageChange(appId: string, newStageId: string) {
    await moveEntry(appId, newStageId);
  }

  async function handleAddCandidate(candidate: Candidate) {
    const firstStage = stages[0];
    if (!firstStage) return;
    const entry = await addEntry(candidate.id, firstStage.id);
    if (entry) toast.success(`${candidate.fullName} added to pipeline`);
    else toast.error("Failed to add candidate");
  }

  // US-027: open readiness checklist first; only portal-submit after it's cleared
  function handleSubmitToPortal(appId: string) {
    const app = applications.find((a) => a.id === appId);
    if (app) setReadinessApp(app);
  }

  async function doPortalSubmit(appId: string) {
    const portalStage = stages.find((s) =>
      s.type === "client_review" || s.name.toLowerCase().includes("submitted")
    );
    if (portalStage) await moveEntry(appId, portalStage.id);
    const slug = job?.client?.portalSlug ?? "";
    if (slug) window.open(`/portal/${slug}`, "_blank");
    toast.success("Candidate submitted to client portal");
    setReadinessApp(null);
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !job) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <Kanban className="h-10 w-10 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">Search not found</p>
        <Link href="/pipeline" className="text-xs text-brand-600 hover:underline">Back to Pipeline</Link>
      </div>
    );
  }

  const daysOpen = Math.floor((Date.now() - new Date(job.createdAt).getTime()) / 86_400_000);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-border bg-card px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Link
                href="/pipeline"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronLeft className="h-3.5 w-3.5" />Pipeline
              </Link>
              <span className="text-muted-foreground/40 text-xs">/</span>
              <span className="text-xs text-foreground font-medium">{job.title}</span>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-foreground leading-tight">{job.title}</h1>
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", JOB_PRIORITY_COLORS[job.priority])}>
                {job.priority}
              </span>
              <span className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                job.status === "active"
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-slate-100 text-slate-600"
              )}>
                {job.status}
              </span>
            </div>

            <div className="mt-2 flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
              {job.client?.name && (
                <span className="flex items-center gap-1">
                  <div className={cn("flex h-4 w-4 items-center justify-center rounded text-[8px] font-bold text-white", generateAvatarColor(job.clientId))}>
                    {getInitials(job.client.name)}
                  </div>
                  {job.client.name}
                </span>
              )}
              {job.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />{job.location}
                </span>
              )}
              {(job.salaryMin || job.salaryMax) && (
                <span className="flex items-center gap-1">
                  <DollarSign className="h-3.5 w-3.5" />
                  {/* US-314: use formatSalaryRange — job.salaryMax is a number,
                      not a currency code; passing it as the 2nd arg to
                      formatSalary caused Intl RangeError. */}
                  {formatSalaryRange(job.salaryMin, job.salaryMax, (job as { salaryCurrency?: string }).salaryCurrency ?? "USD")}
                </span>
              )}
              {job.feePct && (
                <span className="flex items-center gap-1">
                  <TrendingUp className="h-3.5 w-3.5" />{job.feePct}% fee
                </span>
              )}
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />Open {daysOpen}d
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />{applications.length} candidates
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {job.client?.portalSlug && (
              <Link
                href={`/portal/${job.client.portalSlug}`}
                target="_blank"
                className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" />Client Portal
              </Link>
            )}
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />Add candidate
            </button>
            <Link
              href={`/jobs/${params.jobId}/settings`}
              className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-accent transition-colors inline-flex"
              title="Job settings"
            >
              <Settings className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>

      {/* Kanban */}
      <div className="flex-1 overflow-hidden">
        <KanbanBoard
          stages={stages}
          applications={applications}
          onSubmitToPortal={handleSubmitToPortal}
          onStageChange={handleStageChange}
          onScheduleInterview={(app) => setScheduleApp(app)}
          onOutreach={(app) => setOutreachApp(app)}
          onScorecard={(app) => setScorecardApp(app)}
          onOffer={(app) => setOfferApp(app)}
          onInterviewPrep={(app) => setPrepApp(app)}
          scorecardedAppIds={scorecardedAppIds}
          placedAppIds={placedAppIds}
        />
      </div>

      {/* Modals */}
      {showAdd && (
        <AddToPipelineModal
          existingCandidateIds={applications.map((a) => a.candidateId)}
          onAdd={handleAddCandidate}
          onClose={() => setShowAdd(false)}
        />
      )}
      {scheduleApp && (
        <ScheduleInterviewModal
          application={scheduleApp}
          jobTitle={job.title}
          clientName={job.client?.name}
          onClose={() => setScheduleApp(null)}
          onScheduled={() => { setScheduleApp(null); toast.success("Interview scheduled"); }}
        />
      )}
      {outreachApp && (
        <CandidateOutreachModal
          application={outreachApp}
          jobTitle={job.title}
          onClose={() => setOutreachApp(null)}
        />
      )}
      {scorecardApp && (
        <ScorecardModal
          application={scorecardApp}
          jobTitle={job.title}
          onClose={() => setScorecardApp(null)}
          onSubmit={(sc) => {
            setScorecards((prev) => ({ ...prev, [scorecardApp.id]: sc }));
            setScorecardApp(null);
            toast.success("Scorecard submitted");
          }}
        />
      )}
      {offerApp && (
        <OfferModal
          application={offerApp}
          jobTitle={job.title}
          clientName={job.client?.name}
          onClose={() => setOfferApp(null)}
          onSubmit={(offer) => {
            setOffers((prev) => ({ ...prev, [offerApp.id]: offer }));
            setOfferApp(null);
            toast.success("Offer recorded");
          }}
        />
      )}

      {/* US-485: Interview Prep */}
      {prepApp && (
        <InterviewPrepModal
          candidateId={prepApp.candidateId}
          candidateName={prepApp.candidate?.fullName}
          jobId={params.jobId}
          jobTitle={job.title}
          onClose={() => setPrepApp(null)}
        />
      )}

      {/* US-027: Submission readiness gate */}
      {readinessApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setReadinessApp(null)}
          />
          <div className="relative w-full max-w-md rounded-2xl bg-card border border-border shadow-2xl overflow-hidden">
            <div className="border-b border-border px-5 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Submission Readiness</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {readinessApp.candidate?.fullName} · {job.title}
                </p>
              </div>
              <button
                onClick={() => setReadinessApp(null)}
                className="text-muted-foreground hover:text-foreground text-xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-5">
              <SubmissionReadinessPanel
                jobId={params.jobId}
                candidateId={readinessApp.candidateId}
                clientId={job.clientId}
                onSubmit={(_blocked) => doPortalSubmit(readinessApp.id)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
