"use client";

/**
 * <AiAssistedBadge />
 * US-422: Subtle "AI-assisted" pill + modal listing the decisions that
 * shaped a given candidate's surface.
 *
 * Props:
 *   - candidateId: uuid of the candidate this badge annotates
 *   - variant:     "pill" (default, recruiter surface) | "link" (inline,
 *                  text-button — used next to match scores and summaries)
 *
 * Fetches from /api/candidates/[id]/ai-decisions lazily when the modal
 * opens. Recruiter-facing: shows both candidate-visible and internal
 * decisions, grouped by type.
 */

import { useEffect, useState, useCallback } from "react";
import { Sparkles, X, ExternalLink, Shield, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "pill" | "link";

interface AiDecision {
  id:                   string;
  decision_type:        string;
  subject_type:         string;
  subject_id:           string | null;
  related_type:         string | null;
  related_id:           string | null;
  provider:             string;
  model:                string;
  model_version:        string | null;
  model_card_url:       string | null;
  rationale:            string | null;
  visible_to_candidate: boolean;
  created_at:           string;
  user_email:           string | null;
  user_name:            string | null;
  input_tokens:         number | null;
  output_tokens:        number | null;
  estimated_cost_usd:   number | null;
  latency_ms:           number | null;
}

const TYPE_LABELS: Record<string, string> = {
  match_score_embedding:  "Vector match score",
  match_score_explain:    "Explainable match score",
  resume_parse:           "Resume parse",
  skill_normalise:        "Skill normalisation",
  candidate_summary:      "Candidate summary",
  candidate_outreach:     "Outreach draft",
  interview_questions:    "Interview questions",
  shortlist_compile:      "Shortlist compilation",
  boolean_search:         "Boolean search translation",
  bias_check:             "JD bias check",
  nl_talent_query:        "Natural-language search",
  semantic_global_search: "Semantic search",
  auto_tag:               "Auto-tag",
};

function typeLabel(t: string): string {
  return TYPE_LABELS[t] ?? t;
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60)       return `${s}s ago`;
  if (s < 3_600)    return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400)   return `${Math.floor(s / 3_600)}h ago`;
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)}d ago`;
  return d.toLocaleDateString();
}

interface Props {
  candidateId: string;
  variant?:    Variant;
  label?:      string;
}

export function AiAssistedBadge({ candidateId, variant = "pill", label }: Props) {
  const [open, setOpen]           = useState(false);
  const [loading, setLoading]     = useState(false);
  const [decisions, setDecisions] = useState<AiDecision[] | null>(null);
  const [error, setError]         = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/ai-decisions`, {
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const json = await res.json();
      setDecisions((json.decisions ?? []) as AiDecision[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [candidateId]);

  useEffect(() => {
    if (open && decisions === null && !loading) {
      void load();
    }
  }, [open, decisions, loading, load]);

  const trigger = variant === "link"
    ? (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs text-violet-600 hover:text-violet-800 underline decoration-dotted"
      >
        <Sparkles className="h-3 w-3" />
        {label ?? "AI-assisted"}
      </button>
    )
    : (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50",
          "px-2 py-0.5 text-[11px] font-medium text-violet-700",
          "hover:border-violet-300 hover:bg-violet-100",
        )}
        aria-label="View AI decisions for this candidate"
      >
        <Sparkles className="h-3 w-3" />
        {label ?? "AI-assisted"}
      </button>
    );

  return (
    <>
      {trigger}
      {open && (
        <Modal
          onClose={() => setOpen(false)}
          loading={loading}
          error={error}
          decisions={decisions ?? []}
          onRetry={load}
        />
      )}
    </>
  );
}

function Modal({
  onClose, loading, error, decisions, onRetry,
}: {
  onClose:   () => void;
  loading:   boolean;
  error:     string | null;
  decisions: AiDecision[];
  onRetry:   () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-lg bg-white shadow-xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-600" />
            <h2 className="text-base font-semibold text-gray-900">AI decisions for this candidate</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="text-xs text-gray-500 mb-4">
            Every AI-assisted action taken on this record is logged here.
            Decisions marked <span className="inline-flex items-center gap-0.5 font-medium text-gray-700"><Eye className="h-3 w-3" />candidate-visible</span> appear in the candidate's portal transparency view.
          </p>

          {loading && (
            <div className="text-sm text-gray-500 py-8 text-center">Loading…</div>
          )}

          {error && !loading && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}{" "}
              <button onClick={onRetry} className="underline">Retry</button>
            </div>
          )}

          {!loading && !error && decisions.length === 0 && (
            <div className="text-sm text-gray-500 py-8 text-center">
              No AI decisions recorded for this candidate yet.
            </div>
          )}

          {!loading && !error && decisions.length > 0 && (
            <ol className="space-y-3">
              {decisions.map((d) => (
                <li key={d.id} className="rounded border border-gray-200 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-900">{typeLabel(d.decision_type)}</span>
                        {d.visible_to_candidate ? (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 text-emerald-700 px-1.5 py-0.5 text-[10px] font-medium">
                            <Eye className="h-2.5 w-2.5" />
                            candidate-visible
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-gray-100 text-gray-600 px-1.5 py-0.5 text-[10px]">
                            <EyeOff className="h-2.5 w-2.5" />
                            internal
                          </span>
                        )}
                      </div>
                      {d.rationale && (
                        <p className="text-xs text-gray-600 mt-1 leading-relaxed">{d.rationale}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-500 flex-wrap">
                        <span className="inline-flex items-center gap-1">
                          <Shield className="h-3 w-3" />
                          {d.provider}/{d.model}
                        </span>
                        {d.model_card_url && (
                          <a
                            href={d.model_card_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 text-violet-600 hover:text-violet-800 underline"
                          >
                            model card <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        )}
                        <span>{d.user_email ?? "system"}</span>
                        <span>{formatRelative(d.created_at)}</span>
                        {d.estimated_cost_usd != null && (
                          <span>${d.estimated_cost_usd.toFixed(4)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-5 py-3 text-[11px] text-gray-500">
          AI decision logs support EU AI Act auditability and candidate-side transparency (US-422).
        </div>
      </div>
    </div>
  );
}
