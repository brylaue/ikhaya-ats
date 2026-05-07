"use client";

import { useState } from "react";
import {
  X, Plus, Trash2, GripVertical, Check, ArrowRight,
  Video, Phone, Users, MapPin, Zap, ChevronDown, Info,
  Clock, User, AlertCircle, Link2, ExternalLink,
} from "lucide-react";
import { cn, generateAvatarColor, getInitials } from "@/lib/utils";

import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

export type InterviewStageFormat = "phone" | "video" | "onsite" | "panel" | "assessment" | "executive";

export interface InterviewStage {
  id: string;
  name: string;
  format: InterviewStageFormat;
  durationMins: number;
  ownerId?: string;
  description?: string;
  scorecardRequired: boolean;
  schedulingUrl?: string;
}

export interface InterviewPlan {
  jobId: string;
  stages: InterviewStage[];
  notes?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FORMAT_CFG: Record<InterviewStageFormat, { label: string; icon: React.ElementType; color: string }> = {
  phone:      { label: "Phone screen",     icon: Phone,   color: "bg-brand-100 text-brand-600"    },
  video:      { label: "Video call",       icon: Video,   color: "bg-indigo-100 text-indigo-600" },
  onsite:     { label: "On-site",          icon: MapPin,  color: "bg-emerald-100 text-emerald-600" },
  panel:      { label: "Panel interview",  icon: Users,   color: "bg-violet-100 text-violet-600" },
  assessment: { label: "Assessment",       icon: Zap,     color: "bg-amber-100 text-amber-600"  },
  executive:  { label: "Executive round",  icon: User,    color: "bg-rose-100 text-rose-600"    },
};

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];

const STAGE_TEMPLATES: { name: string; stages: Omit<InterviewStage, "id">[] }[] = [
  {
    name: "Standard (4-stage)",
    stages: [
      { name: "Recruiter Screen",    format: "phone",      durationMins: 30,  scorecardRequired: false },
      { name: "Hiring Manager",      format: "video",      durationMins: 60,  scorecardRequired: true  },
      { name: "Team Panel",          format: "panel",      durationMins: 90,  scorecardRequired: true  },
      { name: "Executive Interview", format: "executive",  durationMins: 45,  scorecardRequired: true  },
    ],
  },
  {
    name: "Exec search (3-stage)",
    stages: [
      { name: "Confidential Screen", format: "phone",      durationMins: 45,  scorecardRequired: false },
      { name: "CEO / Board Meeting", format: "onsite",     durationMins: 120, scorecardRequired: true  },
      { name: "Reference Calls",     format: "phone",      durationMins: 30,  scorecardRequired: false },
    ],
  },
  {
    name: "Technical (5-stage)",
    stages: [
      { name: "Recruiter Screen",   format: "phone",      durationMins: 30,  scorecardRequired: false },
      { name: "Technical Screen",   format: "video",      durationMins: 60,  scorecardRequired: true  },
      { name: "Take-home Challenge",format: "assessment", durationMins: 120, scorecardRequired: true  },
      { name: "System Design",      format: "video",      durationMins: 90,  scorecardRequired: true  },
      { name: "Culture & Values",   format: "panel",      durationMins: 60,  scorecardRequired: true  },
    ],
  },
  {
    name: "Lightweight (2-stage)",
    stages: [
      { name: "Initial Screen",     format: "phone",      durationMins: 30,  scorecardRequired: false },
      { name: "Final Interview",    format: "video",      durationMins: 60,  scorecardRequired: true  },
    ],
  },
];

// ─── Stage Row ────────────────────────────────────────────────────────────────

