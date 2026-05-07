"use client";

/**
 * MatchScoreBreakdown modal (US-110).
 *
 * Opens when a recruiter clicks the score pill next to a matching job. Shows:
 *   - overall score + confidence badge
 *   - per-criterion bars (skills / experience / location / education / tenure)
 *   - matched + missing skill chips for the skills row
 *   - a 1-2 sentence rationale
 *   - thumbs up/down feedback controls
 *
 * Behaviour:
 *   - On open: GET /api/candidates/:id/match-score/:jobId for a cached breakdown.
 *   - If none exists (404), shows a "Generate explanation" CTA that POSTs to the
 *     same route. Returns 202 in ~2–3s for cache misses (LLM call).
 *   - Feedback votes go to /api/match-scores/:matchId/feedback. A thumb is
 *     visually latched once saved; clicking again retracts.
 *
 * Design: keep it tight — recruiters open this from a hover pill, they want
 * "why 72%?" in one glance. Bars before narrative, numbers tabular-nums.
 */

import { useState, useEffect, useCallback } from "react";
import {
  X, Sparkles, Loader2, ThumbsUp, ThumbsDown, AlertTriangle,
  Target, Briefcase, MapPin, GraduationCap, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/* ── Types (mirror lib/ai/match-score.ts) ─────────────────────────────────── */

interface CriterionBreakdown {
  score:    number;
  matched?: string[];
  missing?: string[];
  summary?: string;
}

interface MatchBreakdown {
  skills?:     CriterionBreakdown;
  experience?: CriterionBreakdown;
  location?:   CriterionBreakdown;
  education?:  CriterionBreakdown;
  tenure?:     CriterionBreakdown;
}

interface ExplanationResponse {
  matchScoreId:   string;
  score:          number;
  breakdown:      MatchBreakdown | null;
  rationale:      string | null;
  confidence:     number | null;
  generatedBy:    string | null;
  explainedAt?:   string | null;
  computedAt?:    string | null;
  hasExplanation?: boolean;
  cached?:        boolean;
}

interface FeedbackState {
  voteCount:  number;
  thumbsUp:   number;
  thumbsDown: number;
  myVote:     { rating: -1 | 1; reason: string | null } | null;
}

interface Props {
  candidateId:  string;
  jobId:        string;
  jobTitle:     string;
  initialScore: number;
  onClose:      () => void;
}

/* ── Criterion metadata ───────────────────────────────────────────────────── */

const CRITERIA: {
  key: keyof MatchBreakdown;
  label: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Icon: any;
}[] = [
  { key: "skills",     label: "Skills",     Icon: Target        },
  { key: "experience", label: "Experience", Icon: Briefcase     },
  { key: "location",   label: "Location",   Icon: MapPin        },
  { key: "education",  label: "Education",  Icon: GraduationCap },
  { key: "tenure",     label: "Tenure",     Icon: Clock         },
];

/* ── Component ────────────────────────────────────────────────────────────── */

export function MatchScoreBreakdown({
  candidateId, jobId, jobTitle, initialScore, onClose,
}: Props) {
  const [loading,     setLoading]     = useState(true);
  const [explanation, setExplanation] = useState<ExplanationResponse | null>(null);
  const [generating,  setGenerating]  = useState(false);
  const [feedback,    setFeedback]    = useState<FeedbackState | null>(null);

  /* ── Initial load ─────────────────────────────────────────────────────── */

  const loadCached = useCallback(async () => {
    try {
      const res = await fetch(`/api/candidates/${candidateId}/match-score/${jobId}`);
      if (res.status === 404) { setExplanation(null); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ExplanationResponse = await res.json();
      setExplanation(data);
      if (data.matchScoreId) loadFeedback(data.matchScoreId);
    } catch {
      setExplanation(null);
    }
  }, [candidateId, jobId]);

  const loadFeedback = useCallback(async (matchScoreId: string) => {
    try {
      const res = await fetch(`/api/match-scores/${matchScoreId}/feedback`);
      if (!res.ok) return;
      const data = await res.json();
      setFeedback({
        voteCount:  data.voteCount  ?? 0,
        thumbsUp:   data.thumbsUp   ?? 0,
        thumbsDown: data.thumbsDown ?? 0,
        myVote:     data.myVote ?? null,
      });
    } catch { /* swallow */ }
  }, []);

  useEffect(() => {
    loadCached().finally(() => setLoading(false));
  }, [loadCached]);

  /* ── Generate explanation ─────────────────────────────────────────────── */

  async function generate(refresh = false) {
    setGenerating(true);
    try {
      const url = `/api/candidates/${candidateId}/match-score/${jobId}${refresh ? "?refresh=1" : ""}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body:    "{}",
      });
      if (res.status === 429) {
        toast.error("AI daily cost limit reached — try again tomorrow");
        return;
      }
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({}));
        throw new Error(error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      // Re-fetch the canonical shape from GET so we have matchScoreId reliably.
      await loadCached();
      toast.success(data.cached ? "Loaded cached explanation" : "Explanation generated");
    } catch (err) {
      toast.error((err as Error).message || "Could not generate explanation");
    } finally {
      setGenerating(false);
    }
  }

  /* ── Feedback voting ──────────────────────────────────────────────────── */

  async function vote(rating: -1 | 1) {
    if (!explanation?.matchScoreId) return;

    // Retract if the user clicks their existing vote.
    if (feedback?.myVote?.rating === rating) {
      try {
        const res = await fetch(
          `/api/match-scores/${explanation.matchScoreId}/feedback`,
          { method: "DELETE", headers: { "Content-Type": "application/json" }, body: "{}" },
        );
        if (!res.ok) throw new Error();
        await loadFeedback(explanation.matchScoreId);
        toast.success("Vote retracted");
      } catch {
        toast.error("Could not retract vote");
      }
      return;
    }

    try {
      const res = await fetch(
        `/api/match-scores/${explanation.matchScoreId}/feedback`,
        {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ rating }),
        },
      );
      if (!res.ok) throw new Error();
      await loadFeedback(explanation.matchScoreId);
      toast.success(rating === 1 ? "Thanks — marked helpful" : "Thanks — we'll tune the model");
    } catch {
      toast.error("Could not save feedback");
    }
  }

  /* ── Render ───────────────────────────────────────────────────────────── */

  const overall     = explanation?.score ?? initialScore;
  const confidence  = explanation?.confidence ?? null;
  const lowConf     = confidence != null && confidence < 0.6;
  const hasDetail   = !!explanation?.breakdown;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="relative w-full max-w-xl max-h-[90vh] flex flex-col rounded-2xl bg-background shadow-xl border border-border overflow-hidden">

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-border bg-gradient-to-r from-brand-50 to-violet-50">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-brand-600" />
              Why this match?
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{jobTitle}</p>
          </div>
          <div className="flex items-center gap-3 shrink-0 ml-4">
            <span className={cn(
              "rounded-lg px-2.5 py-1 text-sm font-bold tabular-nums",
              overall >= 80 ? "bg-emerald-100 text-emerald-700" :
              overall >= 60 ? "bg-amber-100 text-amber-700"     :
                              "bg-secondary text-muted-foreground",
            )}>
              {overall}%
            </span>
            <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-accent transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
            </div>
          ) : !hasDetail ? (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
              <Sparkles className="h-8 w-8 text-brand-500" />
              <div>
                <p className="text-sm font-medium text-foreground">No explanation yet</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                  Generate a per-criterion breakdown showing the strongest drivers and biggest gaps behind this score.
                </p>
              </div>
              <button
                onClick={() => generate(false)}
                disabled={generating}
                className="flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {generating ? "Analysing…" : "Generate explanation"}
              </button>
              <p className="text-[10px] text-muted-foreground">Uses ~800 tokens · cached for 7 days</p>
            </div>
          ) : (
            <>
              {/* Confidence badge */}
              {confidence != null && (
                <div className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs",
                  lowConf
                    ? "border-amber-200 bg-amber-50 text-amber-800"
                    : "border-border bg-secondary/40 text-muted-foreground",
                )}>
                  {lowConf && <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
                  <span>
                    <span className="font-semibold">Confidence:</span>{" "}
                    {(confidence * 100).toFixed(0)}%
                    {lowConf && " — recruiter review recommended"}
                  </span>
                </div>
              )}

              {/* Criterion bars */}
              <div className="space-y-2.5">
                {CRITERIA.map(({ key, label, Icon }) => {
                  const c = explanation!.breakdown![key];
                  if (!c) return null;
                  return (
                    <CriterionRow key={key} label={label} Icon={Icon} criterion={c} />
                  );
                })}
              </div>

              {/* Rationale */}
              {explanation!.rationale && (
                <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    Summary
                  </p>
                  <p className="text-sm text-foreground leading-relaxed">
                    {explanation!.rationale}
                  </p>
                </div>
              )}

              {/* Footer controls */}
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <button
                  onClick={() => generate(true)}
                  disabled={generating}
                  className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
                >
                  {generating ? "Refreshing…" : "Refresh explanation"}
                </button>

                {feedback && (
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground mr-1">
                      Was this useful?
                    </span>
                    <button
                      onClick={() => vote(1)}
                      title="Helpful"
                      className={cn(
                        "flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors",
                        feedback.myVote?.rating === 1
                          ? "bg-emerald-100 text-emerald-700"
                          : "text-muted-foreground hover:bg-accent",
                      )}
                    >
                      <ThumbsUp className="h-3 w-3" />
                      {feedback.thumbsUp > 0 && <span className="tabular-nums">{feedback.thumbsUp}</span>}
                    </button>
                    <button
                      onClick={() => vote(-1)}
                      title="Not quite"
                      className={cn(
                        "flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors",
                        feedback.myVote?.rating === -1
                          ? "bg-red-100 text-red-700"
                          : "text-muted-foreground hover:bg-accent",
                      )}
                    >
                      <ThumbsDown className="h-3 w-3" />
                      {feedback.thumbsDown > 0 && <span className="tabular-nums">{feedback.thumbsDown}</span>}
                    </button>
                  </div>
                )}
              </div>

              {explanation!.generatedBy && (
                <p className="text-[10px] text-muted-foreground text-right">
                  Generated by {explanation!.generatedBy}
                  {explanation!.explainedAt && ` · ${new Date(explanation!.explainedAt).toLocaleDateString()}`}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── CriterionRow ─────────────────────────────────────────────────────────── */

function CriterionRow({
  label, Icon, criterion,
}: {
  label:     string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Icon:      any;
  criterion: CriterionBreakdown;
}) {
  const score    = criterion.score ?? 0;
  const barColor =
    score >= 80 ? "bg-emerald-500" :
    score >= 60 ? "bg-amber-500"   :
                  "bg-red-400";

  const hasSkillChips =
    (criterion.matched && criterion.matched.length > 0) ||
    (criterion.missing && criterion.missing.length > 0);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 font-medium text-foreground">
          <Icon className="h-3 w-3 text-muted-foreground" />
          {label}
        </div>
        <span className="tabular-nums font-semibold text-foreground">{score}</span>
      </div>
      <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", barColor)}
          style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
        />
      </div>
      {criterion.summary && (
        <p className="text-[11px] text-muted-foreground">{criterion.summary}</p>
      )}
      {hasSkillChips && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {criterion.matched?.map((s) => (
            <span
              key={`m-${s}`}
              className="rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-medium"
            >
              ✓ {s}
            </span>
          ))}
          {criterion.missing?.map((s) => (
            <span
              key={`x-${s}`}
              className="rounded-md bg-red-50 text-red-700 border border-red-200 px-1.5 py-0.5 text-[10px] font-medium"
            >
              × {s}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
