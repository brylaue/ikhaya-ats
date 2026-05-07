"use client";

/**
 * BiasCheckPanel — US-483: JD Bias Checker
 *
 * Placed below the Job Description textarea. Sends the current description
 * text to /api/ai/bias-check and renders:
 *   - A bias score badge (green / amber / red)
 *   - A summary sentence
 *   - A card per flagged issue with phrase, severity, explanation, and suggestion
 *
 * Props:
 *   text — current value of the JD textarea (controlled from parent)
 */

import { useState }       from "react";
import { Loader2, ShieldCheck, AlertTriangle, AlertCircle, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { cn }             from "@/lib/utils";
import type { BiasCheckResult, BiasIssue, BiasSeverity, BiasCategory } from "@/app/api/ai/bias-check/route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function severityConfig(s: BiasSeverity) {
  return {
    high:   { label: "High",   bg: "bg-red-50",    text: "text-red-700",    border: "border-red-200",   icon: AlertCircle  },
    medium: { label: "Medium", bg: "bg-amber-50",  text: "text-amber-700",  border: "border-amber-200", icon: AlertTriangle },
    low:    { label: "Low",    bg: "bg-blue-50",   text: "text-blue-700",   border: "border-blue-200",  icon: AlertTriangle },
  }[s] ?? { label: s, bg: "bg-muted", text: "text-muted-foreground", border: "border-border", icon: AlertTriangle };
}

function categoryLabel(c: BiasCategory): string {
  const map: Record<BiasCategory, string> = {
    gendered_language:         "Gendered language",
    ageism:                    "Age bias",
    exclusionary_requirement:  "Exclusionary requirement",
    culture_fit_code:          "Culture-fit code",
    ability_bias:              "Ability bias",
    socioeconomic:             "Socioeconomic assumption",
    other:                     "Other",
  };
  return map[c] ?? c;
}

function scoreColor(score: number) {
  if (score === 0)   return "text-emerald-600 bg-emerald-50 border-emerald-200";
  if (score <= 25)   return "text-emerald-600 bg-emerald-50 border-emerald-200";
  if (score <= 50)   return "text-amber-600   bg-amber-50   border-amber-200";
  return               "text-red-600     bg-red-50     border-red-200";
}

function scoreLabel(score: number) {
  if (score === 0)  return "No issues";
  if (score <= 25)  return "Minor";
  if (score <= 50)  return "Moderate";
  if (score <= 75)  return "Significant";
  return "Severe";
}

// ─── Issue card ───────────────────────────────────────────────────────────────

function IssueCard({ issue }: { issue: BiasIssue }) {
  const [open, setOpen] = useState(false);
  const sev = severityConfig(issue.severity);
  const SevIcon = sev.icon;

  return (
    <div className={cn("rounded-lg border p-3 text-sm", sev.bg, sev.border)}>
      <button
        className="w-full flex items-start gap-2.5 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <SevIcon className={cn("h-4 w-4 mt-0.5 shrink-0", sev.text)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <code className={cn("font-mono text-[12px] font-semibold", sev.text)}>
              &ldquo;{issue.phrase}&rdquo;
            </code>
            <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full border", sev.bg, sev.text, sev.border)}>
              {categoryLabel(issue.category)}
            </span>
          </div>
        </div>
        {open
          ? <ChevronUp   className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
          : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />}
      </button>

      {open && (
        <div className="mt-2 pl-6 space-y-1.5">
          <p className="text-xs text-foreground/80">{issue.explanation}</p>
          <div className="rounded-md bg-white/60 border border-white/80 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">
              Try instead
            </p>
            <p className="text-xs text-foreground">{issue.suggestion}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function BiasCheckPanel({ text }: { text: string }) {
  const [result,  setResult]  = useState<BiasCheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function runCheck() {
    if (!text || text.trim().length < 20) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/bias-check", {
        method:  "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": "1" },
        body:    JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analysis failed");
      setResult(data as BiasCheckResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }

  const hasIssues = result && result.issues.length > 0;
  const highCount = result?.issues.filter((i) => i.severity === "high").length ?? 0;

  return (
    <div className="space-y-3">
      {/* Trigger button */}
      <button
        type="button"
        onClick={runCheck}
        disabled={loading || !text || text.trim().length < 20}
        className="flex items-center gap-1.5 rounded-md border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-40 transition-colors"
      >
        {loading
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <Sparkles className="h-3.5 w-3.5" />}
        {loading ? "Analyzing…" : "Check for bias"}
      </button>

      {/* Error */}
      {error && (
        <p className="text-xs text-red-600 flex items-center gap-1">
          <AlertCircle className="h-3.5 w-3.5" />{error}
        </p>
      )}

      {/* Results */}
      {result && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          {/* Score + summary */}
          <div className="flex items-start gap-3">
            <div className={cn("shrink-0 rounded-lg border px-3 py-2 text-center min-w-[64px]", scoreColor(result.score))}>
              <div className="text-xl font-bold leading-none">{result.score}</div>
              <div className="text-[10px] font-medium mt-0.5">{scoreLabel(result.score)}</div>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {result.issues.length === 0
                  ? <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  : <AlertTriangle className={cn("h-4 w-4", highCount > 0 ? "text-red-500" : "text-amber-500")} />}
                <span className="text-sm font-semibold text-foreground">
                  {result.issues.length === 0
                    ? "No bias detected"
                    : `${result.issues.length} issue${result.issues.length !== 1 ? "s" : ""} found`}
                </span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{result.summary}</p>
            </div>
          </div>

          {/* Issue list */}
          {hasIssues && (
            <div className="space-y-2">
              {result.issues
                .sort((a, b) => {
                  const order = { high: 0, medium: 1, low: 2 };
                  return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
                })
                .map((issue, i) => (
                  <IssueCard key={i} issue={issue} />
                ))}
            </div>
          )}

          {/* Re-check nudge */}
          <p className="text-[11px] text-muted-foreground text-right">
            Edited the description?{" "}
            <button
              type="button"
              onClick={runCheck}
              disabled={loading}
              className="text-violet-600 hover:text-violet-700 font-medium underline underline-offset-2"
            >
              Re-analyze
            </button>
          </p>
        </div>
      )}
    </div>
  );
}