function StageRow({
  stage,
  index,
  total,
  onChange,
  onRemove,
}: {
  stage: InterviewStage;
  index: number;
  total: number;
  onChange: (patch: Partial<InterviewStage>) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [hasLink, setHasLink] = useState(!!stage.schedulingUrl);
  const cfg = FORMAT_CFG[stage.format];
  const FormatIcon = cfg.icon;

  return (
    <div className={cn(
      "rounded-xl border border-border bg-card overflow-hidden transition-shadow",
      expanded && "shadow-sm"
    )}>
      {/* Main row */}
      <div className="flex items-center gap-3 px-3 py-3">
        {/* Drag handle */}
        <button className="shrink-0 cursor-grab text-muted-foreground hover:text-foreground transition-colors">
          <GripVertical className="h-4 w-4" />
        </button>

        {/* Step number */}
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[10px] font-bold text-white">
          {index + 1}
        </div>

        {/* Name */}
        <input
          value={stage.name}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ name: e.target.value })}
          placeholder="Stage name…"
          className="flex-1 min-w-0 bg-transparent text-sm font-medium text-foreground outline-none placeholder-muted-foreground"
        />

        {/* Format badge */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className={cn("flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold shrink-0", cfg.color)}
        >
          <FormatIcon className="h-3 w-3" />
          {cfg.label}
          <ChevronDown className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")} />
        </button>

        {/* Duration */}
        <select
          value={stage.durationMins}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onChange({ durationMins: Number(e.target.value) })}
          onClick={(e) => e.stopPropagation()}
          className="w-20 rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground outline-none focus:ring-2 focus:ring-brand-500 shrink-0"
        >
          {DURATION_OPTIONS.map((d) => (
            <option key={d} value={d}>{d}m</option>
          ))}
        </select>

        {/* Scheduling URL indicator */}
        {stage.schedulingUrl && (
          <a
            href={stage.schedulingUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title={stage.schedulingUrl}
            className="shrink-0 flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
          >
            <Link2 className="h-2.5 w-2.5" />
            Link
          </a>
        )}

        {/* Remove */}
        <button
          onClick={onRemove}
          disabled={total <= 1}
          className="shrink-0 text-muted-foreground hover:text-red-500 transition-colors disabled:opacity-30"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-border bg-accent/20 px-4 py-3 space-y-3">
          {/* Format selector */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Format</p>
            <div className="flex flex-wrap gap-1.5">
              {(Object.entries(FORMAT_CFG) as [InterviewStageFormat, typeof FORMAT_CFG[InterviewStageFormat]][]).map(([fmt, c]) => {
                const Ic = c.icon;
                return (
                  <button
                    key={fmt}
                    onClick={() => onChange({ format: fmt })}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-all",
                      stage.format === fmt
                        ? `${c.color} border-current shadow-sm`
                        : "border-border text-muted-foreground hover:border-brand-200"
                    )}
                  >
                    <Ic className="h-3 w-3" />{c.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Owner */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Interviewer / Owner</p>
            <select
              value={stage.ownerId ?? ""}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onChange({ ownerId: e.target.value || undefined })}
              className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">Unassigned</option>
              {/* Team members populated once multi-user is live */}
              <option value="me">Me</option>
            </select>
          </div>

          {/* Description */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Stage description (optional)</p>
            <textarea
              value={stage.description ?? ""}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange({ description: e.target.value || undefined })}
              placeholder="What happens in this stage? What are you evaluating?"
              rows={2}
              className="w-full resize-none rounded-lg border border-border bg-background px-2.5 py-2 text-xs text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {/* Scheduling link */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hasLink}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setHasLink(e.target.checked);
                  if (!e.target.checked) onChange({ schedulingUrl: undefined });
                }}
                className="rounded border-border accent-brand-600"
              />
              <span className="text-xs text-foreground">Client has a scheduling link for this stage</span>
            </label>
            {!hasLink && (
              <p className="text-[10px] text-muted-foreground pl-5">
                Leave unchecked if the recruiter will coordinate availability directly with the client.
              </p>
            )}
            {hasLink && (
              <div className="flex items-center gap-1.5 pl-5">
                <div className="relative flex-1">
                  <Link2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
                  <input
                    autoFocus
                    type="url"
                    value={stage.schedulingUrl ?? ""}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ schedulingUrl: e.target.value || undefined })}
                    placeholder="Paste scheduling link…"
                    className="w-full rounded-lg border border-border bg-background pl-7 pr-2.5 py-1.5 text-xs text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                {stage.schedulingUrl && (
                  <a
                    href={stage.schedulingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:text-brand-600 hover:border-brand-300 transition-colors"
                    title="Test link"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Scorecard toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={stage.scorecardRequired}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ scorecardRequired: e.target.checked })}
              className="rounded border-border accent-brand-600"
            />
            <span className="text-xs text-foreground">Scorecard required after this stage</span>
          </label>
        </div>
      )}
    </div>
  );
}

