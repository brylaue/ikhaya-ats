"use client";

import { useState, useMemo } from "react";
import {
  X, Star, Check, ChevronDown, ChevronUp, ClipboardList,
  ThumbsUp, ThumbsDown, Minus, AlertCircle, CheckCircle2,
} from "lucide-react";
import { cn, getInitials, generateAvatarColor } from "@/lib/utils";
import type { Candidate } from "@/types";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ScoreRating = 1 | 2 | 3 | 4 | 5;
export type Recommendation = "strong_yes" | "yes" | "maybe" | "no" | "strong_no";

export interface ScorecardCriterion {
  id: string;
  name: string;
  description?: string;
  rating?: ScoreRating;
  notes?: string;
}

export interface Scorecard {
  id: string;
  applicationId: string;
  stageName: string;
  submittedAt: string;
  recommendation: Recommendation;
  overallNotes?: string;
  criteria: ScorecardCriterion[];
  overallScore: number; // 1–5 average
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_CRITERIA: Omit<ScorecardCriterion, "id">[] = [
  { name: "Communication",        description: "Clarity of expression, listening skills, presence" },
  { name: "Technical Ability",    description: "Depth of relevant skills, problem-solving approach" },
  { name: "Cultural Fit",         description: "Alignment with company values and team dynamics" },
  { name: "Leadership Potential", description: "Ability to influence, take ownership, develop others" },
  { name: "Motivation & Drive",   description: "Enthusiasm for the role, ambition, self-direction" },
  { name: "Role Alignment",       description: "Experience match, trajectory, scope fit" },
];

const RATING_LABELS: Record<ScoreRating, string> = {
  1: "Poor",
  2: "Below expectations",
  3: "Meets expectations",
  4: "Exceeds expectations",
  5: "Exceptional",
};

const RECOMMENDATION_CFG: Record<Recommendation, {
  label: string;
  short: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  border: string;
}> = {
  strong_yes: { label: "Strong Yes",   short: "Strong Yes",  icon: ThumbsUp,    color: "text-emerald-700", bg: "bg-emerald-100", border: "border-emerald-400" },
  yes:        { label: "Yes",          short: "Yes",         icon: CheckCircle2, color: "text-green-700",   bg: "bg-green-50",   border: "border-green-400"   },
  maybe:      { label: "Maybe",        short: "Maybe",       icon: Minus,        color: "text-amber-700",   bg: "bg-amber-50",   border: "border-amber-400"   },
  no:         { label: "No",           short: "No",          icon: AlertCircle,  color: "text-orange-700",  bg: "bg-orange-50",  border: "border-orange-400"  },
  strong_no:  { label: "Strong No",    short: "Strong No",   icon: ThumbsDown,   color: "text-red-700",     bg: "bg-red-50",     border: "border-red-400"     },
};

// ─── Star Rating ──────────────────────────────────────────────────────────────

function StarRating({
  value,
  onChange,
}: {
  value?: ScoreRating;
  onChange: (r: ScoreRating) => void;
}) {
  const [hovered, setHovered] = useState<number>(0);

  return (
    <div className="flex items-center gap-0.5">
      {([1, 2, 3, 4, 5] as ScoreRating[]).map((star) => {
        const filled = hovered ? star <= hovered : value !== undefined && star <= value;
        return (
          <button
            key={star}
            onClick={() => onChange(star)}
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(0)}
            className="focus:outline-none"
          >
            <Star
              className={cn(
                "h-5 w-5 transition-colors",
                filled ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30 hover:text-amber-300"
              )}
            />
          </button>
        );
      })}
      {(hovered > 0 || value !== undefined) && (
        <span className="ml-1.5 text-[10px] text-muted-foreground">
          {RATING_LABELS[hovered > 0 ? (hovered as ScoreRating) : value!]}
        </span>
      )}
    </div>
  );
}

// ─── Criterion Row ────────────────────────────────────────────────────────────

function CriterionRow({
  criterion,
  onChange,
}: {
  criterion: ScorecardCriterion;
  onChange: (patch: Partial<ScorecardCriterion>) => void;
}) {
  const [showNotes, setShowNotes] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-card p-3.5 space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground">{criterion.name}</p>
          {criterion.description && (
            <p className="text-[10px] text-muted-foreground mt-0.5">{criterion.description}</p>
          )}
        </div>
        <StarRating
          value={criterion.rating}
          onChange={(r) => onChange({ rating: r })}
        />
      </div>

      <div>
        <button
          onClick={() => setShowNotes((v) => !v)}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          {showNotes ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {criterion.notes ? "Edit notes" : "Add notes"}
        </button>
        {showNotes && (
          <textarea
            autoFocus
            value={criterion.notes ?? ""}
            onChange={(e) => onChange({ notes: e.target.value || undefined })}
            placeholder="Observations, examples, specific feedback…"
            rows={2}
            className="mt-1.5 w-full resize-none rounded-lg border border-border bg-background px-2.5 py-2 text-xs text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-brand-500"
          />
        )}
      </div>
    </div>
  );
}

// ─── Score Summary Arc ────────────────────────────────────────────────────────

