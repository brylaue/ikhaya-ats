"use client";

/**
 * ScorecardPanel — shows interview scorecards for a candidate.
 *
 * Displays existing submissions with ratings and recommendations,
 * and lets the current user add / edit their own scorecard.
 */

import { useState } from "react";
import { Star, ChevronDown, ChevronUp, Plus, Check, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useScorecardSubmissions,
  useScorecardTemplates,
  type ScorecardRecommendation,
  type ScorecardRating,
} from "@/lib/supabase/hooks";
import { toast } from "sonner";

// ── Helpers ───────────────────────────────────────────────────────────────────

const RECOMMENDATION_CFG: Record<ScorecardRecommendation, { label: string; color: string; bg: string }> = {
  strong_yes: { label: "Strong Yes", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
  yes:        { label: "Yes",         color: "text-brand-700",    bg: "bg-brand-50   border-brand-200"    },
  no:         { label: "No",          color: "text-amber-700",   bg: "bg-amber-50  border-amber-200"   },
  strong_no:  { label: "Strong No",   color: "text-red-700",     bg: "bg-red-50    border-red-200"     },
};

function StarRow({ value, onChange, max = 5, readonly = false }: {
  value: number; onChange?: (v: number) => void; max?: number; readonly?: boolean;
}) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }).map((_, i) => {
        const filled = (readonly ? value : (hover || value)) > i;
        return (
          <button
            key={i}
            type="button"
            disabled={readonly}
            onClick={() => onChange?.(i + 1)}
            onMouseEnter={() => !readonly && setHover(i + 1)}
            onMouseLeave={() => !readonly && setHover(0)}
            className={cn("h-4 w-4 transition-colors", readonly ? "cursor-default" : "cursor-pointer")}
          >
            <Star
              className={cn("h-4 w-4", filled ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30")}
            />
          </button>
        );
      })}
      {value > 0 && <span className="ml-1.5 text-[10px] text-muted-foreground">{value}/{max}</span>}
    </div>
  );
}

function RecommendationBadge({ rec }: { rec: ScorecardRecommendation | null }) {
  if (!rec) return <span className="text-xs text-muted-foreground">—</span>;
  const cfg = RECOMMENDATION_CFG[rec];
  return (
    <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", cfg.bg, cfg.color)}>
      {cfg.label}
    </span>
  );
}

// ── Submission card ───────────────────────────────────────────────────────────

