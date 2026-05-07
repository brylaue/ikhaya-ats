"use client";

/**
 * ShortlistModal — US-384: AI Shortlist Compiler
 *
 * Triggered from the job detail page. Calls POST /api/jobs/[id]/shortlist,
 * renders ranked candidate cards with AI summaries, and lets recruiter
 * download as markdown or copy to clipboard.
 */

import { useState } from "react";
import {
  X, Sparkles, Loader2, Download, Copy, Check,
  TrendingUp, MapPin, Building2, ChevronDown, ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ShortlistEntry {
  rank:           number;
  candidateId:    string;
  fullName:       string;
  currentTitle:   string | null;
  currentCompany: string | null;
  location:       string | null;
  skills:         string[];
  score:          number;
  aiSummary:      string;
}

interface ShortlistModalProps {
  jobId:    string;
  jobTitle: string;
  onClose:  () => void;
}

export function ShortlistModal({ jobId, jobTitle, onClose }: ShortlistModalProps) {
  const [compiling, setCompiling]     = useState(false);
  const [shortlist, setShortlist]     = useState<ShortlistEntry[]>([]);
  const [markdown, setMarkdown]       = useState("");
  const [compiled, setCompiled]       = useState(false);
  const [expanded, setExpanded]       = useState<Set<string>>(new Set());
  const [copied, setCopied]           = useState(false);
  const [limit, setLimit]             = useState(8);

  async function compile() {
    setCompiling(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/shortlist`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ limit }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setShortlist(data.shortlist);
      setMarkdown(data.markdown);
      setCompiled(true);
    } catch (err) {
      console.error(err);
      toast.error("Shortlist compilation failed");
    } finally {
      setCompiling(false);
    }
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function downloadMarkdown() {
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `shortlist-${jobTitle.toLowerCase().replace(/\s+/g, "-")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function copyMarkdown() {
    navigator.clipboard.writeText(markdown).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const scoreColor = (score: number) =>
    score >= 80 ? "bg-emerald-100 text-emerald-700" :
    score >= 60 ? "bg-amber-100 text-amber-700"     : "bg-secondary text-muted-foreground";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-background shadow-xl border border-border overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-gradient-to-r from-brand-50 to-violet-50">
          <div>
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-brand-600" />AI Shortlist Compiler
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">{jobTitle}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-accent transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {!compiled ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Claude will write tailored 2–3 sentence summaries for your top candidates, ranked by AI match score for this role.
              </p>
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-foreground">Candidates to include</label>
                <select
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {[5, 8, 10, 15, 20].map((n) => <option key={n} value={n}>Top {n}</option>)}
                </select>
              </div>
              <button
                onClick={compile}
                disabled={compiling}
                className="flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                {compiling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {compiling ? "Compiling…" : "Compile Shortlist"}
              </button>
            </div>
          ) : shortlist.length === 0 ? (
            <div className="py-8 text-center space-y-2">
              <TrendingUp className="h-8 w-8 text-muted-foreground mx-auto" />
              <p className="text-sm font-medium text-foreground">No scored candidates yet</p>
              <p className="text-xs text-muted-foreground">Run the embedding backfill to generate AI match scores for this job.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Export actions */}
              <div className="flex items-center gap-2 justify-end">
                <button
                  onClick={copyMarkdown}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied!" : "Copy Markdown"}
                </button>
                <button
                  onClick={downloadMarkdown}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />Download .md
                </button>
              </div>

              {/* Candidate cards */}
              {shortlist.map((entry) => (
                <div key={entry.candidateId} className="rounded-xl border border-border bg-card overflow-hidden">
                  <div
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-accent/50 transition-colors"
                    onClick={() => toggleExpand(entry.candidateId)}
                  >
                    {/* Rank badge */}
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[11px] font-bold text-brand-700">
                      {entry.rank}
                    </span>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{entry.fullName}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {entry.currentTitle ?? "—"}{entry.currentCompany ? ` · ${entry.currentCompany}` : ""}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {entry.location && (
                        <span className="hidden sm:flex items-center gap-0.5 text-[10px] text-muted-foreground">
                          <MapPin className="h-3 w-3" />{entry.location}
                        </span>
                      )}
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums", scoreColor(entry.score))}>
                        {entry.score}%
                      </span>
                      {expanded.has(entry.candidateId)
                        ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                        : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      }
                    </div>
                  </div>

                  {expanded.has(entry.candidateId) && (
                    <div className="border-t border-border px-4 py-3 space-y-2.5 bg-muted/20">
                      {/* AI summary */}
                      <p className="text-xs text-foreground leading-relaxed">{entry.aiSummary}</p>

                      {/* Skills */}
                      {entry.skills.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {entry.skills.map((s) => (
                            <span key={s} className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">{s}</span>
                          ))}
                        </div>
                      )}

                      {/* Link to profile */}
                      <a
                        href={`/candidates/${entry.candidateId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-600 hover:underline"
                      >
                        View full profile →
                      </a>
                    </div>
                  )}
                </div>
              ))}

              {/* Recompile */}
              <button
                onClick={() => { setCompiled(false); setShortlist([]); setMarkdown(""); }}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                Recompile with different settings
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
