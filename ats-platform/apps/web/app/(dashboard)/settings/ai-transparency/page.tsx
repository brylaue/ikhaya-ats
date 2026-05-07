"use client";

/**
 * Settings → AI Transparency
 * US-422: EU AI Act-aligned decision log + candidate-portal transparency toggle.
 *
 * Surfaces:
 *   - Master toggle: `ai_transparency_enabled` (affects candidate portal only;
 *     internal logging always stays on)
 *   - 30-day activity summary grouped by decision type
 *   - Filterable decision table (type, date range)
 *
 * Data source: GET /api/settings/ai-transparency
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Shield, Sparkles, Filter, ExternalLink, Eye, EyeOff, Clock, Loader2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DecisionRow {
  id:                   string;
  decision_type:        string;
  subject_type:         string;
  subject_id:           string | null;
  related_type:         string | null;
  related_id:           string | null;
  provider:             string;
  model:                string;
  model_card_url:       string | null;
  rationale:            string | null;
  visible_to_candidate: boolean;
  created_at:           string;
  user_id:              string | null;
  user_email:           string | null;
  user_name:            string | null;
  input_tokens:         number | null;
  output_tokens:        number | null;
  estimated_cost_usd:   number | null;
  latency_ms:           number | null;
}

interface ApiResponse {
  enabled:   boolean;
  decisions: DecisionRow[];
  summary:   { window: string; countsByType: Record<string, number>; total: number };
}

const TYPE_LABELS: Record<string, string> = {
  match_score_embedding:  "Vector match",
  match_score_explain:    "Explained match",
  resume_parse:           "Resume parse",
  skill_normalise:        "Skill normalise",
  candidate_summary:      "Candidate summary",
  candidate_outreach:     "Outreach draft",
  interview_questions:    "Interview questions",
  shortlist_compile:      "Shortlist",
  boolean_search:         "Boolean search",
  bias_check:             "Bias check",
  nl_talent_query:        "NL search",
  semantic_global_search: "Semantic search",
  auto_tag:               "Auto-tag",
};

function typeLabel(t: string): string {
  return TYPE_LABELS[t] ?? t;
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60)         return `${s}s ago`;
  if (s < 3_600)      return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400)     return `${Math.floor(s / 3_600)}h ago`;
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)}d ago`;
  return d.toLocaleDateString();
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function AiTransparencyPage() {
  const [data, setData]         = useState<ApiResponse | null>(null);
  const [loading, setLoading]   = useState(true);
  const [typeFilter, setType]   = useState<string>("");
  const [saving, setSaving]     = useState(false);
  const [err, setErr]           = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const qs = typeFilter ? `?type=${encodeURIComponent(typeFilter)}` : "";
      const res = await fetch(`/api/settings/ai-transparency${qs}`, { credentials: "same-origin" });
      if (!res.ok) throw new Error(`Load failed (${res.status})`);
      const json = await res.json() as ApiResponse;
      setData(json);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [typeFilter]);

  useEffect(() => { void load(); }, [load]);

  async function toggleEnabled(next: boolean) {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/ai-transparency", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ enabled: next }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Save failed" }));
        toast.error(error ?? "Save failed");
        return;
      }
      toast.success(next ? "Candidate transparency enabled" : "Candidate transparency disabled");
      await load();
    } finally {
      setSaving(false);
    }
  }

  const topTypes = useMemo(() => {
    if (!data?.summary) return [] as Array<[string, number]>;
    return Object.entries(data.summary.countsByType)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [data]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-gray-900">
            <Shield className="h-6 w-6 text-violet-600" />
            AI Transparency
          </h1>
          <p className="text-sm text-gray-600 mt-1 max-w-2xl">
            Every AI-assisted decision your team makes is logged for audit and candidate transparency.
            Internal logging is always on; the toggle below controls whether candidates see the decisions that shaped
            their experience in the portal.
          </p>
        </div>
      </div>

      {/* Master toggle */}
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Candidate-facing transparency</h2>
            <p className="text-xs text-gray-600 mt-1 max-w-xl">
              When enabled, candidates see an "AI-assisted" badge and a list of the decisions that shaped their
              experience (match scores against jobs, resume parse, skill normalisation). They do not see recruiter-only
              tools like boolean-search generation or JD bias checks.
            </p>
          </div>
          <div>
            <button
              type="button"
              onClick={() => toggleEnabled(!data?.enabled)}
              disabled={saving || loading}
              className={cn(
                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                data?.enabled ? "bg-violet-600" : "bg-gray-300",
                (saving || loading) && "opacity-50 cursor-wait",
              )}
              aria-pressed={data?.enabled ? "true" : "false"}
              aria-label="Toggle candidate-facing transparency"
            >
              <span
                className={cn(
                  "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                  data?.enabled ? "translate-x-6" : "translate-x-1",
                )}
              />
            </button>
          </div>
        </div>
      </section>

      {/* 30-day activity summary */}
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-600" />
            Last 30 days
          </h2>
          <span className="text-xs text-gray-500">{data?.summary?.total ?? 0} decisions</span>
        </div>
        {loading && !data && (
          <div className="text-sm text-gray-500 py-4">Loading…</div>
        )}
        {topTypes.length === 0 && !loading && (
          <div className="text-sm text-gray-500 py-2">No AI activity in the last 30 days.</div>
        )}
        {topTypes.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {topTypes.map(([type, count]) => (
              <div key={type} className="rounded border border-gray-100 bg-gray-50 px-3 py-2">
                <div className="text-xs text-gray-500">{typeLabel(type)}</div>
                <div className="text-lg font-semibold text-gray-900">{count}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Filter + table */}
      <section className="rounded-lg border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-900">Recent decisions</h2>
          <div className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-gray-400" />
            <select
              value={typeFilter}
              onChange={(e) => setType(e.target.value)}
              className="rounded border border-gray-200 px-2 py-1 text-xs focus:border-violet-400 focus:ring-1 focus:ring-violet-200 focus:outline-none"
            >
              <option value="">All types</option>
              {Object.keys(TYPE_LABELS).map((k) => (
                <option key={k} value={k}>{typeLabel(k)}</option>
              ))}
            </select>
          </div>
        </div>

        {err && (
          <div className="m-5 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" /> {err}
          </div>
        )}

        {loading && !data && (
          <div className="px-5 py-10 text-center text-sm text-gray-500 flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading decisions…
          </div>
        )}

        {!loading && (data?.decisions.length ?? 0) === 0 && (
          <div className="px-5 py-10 text-center text-sm text-gray-500">
            No decisions match this filter.
          </div>
        )}

        {data && data.decisions.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="text-left px-4 py-2">Type</th>
                  <th className="text-left px-4 py-2">Subject</th>
                  <th className="text-left px-4 py-2">User</th>
                  <th className="text-left px-4 py-2">Model</th>
                  <th className="text-right px-4 py-2">Cost</th>
                  <th className="text-left px-4 py-2">When</th>
                  <th className="text-left px-4 py-2">Visible</th>
                </tr>
              </thead>
              <tbody>
                {data.decisions.map((d) => (
                  <tr key={d.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <div className="font-medium text-gray-900">{typeLabel(d.decision_type)}</div>
                      {d.rationale && (
                        <div className="text-[11px] text-gray-500 max-w-xs truncate">{d.rationale}</div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-600">
                      <div>{d.subject_type}</div>
                      {d.subject_id && (
                        <div className="text-[11px] text-gray-400 font-mono truncate max-w-[10rem]">{d.subject_id.slice(0, 8)}…</div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-600 text-xs">
                      {d.user_name || d.user_email || <span className="text-gray-400">system</span>}
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-600">
                      <div>{d.model}</div>
                      {d.model_card_url && (
                        <a
                          href={d.model_card_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-violet-600 hover:text-violet-800 inline-flex items-center gap-0.5"
                        >
                          card <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-gray-600">
                      {d.estimated_cost_usd != null ? `$${d.estimated_cost_usd.toFixed(4)}` : "—"}
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-500">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {formatRelative(d.created_at)}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      {d.visible_to_candidate ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 text-[11px]">
                          <Eye className="h-3 w-3" /> visible
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 text-gray-600 px-2 py-0.5 text-[11px]">
                          <EyeOff className="h-3 w-3" /> internal
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
