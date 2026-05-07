"use client";

/**
 * InterviewPrepModal
 * US-485: AI Interview Prep Question Generator.
 *
 * Shown from the pipeline kanban card menu or the candidate detail page.
 * Generates tailored interview questions using the candidate's profile + JD.
 * Questions are grouped by category and can be copied to clipboard.
 */

import { useState, useEffect } from "react";
import {
  X,
  Loader2,
  Copy,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  BrainCircuit,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PrepQuestion {
  question:  string;
  rationale: string;
}

interface PrepSection {
  category:  string;
  questions: PrepQuestion[];
}

interface InterviewPrepModalProps {
  candidateId:    string;
  candidateName?: string;
  jobId?:         string;
  jobTitle?:      string;
  onClose:        () => void;
}

// ─── Section accordion ────────────────────────────────────────────────────────

function PrepSectionCard({ section, index }: { section: PrepSection; index: number }) {
  const [open,   setOpen]   = useState(true);
  const [copied, setCopied] = useState(false);

  const colors = [
    "bg-indigo-50 border-indigo-200 text-indigo-700",
    "bg-violet-50 border-violet-200 text-violet-700",
    "bg-emerald-50 border-emerald-200 text-emerald-700",
    "bg-amber-50  border-amber-200  text-amber-700",
  ];
  const accent = colors[index % colors.length];

  function copyAll() {
    const text = section.questions
      .map((q, i) => `${i + 1}. ${q.question}`)
      .join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-slate-50 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <span className={cn("inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border", accent)}>
            {section.questions.length}
          </span>
          <span className="text-sm font-semibold text-slate-800">{section.category}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); copyAll(); }}
            className="p-1 rounded text-slate-400 hover:text-slate-700 transition-colors"
            title="Copy all questions"
          >
            {copied ? <CheckCheck className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </div>
      </button>
      {open && (
        <div className="border-t border-slate-100 divide-y divide-slate-100">
          {section.questions.map((q, qi) => (
            <div key={qi} className="px-4 py-3 bg-white">
              <p className="text-sm font-medium text-slate-800 mb-1">{qi + 1}. {q.question}</p>
              <p className="text-xs text-slate-500 italic">{q.rationale}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export function InterviewPrepModal({
  candidateId,
  candidateName,
  jobId,
  jobTitle,
  onClose,
}: InterviewPrepModalProps) {
  const [sections, setSections] = useState<PrepSection[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch("/api/ai/interview-prep", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateId, jobId }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
        return r.json();
      })
      .then(({ sections: s }) => setSections(s ?? []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [candidateId, jobId]);

  function copyAll() {
    const text = sections
      .map((s) =>
        `## ${s.category}\n` +
        s.questions.map((q, i) => `${i + 1}. ${q.question}`).join("\n")
      )
      .join("\n\n");
    navigator.clipboard.writeText(text).then(() => toast.success("All questions copied"));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2">
            <BrainCircuit className="h-5 w-5 text-brand-600" />
            <div>
              <h2 className="text-base font-semibold text-slate-900">Interview Prep</h2>
              <p className="text-xs text-slate-500">
                {candidateName && <span className="font-medium">{candidateName}</span>}
                {jobTitle && <span> · {jobTitle}</span>}
                {!candidateName && !jobTitle && "AI-generated questions"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {sections.length > 0 && (
              <button
                onClick={copyAll}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy all
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="h-7 w-7 animate-spin text-brand-600" />
              <p className="text-sm text-slate-500">Generating tailored questions…</p>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200">
              <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-800">Generation failed</p>
                <p className="text-xs text-red-600 mt-1">{error}</p>
              </div>
            </div>
          )}

          {!loading && !error && sections.map((section, i) => (
            <PrepSectionCard key={section.category} section={section} index={i} />
          ))}
        </div>

        {/* Footer */}
        {!loading && !error && sections.length > 0 && (
          <div className="px-6 py-3 border-t border-slate-100 shrink-0">
            <p className="text-xs text-slate-400 text-center">
              AI-generated — verify relevance before use. {sections.reduce((a, s) => a + s.questions.length, 0)} questions across {sections.length} categories.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