function ScoreSummary({ score, rated, total }: { score: number; rated: number; total: number }) {
  const pct = Math.round((score / 5) * 100);
  const color =
    score >= 4.5 ? "text-emerald-600" :
    score >= 3.5 ? "text-green-600"   :
    score >= 2.5 ? "text-amber-600"   :
                   "text-red-600";

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-accent/30 px-4 py-3">
      <div className={cn("text-2xl font-bold tabular-nums", color)}>
        {rated > 0 ? score.toFixed(1) : "—"}
      </div>
      <div>
        <p className="text-[11px] font-semibold text-foreground">Overall score</p>
        <p className="text-[10px] text-muted-foreground">{rated} of {total} criteria rated</p>
      </div>
      {rated > 0 && (
        <div className="ml-auto flex items-center gap-2">
          <div className="h-1.5 w-24 rounded-full bg-border overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", color.replace("text-", "bg-"))}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground">{pct}%</span>
        </div>
      )}
    </div>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export interface ScorecardModalProps {
  candidate: Candidate;
  applicationId: string;
  stageName: string;
  jobTitle: string;
  /** Custom criteria from the interview plan stage; falls back to defaults */
  criteria?: Omit<ScorecardCriterion, "id" | "rating" | "notes">[];
  onSubmit: (scorecard: Scorecard) => void;
  onClose: () => void;
}

export function ScorecardModal({
  candidate,
  applicationId,
  stageName,
  jobTitle,
  criteria: customCriteria,
  onSubmit,
  onClose,
}: ScorecardModalProps) {
  const seed = customCriteria ?? DEFAULT_CRITERIA;
  const [criteria, setCriteria] = useState<ScorecardCriterion[]>(
    seed.map((c, i) => ({ ...c, id: `crit_${i}` }))
  );
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [overallNotes, setOverallNotes]     = useState("");
  const [saving, setSaving]                 = useState(false);

  const rated = criteria.filter((c) => c.rating !== undefined).length;
  const overallScore = useMemo(() => {
    const scored = criteria.filter((c) => c.rating !== undefined);
    if (scored.length === 0) return 0;
    return scored.reduce((s, c) => s + c.rating!, 0) / scored.length;
  }, [criteria]);

  function updateCriterion(id: string, patch: Partial<ScorecardCriterion>) {
    setCriteria((prev) => prev.map((c) => c.id === id ? { ...c, ...patch } : c));
  }

  async function handleSubmit() {
    if (!recommendation) {
      toast.error("Select a recommendation before submitting");
      return;
    }
    setSaving(true);
    await new Promise((r) => setTimeout(r, 700));
    const scorecard: Scorecard = {
      id: `sc_${Date.now()}`,
      applicationId,
      stageName,
      submittedAt: new Date().toISOString(),
      recommendation,
      overallNotes: overallNotes.trim() || undefined,
      criteria,
      overallScore: rated > 0 ? Math.round(overallScore * 10) / 10 : 0,
    };
    onSubmit(scorecard);
    toast.success("Scorecard submitted");
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
              <ClipboardList className="h-5 w-5 text-brand-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">Interview Scorecard</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {stageName} · {jobTitle}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Candidate chip */}
            <div className="flex items-center gap-2 rounded-full border border-border bg-background px-2.5 py-1">
              <div className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white",
                generateAvatarColor(candidate.id)
              )}>
                {getInitials(candidate.fullName)}
              </div>
              <span className="text-xs font-medium text-foreground">{candidate.fullName}</span>
            </div>
            <button onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Score summary */}
          <ScoreSummary score={overallScore} rated={rated} total={criteria.length} />

          {/* Criteria */}
          <div className="space-y-2.5">
            <p className="text-xs font-semibold text-foreground">Rating criteria</p>
            {criteria.map((c) => (
              <CriterionRow
                key={c.id}
                criterion={c}
                onChange={(patch) => updateCriterion(c.id, patch)}
              />
            ))}
          </div>

          {/* Recommendation */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground">Overall recommendation</p>
            <div className="grid grid-cols-5 gap-2">
              {(Object.entries(RECOMMENDATION_CFG) as [Recommendation, typeof RECOMMENDATION_CFG[Recommendation]][]).map(([key, cfg]) => {
                const Icon = cfg.icon;
                const isSelected = recommendation === key;
                return (
                  <button
                    key={key}
                    onClick={() => setRecommendation(key)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-xl border-2 px-2 py-3 text-center transition-all",
                      isSelected
                        ? `${cfg.bg} ${cfg.border} ${cfg.color} shadow-sm`
                        : "border-border text-muted-foreground hover:border-border/80 hover:bg-accent/30"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-[10px] font-semibold leading-tight">{cfg.short}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Overall notes */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              Summary notes <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <textarea
              value={overallNotes}
              onChange={(e) => setOverallNotes(e.target.value)}
              placeholder="Overall impression, strengths, concerns, next steps…"
              rows={3}
              className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-between border-t border-border px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-3.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <div className="flex items-center gap-3">
            {!recommendation && (
              <span className="text-[10px] text-muted-foreground">Select a recommendation to submit</span>
            )}
            <button
              onClick={handleSubmit}
              disabled={!recommendation || saving}
              className="flex items-center gap-1.5 rounded-md bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? (
                <><Check className="h-3.5 w-3.5 animate-pulse" />Submitting…</>
              ) : (
                <><ClipboardList className="h-3.5 w-3.5" />Submit Scorecard</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
