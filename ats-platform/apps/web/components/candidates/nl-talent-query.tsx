"use client";

/**
 * NLTalentQuery
 * US-116: Natural-Language Talent Pool Query.
 *
 * A chat-style search panel that accepts plain-English recruiter queries,
 * calls /api/ai/talent-query, and renders a ranked candidate result list.
 * Shown when the sourcing page is in "AI Search" mode.
 */

import { useState, useRef } from "react";
import {
  Sparkles,
  Search,
  Loader2,
  AlertCircle,
  MapPin,
  Building2,
  Mail,
  Linkedin,
  BookmarkPlus,
  ChevronDown,
  ChevronUp,
  X,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { ExtractedFilters, TalentQueryResult } from "@/app/api/ai/talent-query/route";

// ─── Suggested queries ────────────────────────────────────────────────────────

const SUGGESTED = [
  "Senior React engineers with 5+ years in London or Remote",
  "VP of Sales with SaaS and enterprise experience",
  "Data scientists who know Python and PyTorch, available immediately",
  "Product managers from B2B fintech companies",
  "DevOps engineers experienced with Kubernetes and AWS",
];

// ─── Filter pill display ──────────────────────────────────────────────────────

function FilterPills({ filters }: { filters: ExtractedFilters }) {
  const pills: Array<{ label: string; color: string }> = [];

  filters.skills.forEach(s => pills.push({ label: s, color: "bg-brand-50 text-brand-700 border-brand-200" }));
  filters.titles.forEach(t => pills.push({ label: t, color: "bg-violet-50 text-violet-700 border-violet-200" }));
  filters.locations.forEach(l => pills.push({ label: `📍 ${l}`, color: "bg-amber-50 text-amber-700 border-amber-200" }));
  if (filters.minExperience) pills.push({ label: `${filters.minExperience}+ yrs exp`, color: "bg-slate-100 text-slate-600 border-slate-200" });
  if (filters.availability?.length > 0) pills.push({ label: filters.availability[0].replace("immediately", "Available now").replace("30days", "Avail. 30d"), color: "bg-emerald-50 text-emerald-700 border-emerald-200" });

  if (pills.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {pills.map((p, i) => (
        <span key={i} className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium", p.color)}>
          {p.label}
        </span>
      ))}
    </div>
  );
}

// ─── Candidate result row ─────────────────────────────────────────────────────

function ResultRow({
  candidate,
  onAddToPipeline,
}: {
  candidate: TalentQueryResult;
  onAddToPipeline: (c: TalentQueryResult) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const scoreColor =
    candidate.matchScore >= 80 ? "text-emerald-700 bg-emerald-50 border-emerald-200" :
    candidate.matchScore >= 60 ? "text-brand-700 bg-brand-50 border-brand-200" :
    "text-slate-600 bg-slate-100 border-slate-200";

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-start gap-3 p-4">
        {/* Avatar */}
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-sm font-bold text-white">
          {candidate.firstName[0]}{candidate.lastName[0]}
        </div>

        {/* Main info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-900">{candidate.fullName}</span>
            <span className={cn("inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-bold", scoreColor)}>
              <Star className="h-2.5 w-2.5 fill-current" />
              {candidate.matchScore}%
            </span>
          </div>
          {candidate.currentTitle && (
            <p className="text-xs text-slate-500 mt-0.5">
              {candidate.currentTitle}
              {candidate.currentCompany && <span className="text-slate-400"> · {candidate.currentCompany}</span>}
            </p>
          )}

          {/* Meta row */}
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
            {candidate.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />{candidate.location}
              </span>
            )}
            {candidate.currentCompany && !candidate.location && (
              <span className="flex items-center gap-1">
                <Building2 className="h-3 w-3" />{candidate.currentCompany}
              </span>
            )}
          </div>

          {/* Match reason */}
          <p className="mt-1.5 text-[11px] italic text-slate-400">{candidate.matchReason}</p>

          {/* Skills preview */}
          {candidate.skills.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {candidate.skills.slice(0, 5).map((s, i) => (
                <span key={i} className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{s}</span>
              ))}
              {candidate.skills.length > 5 && (
                <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">+{candidate.skills.length - 5}</span>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {candidate.email && (
            <a
              href={`mailto:${candidate.email}`}
              onClick={(e) => e.stopPropagation()}
              className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
              title="Email"
            >
              <Mail className="h-3.5 w-3.5" />
            </a>
          )}
          {candidate.linkedinUrl && (
            <a
              href={candidate.linkedinUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
              title="LinkedIn"
            >
              <Linkedin className="h-3.5 w-3.5" />
            </a>
          )}
          <button
            onClick={() => onAddToPipeline(candidate)}
            className="flex items-center gap-1 rounded-lg bg-brand-50 border border-brand-200 px-2.5 py-1.5 text-[11px] font-semibold text-brand-700 hover:bg-brand-100 transition-colors"
          >
            <BookmarkPlus className="h-3 w-3" />
            Add
          </button>
          {candidate.summary && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      </div>

      {expanded && candidate.summary && (
        <div className="border-t border-slate-100 px-4 py-3 bg-slate-50">
          <p className="text-xs text-slate-600 leading-relaxed">{candidate.summary}</p>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface NLTalentQueryProps {
  onAddToPipeline?: (candidate: TalentQueryResult) => void;
}

export function NLTalentQuery({ onAddToPipeline }: NLTalentQueryProps) {
  const [input,           setInput]           = useState("");
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState<string | null>(null);
  const [results,         setResults]         = useState<TalentQueryResult[] | null>(null);
  const [interpretation,  setInterpretation]  = useState<string | null>(null);
  const [appliedFilters,  setAppliedFilters]  = useState<ExtractedFilters | null>(null);
  const [totalMatched,    setTotalMatched]    = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function runQuery(q: string) {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    setResults(null);
    setInterpretation(null);
    setAppliedFilters(null);

    try {
      const res = await fetch("/api/ai/talent-query", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ query: q }),
      });

      if (!res.ok) {
        const { error: e } = await res.json();
        if (res.status === 429) throw new Error("AI usage limit reached — try again later or upgrade your plan");
        throw new Error(e ?? "Query failed");
      }

      const data = await res.json();
      setResults(data.candidates ?? []);
      setInterpretation(data.interpretation ?? null);
      setAppliedFilters(data.appliedFilters ?? null);
      setTotalMatched(data.totalMatched ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Query failed");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void runQuery(input);
  }

  function handleSuggestion(s: string) {
    setInput(s);
    void runQuery(s);
  }

  function handleAddToPipeline(candidate: TalentQueryResult) {
    onAddToPipeline?.(candidate);
    toast.success(`${candidate.fullName} added to pipeline`);
  }

  function clearResults() {
    setResults(null);
    setInterpretation(null);
    setAppliedFilters(null);
    setInput("");
    textareaRef.current?.focus();
  }

  return (
    <div className="flex flex-col h-full">

      {/* Query input */}
      <div className="shrink-0 p-4 border-b border-slate-100 bg-gradient-to-r from-brand-50/40 to-violet-50/40">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void runQuery(input); }
              }}
              placeholder="Describe who you're looking for in plain English…&#10;e.g. Senior Python engineers with ML experience, based in London, available within 30 days"
              rows={3}
              className="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 pr-12 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200 transition-all"
            />
            <div className="absolute bottom-3 right-3 flex items-center gap-1.5">
              {input && !loading && (
                <button
                  type="button"
                  onClick={() => setInput("")}
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Suggestions */}
          {!results && !loading && (
            <div className="flex flex-wrap gap-1.5">
              <span className="text-[11px] text-slate-400 flex items-center gap-1 mr-1">
                <Sparkles className="h-3 w-3" /> Try:
              </span>
              {SUGGESTED.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleSuggestion(s)}
                  className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </form>
      </div>

      {/* Results area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="relative">
              <Sparkles className="h-8 w-8 text-brand-400" />
              <Loader2 className="absolute -top-1 -right-1 h-4 w-4 animate-spin text-brand-600" />
            </div>
            <p className="text-sm text-slate-500">Searching your talent pool…</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
            <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-800">Search failed</p>
              <p className="text-xs text-red-600 mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Results header */}
        {results && !loading && (
          <>
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1.5 flex-1">
                {interpretation && (
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-brand-500 shrink-0" />
                    <p className="text-sm text-slate-700 font-medium">{interpretation}</p>
                  </div>
                )}
                {appliedFilters && <FilterPills filters={appliedFilters} />}
                <p className="text-xs text-slate-400">
                  {results.length} of {totalMatched} candidates shown, ranked by relevance
                </p>
              </div>
              <button
                onClick={clearResults}
                className="shrink-0 text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </button>
            </div>

            {/* Empty state */}
            {results.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center">
                <p className="text-sm font-medium text-slate-600 mb-1">No candidates matched</p>
                <p className="text-xs text-slate-400">Try broadening your search — fewer skills, wider location, or looser experience range.</p>
              </div>
            )}

            {/* Candidate rows */}
            {results.map((candidate) => (
              <ResultRow
                key={candidate.id}
                candidate={candidate}
                onAddToPipeline={handleAddToPipeline}
              />
            ))}
          </>
        )}

        {/* Empty initial state */}
        {!results && !loading && !error && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <div className="rounded-full bg-brand-50 p-4">
              <Sparkles className="h-7 w-7 text-brand-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700 mb-1">AI Talent Search</p>
              <p className="text-xs text-slate-400 max-w-xs">
                Describe the candidate you're looking for in plain English. The AI will search your talent pool and rank the best matches.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
