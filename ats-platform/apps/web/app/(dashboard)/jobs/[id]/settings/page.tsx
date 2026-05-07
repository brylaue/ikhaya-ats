"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Check, Loader as Loader2, Trash2, Archive, MapPin, DollarSign, TrendingUp, Globe, TriangleAlert as AlertTriangle, Plus, GripVertical, ChevronUp, ChevronDown, RotateCcw, Pencil, X, ListChecks, Clock, Users } from "lucide-react";
import { useJob, useInterviewPlan } from "@/lib/supabase/hooks";
import { RecruiterAssignmentPanel } from "@/components/jobs/recruiter-assignment-panel";
import { MilestoneBillingPanel } from "@/components/jobs/milestone-billing-panel";
import { ChecklistConfigPanel } from "@/components/pipeline/submission-readiness-panel";
import { BiasCheckPanel } from "@/components/jobs/bias-check-panel";
import type { PipelineStageDb } from "@/lib/supabase/hooks";
import { InterviewPlanModal, type InterviewPlan } from "@/components/jobs/interview-plan-modal";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { JobStatus } from "@/types";

// ─── Preset stage colors ───────────────────────────────────────────────────────

const STAGE_COLORS = [
  "#94a3b8", "#60a5fa", "#818cf8", "#a78bfa", "#f472b6",
  "#fb7185", "#f97316", "#fbbf24", "#a3e635", "#34d399",
  "#10b981", "#059669",
];

// ─── Color picker popover ──────────────────────────────────────────────────────

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="h-6 w-6 rounded-full border-2 border-white shadow ring-1 ring-border transition-transform hover:scale-110"
        style={{ background: value }}
        title="Change color"
      />
      {open && (
        <div className="absolute left-0 top-8 z-50 rounded-xl border border-border bg-card p-2 shadow-xl">
          <div className="grid grid-cols-6 gap-1.5">
            {STAGE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => { onChange(c); setOpen(false); }}
                className={cn(
                  "h-5 w-5 rounded-full border-2 transition-transform hover:scale-110",
                  c === value ? "border-foreground" : "border-transparent"
                )}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Stage row ─────────────────────────────────────────────────────────────────

function StageRow({
  stage,
  isFirst,
  isLast,
  candidateCount,
  onMoveUp,
  onMoveDown,
  onUpdate,
  onDelete,
}: {
  stage: PipelineStageDb;
  isFirst: boolean;
  isLast: boolean;
  candidateCount: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onUpdate: (patch: Partial<Pick<PipelineStageDb, "name" | "color" | "slaDays" | "clientName">>) => void;
  onDelete: () => void;
}) {
  const [editingName, setEditingName]     = useState(false);
  const [editingPortal, setEditingPortal] = useState(false);
  const [nameVal, setNameVal]             = useState(stage.name);
  const [portalVal, setPortalVal]         = useState(stage.clientName ?? stage.name);
  const [slaVal, setSlaVal]               = useState(stage.slaDays != null ? String(stage.slaDays) : "");
  const [confirmDel, setConfirmDel]       = useState(false);

  function commitName() {
    setEditingName(false);
    if (nameVal.trim() && nameVal !== stage.name) onUpdate({ name: nameVal.trim() });
    else setNameVal(stage.name);
  }

  function commitPortal() {
    setEditingPortal(false);
    if (portalVal.trim() && portalVal !== stage.clientName) onUpdate({ clientName: portalVal.trim() });
    else setPortalVal(stage.clientName ?? stage.name);
  }

  function commitSla() {
    const n = slaVal ? parseInt(slaVal) : undefined;
    if (n !== stage.slaDays) onUpdate({ slaDays: n });
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-3">
      {/* Reorder */}
      <div className="flex flex-col gap-0.5">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={isFirst}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-20 transition-colors"
          title="Move up"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={isLast}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-20 transition-colors"
          title="Move down"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Color */}
      <ColorPicker
        value={stage.color ?? "#94a3b8"}
        onChange={(c) => onUpdate({ color: c })}
      />

      {/* Name + portal label */}
      <div className="flex-1 min-w-0">
        {editingName ? (
          <input
            autoFocus
            value={nameVal}
            onChange={(e) => setNameVal(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => { if (e.key === "Enter") commitName(); if (e.key === "Escape") { setEditingName(false); setNameVal(stage.name); } }}
            className="w-full rounded-md border border-brand-400 bg-background px-2 py-0.5 text-sm font-medium text-foreground outline-none focus:ring-2 focus:ring-brand-500"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingName(true)}
            className="group flex items-center gap-1 text-sm font-medium text-foreground hover:text-brand-600 transition-colors"
          >
            {stage.name}
            <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" />
          </button>
        )}

        {/* Portal label */}
        {editingPortal ? (
          <input
            autoFocus
            value={portalVal}
            onChange={(e) => setPortalVal(e.target.value)}
            onBlur={commitPortal}
            onKeyDown={(e) => { if (e.key === "Enter") commitPortal(); if (e.key === "Escape") { setEditingPortal(false); setPortalVal(stage.clientName ?? stage.name); } }}
            className="mt-0.5 w-full rounded border border-brand-300 bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingPortal(true)}
            className="group mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className="text-muted-foreground/60">Portal label:</span>{" "}
            {stage.clientName ?? stage.name}
            <Pencil className="h-2.5 w-2.5 opacity-0 group-hover:opacity-60 transition-opacity" />
          </button>
        )}
      </div>

      {/* SLA days */}
      <div className="flex items-center gap-1 shrink-0">
        <input
          type="number"
          value={slaVal}
          onChange={(e) => setSlaVal(e.target.value)}
          onBlur={commitSla}
          placeholder="SLA"
          min={1}
          className="w-14 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground placeholder-muted-foreground outline-none focus:ring-1 focus:ring-brand-400 text-center"
        />
        <span className="text-[10px] text-muted-foreground">days</span>
      </div>

      {/* Candidate count badge */}
      {candidateCount > 0 && (
        <span className="shrink-0 rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold text-brand-700">
          {candidateCount}
        </span>
      )}

      {/* Delete */}
      {confirmDel ? (
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setConfirmDel(false)}
            className="rounded-md border border-border px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-md bg-red-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-red-700 transition-colors"
          >
            Delete
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            if (candidateCount > 0) {
              toast.error(`Move ${candidateCount} candidate${candidateCount > 1 ? "s" : ""} out of this stage first`);
              return;
            }
            setConfirmDel(true);
          }}
          className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors"
          title="Delete stage"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// ─── Field helpers ─────────────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-foreground">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = "text" }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-brand-500"
    />
  );
}