// ─── Template picker ──────────────────────────────────────────────────────────

function TemplatePicker({ onSelect }: { onSelect: (stages: Omit<InterviewStage, "id">[]) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {STAGE_TEMPLATES.map((t) => (
        <button
          key={t.name}
          onClick={() => onSelect(t.stages)}
          className="rounded-xl border border-border bg-card p-3 text-left hover:border-brand-300 hover:bg-accent/20 transition-all group"
        >
          <p className="text-xs font-semibold text-foreground group-hover:text-brand-700 transition-colors">{t.name}</p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {t.stages.length} stages · {t.stages.map((s) => s.name).join(" → ")}
          </p>
        </button>
      ))}
    </div>
  );
}

// ─── Summary row ─────────────────────────────────────────────────────────────

function PlanSummary({ stages }: { stages: InterviewStage[] }) {
  const totalMins = stages.reduce((s, st) => s + st.durationMins, 0);
  const hours = Math.floor(totalMins / 60);
  const mins  = totalMins % 60;
  const timeStr = hours > 0 ? `${hours}h${mins > 0 ? ` ${mins}m` : ""}` : `${mins}m`;

  const linkedStages = stages.filter((s) => s.schedulingUrl).length;

  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-accent/30 px-4 py-2.5">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Users className="h-3.5 w-3.5" />
        <span className="font-semibold text-foreground">{stages.length}</span> stages
      </div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />
        <span className="font-semibold text-foreground">{timeStr}</span> total interview time
      </div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Check className="h-3.5 w-3.5 text-emerald-500" />
        <span className="font-semibold text-foreground">
          {stages.filter((s) => s.scorecardRequired).length}
        </span> scorecards
      </div>
      {linkedStages > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link2 className="h-3.5 w-3.5 text-emerald-500" />
          <span className="font-semibold text-foreground">{linkedStages}</span> scheduling link{linkedStages > 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export interface InterviewPlanModalProps {
  jobTitle: string;
  jobId: string;
  existingPlan?: InterviewPlan;
  onSave: (plan: InterviewPlan) => void | Promise<void>;
  onClose: () => void;
  /** If true, shows a "Skip for now" option (used on new job creation) */
  isNewJob?: boolean;
}

export function InterviewPlanModal({
  jobTitle,
  jobId,
  existingPlan,
  onSave,
  onClose,
  isNewJob = false,
}: InterviewPlanModalProps) {
  const [showTemplates, setShowTemplates] = useState(!existingPlan);
  const [saving, setSaving] = useState(false);

  function makeId() { return `is_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }

  const [stages, setStages] = useState<InterviewStage[]>(
    existingPlan?.stages ?? []
  );
  const [notes, setNotes] = useState(existingPlan?.notes ?? "");

  function addStage() {
    setStages((prev) => [
      ...prev,
      {
        id: makeId(),
        name: `Round ${prev.length + 1}`,
        format: "video",
        durationMins: 60,
        scorecardRequired: true,
      },
    ]);
  }

  function applyTemplate(tmplStages: Omit<InterviewStage, "id">[]) {
    setStages(tmplStages.map((s) => ({ ...s, id: makeId() })));
    setShowTemplates(false);
  }

  function updateStage(id: string, patch: Partial<InterviewStage>) {
    setStages((prev) => prev.map((s) => s.id === id ? { ...s, ...patch } : s));
  }

  function removeStage(id: string) {
    setStages((prev) => prev.filter((s) => s.id !== id));
  }

  async function handleSave() {
    if (stages.length === 0) {
      toast.error("Add at least one interview stage");
      return;
    }
    setSaving(true);
    await onSave({ jobId, stages, notes: notes.trim() || undefined });
    toast.success("Interview plan saved");
    setSaving(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 flex w-full max-w-2xl flex-col rounded-2xl border border-border bg-card shadow-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-100">
              <Users className="h-5 w-5 text-brand-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">Interview Plan</h2>
              <p className="text-[11px] text-muted-foreground">{jobTitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {stages.length > 0 && (
              <button
                onClick={() => setShowTemplates((v) => !v)}
                className="text-xs font-medium text-brand-600 hover:underline"
              >
                {showTemplates ? "Hide templates" : "Load template"}
              </button>
            )}
            <button onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground transition-colors ml-2">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Info banner for new jobs */}
          {isNewJob && (
            <div className="flex items-start gap-2 rounded-xl border border-brand-200 bg-brand-50/60 px-4 py-3">
              <Info className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" />
              <p className="text-xs text-brand-700">
                Define the interview stages specific to this search. Each candidate will progress through these stages in their pipeline. You can customize per-candidate anytime.
              </p>
            </div>
          )}

          {/* Template picker */}
          {showTemplates && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-foreground">
                {stages.length > 0 ? "Replace with template" : "Start from a template"}
              </p>
              <TemplatePicker onSelect={applyTemplate} />
              <button
                onClick={() => { setShowTemplates(false); addStage(); }}
                className="text-xs font-medium text-brand-600 hover:underline"
              >
                Or build from scratch →
              </button>
            </div>
          )}

          {/* Stages */}
          {stages.length > 0 && (
            <div className="space-y-3">
              {!showTemplates && (
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-foreground">Interview stages</p>
                  <p className="text-[10px] text-muted-foreground">Click a stage to expand and configure</p>
                </div>
              )}

              <div className="space-y-2">
                {stages.map((stage, i) => (
                  <StageRow
                    key={stage.id}
                    stage={stage}
                    index={i}
                    total={stages.length}
                    onChange={(patch) => updateStage(stage.id, patch)}
                    onRemove={() => removeStage(stage.id)}
                  />
                ))}
              </div>

              {/* Add stage */}
              <button
                onClick={addStage}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border py-2.5 text-xs font-medium text-muted-foreground hover:border-brand-300 hover:text-brand-600 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />Add stage
              </button>

              {/* Summary */}
              <PlanSummary stages={stages} />

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">
                  Notes for the hiring team (optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
                  placeholder="Any specific instructions, focus areas, or expectations for this search's interview process…"
                  rows={3}
                  className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>
          )}

          {/* Empty state */}
          {stages.length === 0 && !showTemplates && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 mb-4">
                <Users className="h-7 w-7 text-brand-600" />
              </div>
              <p className="text-sm font-semibold text-foreground">No stages yet</p>
              <p className="mt-1 text-xs text-muted-foreground max-w-xs">
                Define the interview stages for this search. Candidates will move through these stages in the pipeline.
              </p>
              <div className="flex items-center gap-3 mt-4">
                <button
                  onClick={() => setShowTemplates(true)}
                  className="rounded-md bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
                >
                  Use a template
                </button>
                <button
                  onClick={addStage}
                  className="rounded-md border border-border px-4 py-2 text-xs font-medium text-foreground hover:bg-accent transition-colors"
                >
                  Add stage manually
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-between border-t border-border px-6 py-4">
          {isNewJob ? (
            <button
              onClick={onClose}
              className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Skip for now
            </button>
          ) : (
            <button
              onClick={onClose}
              className="rounded-md border border-border px-3.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
            >
              Cancel
            </button>
          )}

          <button
            onClick={handleSave}
            disabled={stages.length === 0 || saving}
            className="flex items-center gap-1.5 rounded-md bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? (
              <><Check className="h-3.5 w-3.5 animate-pulse" />Saving…</>
            ) : (
              <><Check className="h-3.5 w-3.5" />Save Interview Plan</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
