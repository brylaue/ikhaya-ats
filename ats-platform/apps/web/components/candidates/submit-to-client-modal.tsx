"use client";

import { useState, useEffect } from "react";
import {
  X, Send, ChevronRight, Check, Briefcase, Building2,
  User, Star, AlertCircle, ArrowRight, FileText, Sparkles, Loader2,
} from "lucide-react";
import { useJobs, useOffLimitsRules } from "@/lib/supabase/hooks";
import { createClient } from "@/lib/supabase/client";
import { cn, generateAvatarColor, getInitials, JOB_PRIORITY_COLORS } from "@/lib/utils";
import { toast } from "sonner";
import { useAutoSave } from "@/hooks/use-auto-save";
import { SaveIndicator } from "@/components/ui/save-indicator";
import type { Candidate, Job } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SubmitToClientModalProps {
  candidate: Candidate;
  onClose: () => void;
  onSubmitted?: () => void;
}

// ─── Step 1: Job selector ─────────────────────────────────────────────────────

function JobSelector({
  candidate,
  selectedJobId,
  onSelect,
  jobs,
  jobsLoading,
  alreadySubmitted,
}: {
  candidate: Candidate;
  selectedJobId: string | null;
  onSelect: (id: string) => void;
  jobs: (Job & { companyName?: string; candidateCount?: number })[];
  jobsLoading: boolean;
  alreadySubmitted: Set<string>;
}) {
  const eligibleJobs = jobs.filter((j) => j.status === "active");

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Select a search</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Choose which active search to submit {candidate.firstName} for.
        </p>
      </div>

      {jobsLoading ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <Briefcase className="h-10 w-10 text-muted-foreground mb-3 animate-pulse" />
          <p className="text-sm text-muted-foreground">Loading searches…</p>
        </div>
      ) : eligibleJobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <Briefcase className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm font-medium text-foreground">No active searches</p>
          <p className="text-xs text-muted-foreground">Create a job first before submitting candidates.</p>
        </div>
      ) : (
        <ul className="space-y-2 max-h-72 overflow-y-auto">
          {eligibleJobs.map((job) => {
            const isSelected  = selectedJobId === job.id;
            const isSubmitted = alreadySubmitted.has(job.id);
            return (
              <li key={job.id}>
                <button
                  onClick={() => !isSubmitted && onSelect(job.id)}
                  disabled={isSubmitted}
                  className={cn(
                    "w-full flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all",
                    isSelected  ? "border-brand-400 bg-brand-50 shadow-sm" :
                    isSubmitted ? "border-border bg-accent/30 opacity-60 cursor-not-allowed" :
                                  "border-border bg-card hover:border-brand-200 hover:bg-accent/20"
                  )}
                >
                  {/* Job avatar */}
                  <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white", generateAvatarColor(job.clientId))}>
                    {getInitials(job.companyName ?? "")}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs font-semibold text-foreground">{job.title}</p>
                      <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-semibold", JOB_PRIORITY_COLORS[job.priority])}>
                        {job.priority}
                      </span>
                      {isSubmitted && (
                        <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700">
                          Already submitted
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{job.companyName}</p>
                    <p className="text-[10px] text-muted-foreground">{job.location ?? "Remote"}</p>
                  </div>

                  {isSelected && (
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-600">
                      <Check className="h-3 w-3 text-white" />
                    </div>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─── Step 2: Cover note ───────────────────────────────────────────────────────

const NOTE_TEMPLATES = [
  {
    label: "Standard submission",
    text: (firstName: string) =>
      `I'm pleased to present ${firstName} for your consideration. Based on their background and track record, I believe they are an excellent fit for this role.\n\nKey highlights:\n• [Add key differentiator 1]\n• [Add key differentiator 2]\n• [Cultural fit note]\n\n${firstName} is actively exploring new opportunities and has confirmed strong interest in this position. I'm happy to arrange an introduction call at your convenience.`,
  },
  {
    label: "Executive search",
    text: (firstName: string) =>
      `${firstName} is a high-caliber executive leader with a proven track record of [achievement]. I am recommending them with full confidence.\n\nStrengths relevant to this role:\n• Strategic leadership: [example]\n• Operational excellence: [example]\n• Team building: [example]\n\nAvailability: [timeline]. Compensation expectations: [range].\n\nPlease let me know if you'd like me to arrange a confidential introduction.`,
  },
  {
    label: "Technical role",
    text: (firstName: string) =>
      `${firstName} is a strong technical candidate with deep expertise in [tech stack]. Their profile stands out for:\n\n• ${firstName} has [X] years of hands-on experience with [key tech]\n• Led [relevant project / team at previous company]\n• [Notable achievement]\n\nThey're open to a technical screen at short notice. Happy to share their GitHub / portfolio on request.`,
  },
];

function CoverNoteStep({
  candidate,
  jobTitle,
  note,
  onNoteChange,
  highlights,
  onHighlightsChange,
  draftKey,
}: {
  candidate: Candidate;
  jobTitle: string;
  note: string;
  onNoteChange: (v: string) => void;
  highlights: string[];
  onHighlightsChange: (v: string[]) => void;
  draftKey: string;
}) {
  const [showTemplates, setShowTemplates] = useState(false);
  const [newHighlight, setNewHighlight]  = useState("");

  // Auto-save cover note draft
  const { status: saveStatus } = useAutoSave({ key: draftKey, value: note, debounceMs: 600 });

  function addHighlight() {
    if (newHighlight.trim()) {
      onHighlightsChange([...highlights, newHighlight.trim()]);
      setNewHighlight("");
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Cover note to client</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          This note will appear alongside {candidate.firstName}'s profile in the client portal.
        </p>
      </div>

      {/* Template picker */}
      <div className="relative">
        <button
          onClick={() => setShowTemplates((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:underline"
        >
          <Sparkles className="h-3.5 w-3.5" />Use a template
          <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", showTemplates && "rotate-90")} />
        </button>
        {showTemplates && (
          <div className="absolute top-full left-0 z-10 mt-1 w-64 rounded-xl border border-border bg-card shadow-lg overflow-hidden">
            {NOTE_TEMPLATES.map((t) => (
              <button
                key={t.label}
                onClick={() => { onNoteChange(t.text(candidate.firstName)); setShowTemplates(false); }}
                className="w-full px-4 py-2.5 text-left text-xs font-medium text-foreground hover:bg-accent transition-colors"
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Note textarea with inline save indicator */}
      <div className="relative">
        <textarea
          value={note}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onNoteChange(e.target.value)}
          rows={8}
          placeholder={`Write a personalized note about why ${candidate.firstName} is a great fit for ${jobTitle}…`}
          className="w-full resize-none rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-brand-500 transition-colors"
        />
        <div className="absolute bottom-2.5 right-3">
          <SaveIndicator status={saveStatus} />
        </div>
      </div>

      {/* Key highlights */}
      <div>
        <p className="text-xs font-semibold text-foreground mb-2">Key highlights (optional)</p>
        <p className="text-[10px] text-muted-foreground mb-2">These appear as bullet points at the top of the submission.</p>

        <div className="space-y-1.5 mb-2">
          {highlights.map((h, i) => (
            <div key={i} className="flex items-center gap-2">
              <Star className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              <span className="flex-1 text-xs text-foreground">{h}</span>
              <button
                onClick={() => onHighlightsChange(highlights.filter((_, idx) => idx !== i))}
                className="text-muted-foreground hover:text-red-500 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        {highlights.length < 5 && (
          <div className="flex gap-2">
            <input
              value={newHighlight}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewHighlight(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addHighlight(); } }}
              placeholder="Add a highlight…"
              className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-brand-500"
            />
            <button
              onClick={addHighlight}
              disabled={!newHighlight.trim()}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-40 transition-colors"
            >
              Add
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Step 3: Review ───────────────────────────────────────────────────────────

function ReviewStep({
  candidate,
  job,
  note,
  highlights,
}: {
  candidate: Candidate;
  job: Job & { companyName?: string; candidateCount?: number };
  note: string;
  highlights: string[];
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Review submission</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Check the details before sending to {job.companyName}.
        </p>
      </div>

      {/* Candidate card */}
      <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white", generateAvatarColor(candidate.id))}>
          {getInitials(candidate.fullName)}
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">{candidate.fullName}</p>
          <p className="text-xs text-muted-foreground">{candidate.currentTitle ?? "—"} · {candidate.currentCompany ?? "—"}</p>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground mx-2" />
        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white", generateAvatarColor(job.clientId))}>
          {getInitials(job.companyName ?? "")}
        </div>
        <div>
          <p className="text-xs font-semibold text-foreground">{job.title}</p>
          <p className="text-[10px] text-muted-foreground">{job.companyName}</p>
        </div>
      </div>

      {/* Highlights */}
      {highlights.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Key Highlights</p>
          <ul className="space-y-1.5">
            {highlights.map((h, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-foreground">
                <Star className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />{h}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Cover note preview */}
      {note && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Cover Note</p>
          <p className="whitespace-pre-wrap text-xs text-foreground leading-relaxed">{note}</p>
        </div>
      )}

      {!note && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/50 p-3.5">
          <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
          <p className="text-xs text-amber-700">
            No cover note added. Submissions with personalized notes get 3× faster client response.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

type SubmitStep = "job" | "note" | "review";

const STEPS: { id: SubmitStep; label: string; icon: React.ElementType }[] = [
  { id: "job",    label: "Choose search", icon: Briefcase  },
  { id: "note",   label: "Cover note",    icon: FileText   },
  { id: "review", label: "Review",        icon: Check      },
];

function StepBar({ current }: { current: SubmitStep }) {
  const idx = STEPS.findIndex((s) => s.id === current);
  return (
    <div className="flex items-center gap-0">
      {STEPS.map((step, i) => {
        const Icon = step.icon;
        return (
          <div key={step.id} className="flex items-center">
            <div className="flex items-center gap-1.5">
              <div className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full",
                i < idx  ? "bg-emerald-500" :
                i === idx ? "bg-brand-600" :
                            "bg-muted"
              )}>
                {i < idx
                  ? <Check className="h-3 w-3 text-white" />
                  : <Icon className={cn("h-3 w-3", i === idx ? "text-white" : "text-muted-foreground")} />
                }
              </div>
              <span className={cn("text-xs font-medium", i === idx ? "text-foreground" : "text-muted-foreground")}>
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={cn("mx-2 h-px w-6", i < idx ? "bg-emerald-400" : "bg-border")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

const COVER_NOTE_DRAFT_KEY = (candidateId: string) => `cover-note-draft-${candidateId}`;

export function SubmitToClientModal({ candidate, onClose, onSubmitted }: SubmitToClientModalProps) {
  const [step, setStep]               = useState<SubmitStep>("job");
  const [selectedJobId, setJobId]     = useState<string | null>(null);
  const [note, setNote]               = useState("");
  const [highlights, setHighlights]   = useState<string[]>([]);
  const [submitting, setSubmitting]   = useState(false);
  const [done, setDone]               = useState(false);
  const [existingJobIds, setExistingJobIds] = useState<Set<string>>(new Set());

  const { jobs, loading: jobsLoading } = useJobs();
  const { isOffLimits } = useOffLimitsRules();
  const selectedJob = jobs.find((j) => j.id === selectedJobId);

  // Check if candidate is off-limits for the selected job's client
  const offLimitsRule = selectedJob
    ? isOffLimits(candidate.id, selectedJob.clientId)
    : undefined;

  const draftKey = COVER_NOTE_DRAFT_KEY(candidate.id);

  // Restore cover note draft on mount + fetch existing pipeline entries for this candidate
  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) setNote(JSON.parse(saved) as string);
    } catch { /* no-op */ }

    // Find which jobs this candidate is already in the pipeline for
    const fetchExisting = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("candidate_pipeline_entries")
        .select("job_id")
        .eq("candidate_id", candidate.id)
        .eq("status", "active");
      if (data) {
        setExistingJobIds(new Set(data.map((r: { job_id: string }) => r.job_id)));
      }
    };
    fetchExisting();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleNext() {
    if (step === "job")    setStep("note");
    if (step === "note")   setStep("review");
    if (step === "review") handleSubmit();
  }

  function handleBack() {
    if (step === "note")   setStep("job");
    if (step === "review") setStep("note");
  }

  async function handleSubmit() {
    if (!selectedJob) return;
    setSubmitting(true);
    try {
      const supabase = createClient();

      // Get auth user + agency_id
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data: userRow } = await supabase
        .from("users")
        .select("agency_id")
        .eq("id", user.id)
        .single();
      if (!userRow?.agency_id) throw new Error("No agency");

      // Find or create a pipeline entry for this candidate → job
      // Get the first pipeline stage for this job (the "submitted" stage or stage at position 1)
      const { data: stages } = await supabase
        .from("pipeline_stages")
        .select("id, position")
        .eq("job_id", selectedJob.id)
        .order("position")
        .limit(1);
      const firstStageId = stages?.[0]?.id;
      if (!firstStageId) throw new Error("No pipeline stages found for this job");

      // Upsert the pipeline entry (ignore if already exists)
      const { error: entryErr } = await supabase
        .from("candidate_pipeline_entries")
        .upsert(
          {
            agency_id:        userRow.agency_id,
            job_id:           selectedJob.id,
            candidate_id:     candidate.id,
            stage_id:         firstStageId,
            status:           "active",
            entered_stage_at: new Date().toISOString(),
          },
          { onConflict: "candidate_id,job_id", ignoreDuplicates: false }
        );
      if (entryErr) throw entryErr;

      // Log submission activity on the candidate
      const submissionSummary = `Submitted to ${selectedJob.companyName ?? "client"} for ${selectedJob.title}`;
      await supabase.from("activities").insert({
        agency_id:   userRow.agency_id,
        entity_type: "candidate",
        entity_id:   candidate.id,
        actor_id:    user.id,
        action:      "submission",
        metadata:    {
          summary:       submissionSummary,
          jobId:         selectedJob.id,
          jobTitle:      selectedJob.title,
          companyName:   selectedJob.companyName,
          coverNote:     note || null,
          highlights:    highlights.length > 0 ? highlights : null,
        },
      });

      // Clear draft
      try { localStorage.removeItem(draftKey); } catch { /* no-op */ }

      setDone(true);
      toast.success(`${candidate.firstName} submitted to ${selectedJob.companyName ?? "client"}`);
      onSubmitted?.();
      setTimeout(onClose, 800);
    } catch (err) {
      console.error(err);
      toast.error("Submission failed — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  const canAdvance =
    step === "job"    ? !!selectedJobId :
    step === "note"   ? true :
    step === "review" ? true : false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 flex w-full max-w-xl flex-col rounded-2xl border border-border bg-card shadow-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-100">
              <Send className="h-5 w-5 text-brand-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">Submit to Client</h2>
              <p className="text-[11px] text-muted-foreground">{candidate.firstName} {candidate.lastName}</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Step bar */}
        <div className="shrink-0 border-b border-border px-6 py-3">
          <StepBar current={step} />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === "job" && (
            <JobSelector candidate={candidate} selectedJobId={selectedJobId} onSelect={setJobId} jobs={jobs} jobsLoading={jobsLoading} alreadySubmitted={existingJobIds} />
          )}
          {step === "note" && selectedJob && (
            <CoverNoteStep
              candidate={candidate}
              jobTitle={selectedJob.title}
              note={note}
              onNoteChange={setNote}
              highlights={highlights}
              onHighlightsChange={setHighlights}
              draftKey={draftKey}
            />
          )}
          {step === "review" && selectedJob && (
            <div className="space-y-4">
              {offLimitsRule && (
                <div className="flex items-start gap-2.5 rounded-lg border border-rose-300 bg-rose-50 p-3.5">
                  <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-rose-700">Off-Limits Warning</p>
                    <p className="mt-0.5 text-xs text-rose-600">
                      {candidate.firstName} is marked off-limits
                      {offLimitsRule.companyName ? ` for ${offLimitsRule.companyName}` : " for all clients"}.
                      {offLimitsRule.reason && ` Reason: ${offLimitsRule.reason}`}
                      {offLimitsRule.expiresAt && ` · Expires ${new Date(offLimitsRule.expiresAt).toLocaleDateString()}`}
                    </p>
                    <p className="mt-1 text-xs text-rose-500">You can still proceed, but this submission may violate off-limits terms.</p>
                  </div>
                </div>
              )}
              <ReviewStep candidate={candidate} job={selectedJob} note={note} highlights={highlights} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-between border-t border-border px-6 py-4">
          <button
            onClick={step === "job" ? onClose : handleBack}
            className="flex items-center gap-1.5 rounded-md border border-border px-3.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
          >
            {step === "job" ? "Cancel" : "← Back"}
          </button>
          <button
            onClick={handleNext}
            disabled={!canAdvance || submitting || done}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-4 py-1.5 text-xs font-semibold transition-colors",
              done
                ? "bg-emerald-600 text-white"
                : canAdvance
                ? "bg-brand-600 text-white hover:bg-brand-700"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          >
            {done ? (
              <><Check className="h-3.5 w-3.5" />Submitted!</>
            ) : submitting ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" />Submitting…</>
            ) : step === "review" ? (
              <><Send className="h-3.5 w-3.5" />Submit to Client</>
            ) : (
              <>Next<ArrowRight className="h-3.5 w-3.5" /></>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