function Select({ value, onChange, children }: {
  value: string; onChange: (v: string) => void; children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
    >
      {children}
    </select>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function JobSettingsPage() {
  const params = useParams<{ id: string }>();
  const {
    job, stages, entries, loading, notFound,
    updateStage, deleteStage, reorderStages, addStage, resetToDefaultStages,
  } = useJob(params.id);

  const { plan: savedPlan, savePlan } = useInterviewPlan(params.id);
  // Local override layer — shows changes immediately before hook state syncs
  const [localPlan, setLocalPlan]             = useState<InterviewPlan | undefined>(undefined);
  const [showPlanModal, setShowPlanModal]     = useState(false);

  const interviewPlan: InterviewPlan | undefined = localPlan
    ?? (savedPlan ? { jobId: savedPlan.jobId, stages: savedPlan.stages as InterviewPlan["stages"], notes: savedPlan.notes } : undefined);

  // ── Job form state ──────────────────────────────────────────────────────────
  const [title,         setTitle]         = useState("");
  const [status,        setStatus]        = useState<JobStatus>("active");
  const [priority,      setPriority]      = useState<"low"|"medium"|"high"|"urgent">("medium");
  const [location,      setLocation]      = useState("");
  const [remotePolicy,  setRemotePolicy]  = useState("onsite");
  const [jobType,       setJobType]       = useState("permanent");
  const [salaryMin,     setSalaryMin]     = useState("");
  const [salaryMax,     setSalaryMax]     = useState("");
  const [feePct,        setFeePct]        = useState("");
  const [headcount,     setHeadcount]     = useState("1");
  const [portalVisible, setPortalVisible] = useState(true);
  const [description,   setDescription]  = useState("");

  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // ── Intake state ────────────────────────────────────────────────────────────
  const [mustHaveSkills,    setMustHaveSkills]    = useState<string[]>([]);
  const [niceToHaveSkills,  setNiceToHaveSkills]  = useState<string[]>([]);
  const [targetCompanies,   setTargetCompanies]   = useState("");
  const [sourcingNotes,     setSourcingNotes]     = useState("");
  const [hiringManagerName, setHiringManagerName] = useState("");
  const [hiringManagerEmail,setHiringManagerEmail]= useState("");
  const [targetStartDate,   setTargetStartDate]   = useState("");
  const [latestFillDate,    setLatestFillDate]     = useState("");
  const [openReqCount,      setOpenReqCount]       = useState("1");
  const [compApproved,      setCompApproved]       = useState(false);
  const [intakeSkillInput,  setIntakeSkillInput]   = useState<{ must: string; nice: string }>({ must: "", nice: "" });

  // ── Stage state ─────────────────────────────────────────────────────────────
  const [addingStage,    setAddingStage]    = useState(false);
  const [newStageName,   setNewStageName]   = useState("");
  const [confirmReset,   setConfirmReset]   = useState(false);
  const [stagesSaving,   setStagesSaving]   = useState(false);

  // Count candidates per stage
  const candidatesPerStage: Record<string, number> = {};
  entries.forEach((e) => {
    candidatesPerStage[e.stageId] = (candidatesPerStage[e.stageId] ?? 0) + 1;
  });

  // Populate form once job is loaded
  useEffect(() => {
    if (!job) return;
    setTitle(job.title ?? "");
    setStatus((job.status as JobStatus) ?? "active");
    setPriority(job.priority ?? "medium");
    setLocation(job.location ?? "");
    setRemotePolicy((job as any).remotePolicy ?? "onsite");
    setJobType((job as any).jobType ?? "permanent");
    setSalaryMin(job.salaryMin != null ? String(job.salaryMin) : "");
    setSalaryMax(job.salaryMax != null ? String(job.salaryMax) : "");
    setFeePct((job as any).feePct != null ? String((job as any).feePct) : "");
    setHeadcount((job as any).headcount != null ? String((job as any).headcount) : "1");
    setPortalVisible((job as any).portalVisible ?? true);
    setDescription(job.description ?? "");
    // Intake
    const intake = (job as any).intake ?? {};
    setMustHaveSkills(intake.mustHaveSkills ?? []);
    setNiceToHaveSkills(intake.niceToHaveSkills ?? []);
    setTargetCompanies(intake.targetCompanies ?? "");
    setSourcingNotes(intake.sourcingNotes ?? "");
    setHiringManagerName(intake.hiringManagerName ?? "");
    setHiringManagerEmail(intake.hiringManagerEmail ?? "");
    setTargetStartDate(intake.targetStartDate ?? "");
    setLatestFillDate(intake.latestFillDate ?? "");
    setOpenReqCount(intake.openReqCount != null ? String(intake.openReqCount) : "1");
    setCompApproved(intake.compApproved ?? false);
  }, [job]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!title.trim()) { toast.error("Job title is required"); return; }
    setSaving(true);
    try {
      // US-378: detect matching-relevant edits *before* the write so we only
      // trigger a batch rescore when the job's semantic content actually
      // changed. Prevents stray rescores on salary/status/priority edits.
      const prevDescription = job?.description ?? "";
      const prevIntake      = (job as any)?.intake ?? {};
      const descriptionChanged = (description || "") !== prevDescription;
      const mustChanged = JSON.stringify(prevIntake.mustHaveSkills ?? []) !== JSON.stringify(mustHaveSkills);
      const niceChanged = JSON.stringify(prevIntake.niceToHaveSkills ?? []) !== JSON.stringify(niceToHaveSkills);
      const shouldRescore = descriptionChanged || mustChanged || niceChanged;

      const supabase = createClient();
      const { error } = await supabase
        .from("jobs")
        .update({
          title:           title.trim(),
          status,
          priority,
          location:        location || null,
          remote_policy:   remotePolicy,
          employment_type: jobType,
          salary_min:      salaryMin ? parseInt(salaryMin) : null,
          salary_max:      salaryMax ? parseInt(salaryMax) : null,
          fee_pct:         feePct    ? parseFloat(feePct)  : null,
          headcount:       headcount ? parseInt(headcount)  : 1,
          portal_visible:  portalVisible,
          description:     description || null,
          intake: {
            mustHaveSkills, niceToHaveSkills, targetCompanies, sourcingNotes,
            hiringManagerName, hiringManagerEmail,
            targetStartDate: targetStartDate || null,
            latestFillDate:  latestFillDate || null,
            openReqCount:    openReqCount ? parseInt(openReqCount) : 1,
            compApproved,
          },
          updated_at:      new Date().toISOString(),
        })
        .eq("id", params.id);

      if (error) throw error;
      setSaved(true);
      toast.success("Job settings saved");
      setTimeout(() => setSaved(false), 2000);

      // Fire-and-forget — the rescore route enqueues embedding jobs for the
      // cron to work through, so we don't block the save UX on it.
      if (shouldRescore) {
        fetch(`/api/jobs/${params.id}/rescore`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
        })
          .then(async (r) => {
            if (!r.ok) return;
            const body = await r.json().catch(() => ({}));
            if (body?.candidatesQueued > 0) {
              toast.info(`Rescoring ${body.candidatesQueued} candidate${body.candidatesQueued === 1 ? "" : "s"}…`);
            }
          })
          .catch((e) => console.warn("[rescore] request failed:", e));
      }
    } catch (err: any) {
      toast.error("Failed to save: " + (err?.message ?? "Unknown error"));
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    setSaving(true);
    try {
      const supabase = createClient();
      await supabase.from("jobs").update({ status: "on_hold", updated_at: new Date().toISOString() }).eq("id", params.id);
      setStatus("on_hold");
      toast.success("Job archived");
    } catch {
      toast.error("Failed to archive job");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const supabase = createClient();
      await supabase.from("jobs").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", params.id);
      toast.success("Job cancelled");
      window.location.href = "/jobs";
    } catch {
      toast.error("Failed to cancel job");
      setDeleting(false);
    }
  }

  async function handleAddStage() {
    const name = newStageName.trim();
    if (!name) return;
    setStagesSaving(true);
    const result = await addStage(name);
    if (result) toast.success(`Stage "${name}" added`);
    else toast.error("Failed to add stage");
    setNewStageName("");
    setAddingStage(false);
    setStagesSaving(false);
  }

  async function handleUpdateStage(
    stageId: string,
    patch: Partial<Pick<typeof stages[0], "name" | "color" | "slaDays" | "clientName">>
  ) {
    const ok = await updateStage(stageId, patch);
    if (!ok) toast.error("Failed to update stage");
  }

  async function handleDeleteStage(stageId: string) {
    const ok = await deleteStage(stageId);
    if (ok) toast.success("Stage deleted");
    else toast.error("Failed to delete stage");
  }

  // Always operate on a position-sorted snapshot for reordering
  const sortedStages = stages.slice().sort((a, b) => a.position - b.position);

  function handleMoveUp(idx: number) {
    if (idx === 0) return;
    const ids = sortedStages.map((s) => s.id);
    [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]];
    reorderStages(ids);
  }

  function handleMoveDown(idx: number) {
    if (idx === sortedStages.length - 1) return;
    const ids = sortedStages.map((s) => s.id);
    [ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]];
    reorderStages(ids);
  }

  async function handleResetStages() {
    setStagesSaving(true);
    await resetToDefaultStages();
    setConfirmReset(false);
    setStagesSaving(false);
    toast.success("Stages reset to defaults");
  }

  // ── Render guards ────────────────────────────────────────────────────────────

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
        <p className="text-sm font-medium text-foreground">Job not found</p>
        <Link href="/jobs" className="text-xs text-brand-600 hover:underline">Back to Jobs</Link>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href={`/jobs/${params.id}`}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5" />Back to job
            </Link>
            <span className="text-muted-foreground/40">·</span>
            <h1 className="text-sm font-semibold text-foreground">{job.title} — Settings</h1>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold transition-colors",
              saved ? "bg-emerald-600 text-white" : "bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-60"
            )}
          >
            {saving  ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</> :
             saved   ? <><Check   className="h-4 w-4" />Saved!</> :
                        "Save changes"}
          </button>
        </div>
      </div>

      {/* Form */}
      <div className="mx-auto max-w-2xl px-6 py-8 space-y-8">

        {/* Basic info */}
        <section className="space-y-5">
          <div>
            <h2 className="text-base font-semibold text-foreground">Basic Information</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Core details about this search</p>
          </div>

          <Field label="Job title">
            <Input value={title} onChange={setTitle} placeholder="e.g. Senior Software Engineer" />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Status">
              <Select value={status} onChange={(v) => setStatus(v as JobStatus)}>
                <option value="active">Active</option>
                <option value="open">Open</option>
                <option value="on_hold">On hold</option>
                <option value="filled">Filled</option>
                <option value="cancelled">Cancelled</option>
                <option value="draft">Draft</option>
              </Select>
            </Field>
            <Field label="Priority">
              <Select value={priority} onChange={(v) => setPriority(v as typeof priority)}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Job type">
              <Select value={jobType} onChange={setJobType}>
                <option value="permanent">Permanent</option>
                <option value="contract">Contract</option>
                <option value="temp">Temporary</option>
                <option value="interim">Interim</option>
              </Select>
            </Field>
            <Field label="Headcount">
              <Input value={headcount} onChange={setHeadcount} type="number" placeholder="1" />
            </Field>
          </div>
        </section>

        <div className="border-t border-border" />

        {/* Location */}
        <section className="space-y-5">
          <h2 className="text-base font-semibold text-foreground">Location</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Location">
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. New York, NY"
                  className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </Field>
            <Field label="Remote policy">
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <select
                  value={remotePolicy}
                  onChange={(e) => setRemotePolicy(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500 appearance-none"
                >
                  <option value="onsite">On-site</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="remote">Remote</option>
                  <option value="flexible">Flexible</option>
                </select>
              </div>
            </Field>
          </div>
        </section>

        <div className="border-t border-border" />

        {/* Compensation */}
        <section className="space-y-5">
          <h2 className="text-base font-semibold text-foreground">Compensation & Fees</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Salary min (USD)" hint="Annual base salary">
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="number"
                  value={salaryMin}
                  onChange={(e) => setSalaryMin(e.target.value)}
                  placeholder="e.g. 120000"
                  className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </Field>
            <Field label="Salary max (USD)">
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="number"
                  value={salaryMax}
                  onChange={(e) => setSalaryMax(e.target.value)}
                  placeholder="e.g. 160000"
                  className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </Field>
          </div>
          <Field label="Agency fee %" hint="Percentage of first-year salary">
            <div className="relative">
              <TrendingUp className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="number"
                value={feePct}
                onChange={(e) => setFeePct(e.target.value)}
                placeholder="e.g. 20"
                className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </Field>
          {salaryMin && salaryMax && feePct && (
            <div className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-foreground">
              <span className="text-muted-foreground">Estimated fee: </span>
              <span className="font-semibold text-brand-700">
                ${Math.round(((parseInt(salaryMin) + parseInt(salaryMax)) / 2) * (parseFloat(feePct) / 100)).toLocaleString()}
              </span>
              <span className="text-muted-foreground"> at midpoint salary</span>
            </div>
          )}
        </section>

        <div className="border-t border-border" />

        {/* ── Pipeline Stages ───────────────────────────────────────────────── */}
        <section className="space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-foreground">Pipeline Stages</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Customize the stages candidates move through for this search.
                Click a stage name or portal label to rename it inline.
              </p>
            </div>
            {confirmReset ? (
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted-foreground">Reset to defaults?</span>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleResetStages}
                  disabled={stagesSaving}
                  className="flex items-center gap-1 rounded-md bg-amber-500 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-60 transition-colors"
                >
                  {stagesSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                  Reset
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent shrink-0 transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset to defaults
              </button>
            )}
          </div>

          {/* Column header hint */}
          <div className="flex items-center gap-3 px-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">
            <div className="w-8" />
            <div className="w-6" />
            <div className="flex-1">Stage name / portal label</div>
            <div className="w-20 text-center">SLA days</div>
            <div className="w-14" />
          </div>

          {/* Stage list */}
          <div className="space-y-2">
            {stages.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border py-8 text-center">
                <GripVertical className="mx-auto h-6 w-6 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">No stages yet — add one below or reset to defaults.</p>
              </div>
            ) : (
              sortedStages
                .map((stage, idx, arr) => (
                  <StageRow
                    key={stage.id}
                    stage={stage}
                    isFirst={idx === 0}
                    isLast={idx === arr.length - 1}
                    candidateCount={candidatesPerStage[stage.id] ?? 0}
                    onMoveUp={() => handleMoveUp(idx)}
                    onMoveDown={() => handleMoveDown(idx)}
                    onUpdate={(patch) => handleUpdateStage(stage.id, patch)}
                    onDelete={() => handleDeleteStage(stage.id)}
                  />
                ))
            )}
          </div>

          {/* Add stage */}
          {addingStage ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={newStageName}
                onChange={(e) => setNewStageName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddStage();
                  if (e.key === "Escape") { setAddingStage(false); setNewStageName(""); }
                }}
                placeholder="Stage name…"
                className="flex-1 rounded-lg border border-brand-400 bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-brand-500"
              />
              <button
                type="button"
                onClick={handleAddStage}
                disabled={!newStageName.trim() || stagesSaving}
                className="flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                {stagesSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Add
              </button>
              <button
                type="button"
                onClick={() => { setAddingStage(false); setNewStageName(""); }}
                className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddingStage(true)}
              className="flex items-center gap-2 rounded-xl border border-dashed border-border px-4 py-2.5 text-sm font-medium text-muted-foreground hover:border-brand-300 hover:text-brand-600 hover:bg-brand-50/40 transition-all w-full"
            >
              <Plus className="h-4 w-4" />
              Add a stage
            </button>
          )}

          <p className="text-[10px] text-muted-foreground">
            Stage changes save immediately. Stages with candidates cannot be deleted — move candidates first.
          </p>
        </section>

        <div className="border-t border-border" />

        {/* ── Interview Plan ────────────────────────────────────────────────── */}
        <section className="space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-foreground">Interview Plan</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Define the interview stages candidates will progress through for this search.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowPlanModal(true)}
              className="flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 shrink-0 transition-colors"
            >
              <ListChecks className="h-3.5 w-3.5" />
              {interviewPlan ? "Edit plan" : "Create plan"}
            </button>
          </div>

          {interviewPlan && interviewPlan.stages.length > 0 ? (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              {/* Summary bar */}
              <div className="flex items-center gap-5 border-b border-border bg-accent/30 px-4 py-2.5">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                  <span className="font-semibold text-foreground">{interviewPlan.stages.length}</span> stages
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {(() => {
                    const total = interviewPlan.stages.reduce((s, st) => s + st.durationMins, 0);
                    const h = Math.floor(total / 60), m = total % 60;
                    return <><span className="font-semibold text-foreground">{h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ""}` : `${m}m`}</span> total time</>;
                  })()}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="font-semibold text-foreground">
                    {interviewPlan.stages.filter((s) => s.scorecardRequired).length}
                  </span> scorecards
                </div>
              </div>

              {/* Stage list */}
              <div className="divide-y divide-border">
                {interviewPlan.stages.map((stage, idx) => {
                  const FORMAT_LABELS: Record<string, string> = {
                    phone: "Phone", video: "Video", onsite: "On-site",
                    panel: "Panel", assessment: "Assessment", executive: "Executive",
                  };
                  return (
                    <div key={stage.id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[9px] font-bold text-brand-700">
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground leading-tight">{stage.name}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {FORMAT_LABELS[stage.format] ?? stage.format}
                      </span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">{stage.durationMins}m</span>
                      {stage.scorecardRequired && (
                        <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                          Scorecard
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Notes */}
              {interviewPlan.notes && (
                <div className="border-t border-border bg-muted/20 px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Notes</p>
                  <p className="text-xs text-muted-foreground">{interviewPlan.notes}</p>
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowPlanModal(true)}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-8 text-center hover:border-brand-300 hover:bg-brand-50/30 transition-all group"
            >
              <ListChecks className="h-8 w-8 text-muted-foreground/40 group-hover:text-brand-400 transition-colors" />
              <div>
                <p className="text-sm font-medium text-foreground">No interview plan yet</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Click to define stages — phone screens, technical rounds, panels, and more.
                </p>
              </div>
            </button>
          )}
        </section>

        {/* Interview plan modal */}
        {showPlanModal && (
          <InterviewPlanModal
            jobTitle={job.title}
            jobId={params.id}
            existingPlan={interviewPlan}
            onSave={async (plan) => {
              setLocalPlan(plan);
              const ok = await savePlan(plan);
              if (!ok) toast.error("Failed to save interview plan");
              // success toast handled by the modal itself
            }}
            onClose={() => setShowPlanModal(false)}
          />
        )}

        <div className="border-t border-border" />

        {/* Description */}
        <section className="space-y-5">
          <div>
            <h2 className="text-base font-semibold text-foreground">Job Description</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Visible to candidates via the client portal</p>
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={8}
            placeholder="Describe the role, responsibilities, and requirements…"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-brand-500 resize-y"
          />
          {/* US-483: Bias checker */}
          <BiasCheckPanel text={description} />
        </section>

        <div className="border-t border-border" />

        {/* Portal */}
        <section className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Client Portal</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Control visibility for your client</p>
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => setPortalVisible(!portalVisible)}
              className={cn(
                "relative h-5 w-9 rounded-full transition-colors cursor-pointer",
                portalVisible ? "bg-brand-600" : "bg-muted"
              )}
            >
              <div className={cn(
                "absolute top-0.5 h-4 w-4 rounded-full bg-card shadow transition-transform",
                portalVisible ? "translate-x-4" : "translate-x-0.5"
              )} />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Visible in client portal</p>
              <p className="text-xs text-muted-foreground">Clients can see this job and its candidates</p>
            </div>
          </label>
          {job.client?.portalSlug && (
            <a
              href={`/portal/${job.client.portalSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-brand-600 hover:underline"
            >
              View client portal →
            </a>
          )}
        </section>

        <div className="border-t border-border" />

        {/* ── Intake Template ───────────────────────────────────────────── */}
        <section className="space-y-5">
          <div>
            <h2 className="text-base font-semibold text-foreground">Intake Template</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Capture requirements, sourcing strategy, and hiring logistics</p>
          </div>

          {/* Hiring manager */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">Hiring Manager</label>
              <input
                value={hiringManagerName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setHiringManagerName(e.target.value)}
                placeholder="Jane Smith"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">Hiring Manager Email</label>
              <input
                type="email"
                value={hiringManagerEmail}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setHiringManagerEmail(e.target.value)}
                placeholder="jane@company.com"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>

          {/* Headcount + dates + comp */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">Open reqs</label>
              <input
                type="number" min="1"
                value={openReqCount}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setOpenReqCount(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">Target start</label>
              <input
                type="date"
                value={targetStartDate}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTargetStartDate(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">Must-fill by</label>
              <input
                type="date"
                value={latestFillDate}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLatestFillDate(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div className="flex flex-col justify-end">
              <label className="mb-1.5 block text-xs font-medium text-foreground">Comp approved</label>
              <button
                type="button"
                onClick={() => setCompApproved((v) => !v)}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                  compApproved
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : "border-border text-muted-foreground hover:bg-accent"
                )}
              >
                <span className={cn("h-3.5 w-3.5 rounded-full border-2", compApproved ? "border-emerald-500 bg-emerald-500" : "border-muted-foreground")} />
                {compApproved ? "Yes" : "Not yet"}
              </button>
            </div>
          </div>

          {/* Must-have skills */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">Must-have skills / requirements</label>
            <div className="flex gap-2 mb-2">
              <input
                value={intakeSkillInput.must}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setIntakeSkillInput((v) => ({ ...v, must: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && intakeSkillInput.must.trim()) {
                    e.preventDefault();
                    const val = intakeSkillInput.must.trim();
                    if (!mustHaveSkills.includes(val)) setMustHaveSkills((prev) => [...prev, val]);
                    setIntakeSkillInput((v) => ({ ...v, must: "" }));
                  }
                }}
                placeholder="e.g. 5+ yrs React — press Enter"
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            {mustHaveSkills.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {mustHaveSkills.map((s) => (
                  <span key={s} className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2.5 py-0.5 text-xs font-medium text-red-700">
                    {s}
                    <button onClick={() => setMustHaveSkills((prev) => prev.filter((x) => x !== s))} className="hover:opacity-70">
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Nice-to-have skills */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">Nice-to-have skills</label>
            <div className="flex gap-2 mb-2">
              <input
                value={intakeSkillInput.nice}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setIntakeSkillInput((v) => ({ ...v, nice: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && intakeSkillInput.nice.trim()) {
                    e.preventDefault();
                    const val = intakeSkillInput.nice.trim();
                    if (!niceToHaveSkills.includes(val)) setNiceToHaveSkills((prev) => [...prev, val]);
                    setIntakeSkillInput((v) => ({ ...v, nice: "" }));
                  }
                }}
                placeholder="e.g. GraphQL, AWS — press Enter"
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            {niceToHaveSkills.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {niceToHaveSkills.map((s) => (
                  <span key={s} className="inline-flex items-center gap-1 rounded-full bg-brand-50 border border-brand-200 px-2.5 py-0.5 text-xs font-medium text-brand-700">
                    {s}
                    <button onClick={() => setNiceToHaveSkills((prev) => prev.filter((x) => x !== s))} className="hover:opacity-70">
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Target companies + sourcing notes */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">Target companies to poach from</label>
              <textarea
                value={targetCompanies}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setTargetCompanies(e.target.value)}
                placeholder="Stripe, Airbnb, Lyft…"
                rows={3}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-brand-500 resize-y"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">Sourcing strategy & notes</label>
              <textarea
                value={sourcingNotes}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setSourcingNotes(e.target.value)}
                placeholder="Boolean strings, specific communities, referral targets…"
                rows={3}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-brand-500 resize-y"
              />
            </div>
          </div>
        </section>

        <div className="border-t border-border" />

        {/* Danger zone */}
        <section className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Danger Zone</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Irreversible actions — proceed carefully</p>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-foreground">Archive this search</p>
                <p className="text-xs text-muted-foreground">Moves the job to "On hold" — no further activity</p>
              </div>
              <button
                onClick={handleArchive}
                disabled={saving || status === "on_hold"}
                className="flex items-center gap-1.5 rounded-md border border-amber-300 bg-card px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-40 transition-colors"
              >
                <Archive className="h-3.5 w-3.5" />Archive
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-red-200 bg-red-50/50 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-foreground">Cancel this search</p>
                <p className="text-xs text-muted-foreground">Marks the job as cancelled — cannot be undone</p>
              </div>
              {confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-600 font-medium">Are you sure?</span>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex items-center gap-1 rounded-md bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                  >
                    {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                    Confirm
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1.5 rounded-md border border-red-300 bg-card px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />Cancel search
                </button>
              )}
            </div>
          </div>
        </section>

        {/* ── Recruiter Assignment ───────────────────────────────────────── */}
        <section className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Assigned Recruiters</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Assign multiple recruiters to this search. Each recruiter can have a role: lead, support, sourcer, or coordinator.
            </p>
          </div>
          <RecruiterAssignmentPanel jobId={params.id} />
        </section>

        {/* ── Milestone Billing ──────────────────────────────────────────── */}
        <section className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Milestone Billing</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Track billing tranches for retained search engagements — engagement fee, shortlist delivery, and placement.
            </p>
          </div>
          <MilestoneBillingPanel jobId={params.id} retainedFee={job?.estimatedFee ?? undefined} />
        </section>

        {/* ── Submission Checklist ───────────────────────────────────────── */}
        <section className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">Submission Checklist</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Override agency-default checklist items for this specific requisition.
            </p>
          </div>
          <ChecklistConfigPanel jobId={params.id} title="Req-Level Overrides" />
        </section>

        {/* Bottom save */}
        <div className="flex justify-end pb-8">
          <button
            onClick={handleSave}
            disabled={saving}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-6 py-2 text-sm font-semibold transition-colors",
              saved ? "bg-emerald-600 text-white" : "bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-60"
            )}
          >
            {saving  ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</> :
             saved   ? <><Check   className="h-4 w-4" />Saved!</> :
                        "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