function SubmissionCard({
  sub,
  onDelete,
  currentUserId,
}: {
  sub: import("@/lib/supabase/hooks").ScorecardSubmission;
  onDelete: () => void;
  currentUserId?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const criteriaEntries = Object.entries(sub.ratings ?? {});

  return (
    <div className="rounded-xl border border-border bg-card">
      <div
        className="flex cursor-pointer items-center gap-3 px-4 py-3"
        onClick={() => setExpanded((p) => !p)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground">
              {sub.interviewerName ?? "Interviewer"}
            </span>
            {sub.stage && (
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-600">
                {sub.stage}
              </span>
            )}
            {sub.submittedAt && (
              <span className="text-[10px] text-muted-foreground">
                {new Date(sub.submittedAt).toLocaleDateString()}
              </span>
            )}
            {!sub.submittedAt && (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-medium text-amber-700">
                Draft
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-3">
            {sub.overallRating != null && <StarRow value={sub.overallRating} readonly />}
            <RecommendationBadge rec={sub.recommendation} />
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {currentUserId === sub.interviewerId && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="rounded-md p-1 text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border px-4 py-3 space-y-3">
          {criteriaEntries.length > 0 && (
            <div className="space-y-2">
              {criteriaEntries.map(([cid, r]) => (
                <div key={cid} className="flex items-start justify-between gap-3">
                  <span className="text-[11px] text-muted-foreground">{cid}</span>
                  <div className="flex flex-col items-end gap-0.5">
                    <StarRow value={(r as ScorecardRating).score} readonly />
                    {(r as ScorecardRating).note && (
                      <span className="text-[10px] text-muted-foreground italic">
                        "{(r as ScorecardRating).note}"
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {sub.notes && (
            <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-foreground whitespace-pre-wrap">
              {sub.notes}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Add / edit scorecard form ─────────────────────────────────────────────────

function ScorecardForm({
  candidateId,
  jobId,
  templates,
  onClose,
  upsert,
}: {
  candidateId: string;
  jobId?: string | null;
  templates: import("@/lib/supabase/hooks").ScorecardTemplate[];
  onClose: () => void;
  upsert: ReturnType<typeof useScorecardSubmissions>["upsertSubmission"];
}) {
  const [templateId,    setTemplateId]    = useState<string>(templates[0]?.id ?? "");
  const [stage,         setStage]         = useState("");
  const [overallRating, setOverallRating] = useState(0);
  const [recommendation,setRecommendation]= useState<ScorecardRecommendation | "">("");
  const [notes,         setNotes]         = useState("");
  const [ratings,       setRatings]       = useState<Record<string, ScorecardRating>>({});
  const [saving,        setSaving]        = useState(false);

  const template = templates.find((t) => t.id === templateId);

  async function handleSave(submit: boolean) {
    setSaving(true);
    try {
      const result = await upsert({
        templateId:    templateId || null,
        jobId:         jobId ?? null,
        stage:         stage || null,
        overallRating: overallRating || null,
        recommendation: (recommendation as ScorecardRecommendation) || null,
        ratings,
        notes:         notes || null,
        submit,
      });
      if ("error" in result && result.error) {
        toast.error(result.error);
      } else {
        toast.success(submit ? "Scorecard submitted" : "Draft saved");
        onClose();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-brand-200 bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">New Scorecard</p>
        <button onClick={onClose} className="text-[11px] text-muted-foreground hover:text-foreground">
          Cancel
        </button>
      </div>

      {/* Template picker */}
      {templates.length > 0 && (
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Template</label>
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">— no template —</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      )}

      {/* Stage */}
      <div className="space-y-1">
        <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Interview Stage</label>
        <input
          value={stage}
          onChange={(e) => setStage(e.target.value)}
          placeholder="e.g. First interview, Technical, Final"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {/* Criteria from template */}
      {template && template.criteria.length > 0 && (
        <div className="space-y-3">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Criteria</p>
          {template.criteria.map((c) => (
            <div key={c.id} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">{c.label}</span>
                <StarRow
                  value={ratings[c.id]?.score ?? 0}
                  max={c.scale || 5}
                  onChange={(v) => setRatings((prev) => ({ ...prev, [c.id]: { score: v, note: prev[c.id]?.note ?? "" } }))}
                />
              </div>
              {c.description && <p className="text-[10px] text-muted-foreground">{c.description}</p>}
              <input
                value={ratings[c.id]?.note ?? ""}
                onChange={(e) => setRatings((prev) => ({ ...prev, [c.id]: { score: prev[c.id]?.score ?? 0, note: e.target.value } }))}
                placeholder="Notes for this criterion…"
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
          ))}
        </div>
      )}

      {/* Overall rating */}
      <div className="space-y-1">
        <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Overall Rating</label>
        <StarRow value={overallRating} onChange={setOverallRating} />
      </div>

      {/* Recommendation */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Recommendation</label>
        <div className="flex flex-wrap gap-2">
          {(["strong_yes","yes","no","strong_no"] as ScorecardRecommendation[]).map((r) => {
            const cfg = RECOMMENDATION_CFG[r];
            const selected = recommendation === r;
            return (
              <button
                key={r}
                type="button"
                onClick={() => setRecommendation(selected ? "" : r)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-[10px] font-semibold transition-colors",
                  selected ? cn(cfg.bg, cfg.color) : "border-border text-muted-foreground hover:border-border/60"
                )}
              >
                {selected && <Check className="inline h-2.5 w-2.5 mr-0.5" />}
                {cfg.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-1">
        <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="General interview notes…"
          className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => handleSave(true)}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Submit Scorecard
        </button>
        <button
          onClick={() => handleSave(false)}
          disabled={saving}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
        >
          Save Draft
        </button>
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface ScorecardPanelProps {
  candidateId: string | null | undefined;
  jobId?:      string | null;
}

export function ScorecardPanel({ candidateId, jobId }: ScorecardPanelProps) {
  const { submissions, loading, upsertSubmission, deleteSubmission, avgRating } =
    useScorecardSubmissions(candidateId, jobId);
  const { templates } = useScorecardTemplates(jobId);
  const [showForm, setShowForm] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />Loading scorecards…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {avgRating != null && (
            <div className="flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              <span className="text-[10px] font-semibold text-amber-700">
                {avgRating.toFixed(1)} avg
              </span>
            </div>
          )}
          <span className="text-[10px] text-muted-foreground">
            {submissions.length} scorecard{submissions.length !== 1 ? "s" : ""}
          </span>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1 rounded-md border border-brand-200 bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700 hover:bg-brand-100 transition-colors"
          >
            <Plus className="h-3 w-3" />Add Scorecard
          </button>
        )}
      </div>

      {/* Form */}
      {showForm && candidateId && (
        <ScorecardForm
          candidateId={candidateId}
          jobId={jobId}
          templates={templates}
          onClose={() => setShowForm(false)}
          upsert={upsertSubmission}
        />
      )}

      {/* Existing submissions */}
      {submissions.length === 0 && !showForm && (
        <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center">
          <Star className="mx-auto mb-2 h-6 w-6 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No scorecards yet</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Add your first after an interview</p>
        </div>
      )}

      {submissions.map((sub) => (
        <SubmissionCard
          key={sub.id}
          sub={sub}
          onDelete={() => deleteSubmission(sub.id)}
          currentUserId={undefined} // Pass real userId if available
        />
      ))}
    </div>
  );
}
