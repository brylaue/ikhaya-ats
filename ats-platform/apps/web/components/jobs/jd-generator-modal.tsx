"use client";

/**
 * JdGeneratorModal — US-112: AI Job Description Generator & Assistant
 *
 * Modal for generating or rewriting a job description via Claude.
 * Includes inline bias flag highlights and rewrite mode buttons.
 */

import { useState } from "react";
import { X, Wand2, RefreshCw, AlertTriangle, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface BiasFlag { phrase: string; suggestion: string; index: number }

interface Props {
  initialTitle?:   string;
  initialClient?:  string;
  initialLevel?:   string;
  initialSkills?:  string[];
  onAccept:        (jd: string) => void;
  onClose:         () => void;
}

const LEVELS = ["Entry-level", "Junior", "Mid-level", "Senior", "Staff", "Principal", "Director", "VP"];
const REWRITE_MODES = [
  { key: "inclusive",  label: "Make inclusive" },
  { key: "shorter",    label: "Make shorter" },
  { key: "technical",  label: "More technical" },
] as const;

export function JdGeneratorModal({ initialTitle = "", initialClient = "", initialLevel = "Mid-level", initialSkills = [], onAccept, onClose }: Props) {
  const [form, setForm] = useState({
    title:  initialTitle,
    client: initialClient,
    level:  initialLevel,
    skills: initialSkills.join(", "),
  });
  const [jd, setJd] = useState("");
  const [biasFlags, setBiasFlags] = useState<BiasFlag[]>([]);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  async function generate(rewriteMode?: string) {
    if (!form.title && !jd) { toast.error("Enter a role title first"); return; }
    setGenerating(true);
    try {
      const res = await fetch("/api/ai/jd-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title:       form.title,
          clientName:  form.client,
          level:       form.level,
          skills:      form.skills.split(",").map(s => s.trim()).filter(Boolean),
          currentJd:   rewriteMode ? jd : undefined,
          rewriteMode,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setJd(data.jd);
      setBiasFlags(data.biasFlags ?? []);
    } catch (err: any) {
      toast.error(err.message ?? "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  function copyJd() {
    navigator.clipboard.writeText(jd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-brand-600" />
            <h2 className="text-base font-semibold text-foreground">AI Job Description Generator</h2>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left: inputs */}
          <div className="w-72 shrink-0 border-r border-border p-5 space-y-4 overflow-y-auto">
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">Role title *</label>
              <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Senior Backend Engineer"
                className="w-full px-2.5 py-1.5 border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-brand-600 bg-card" />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">Client / Company</label>
              <input type="text" value={form.client} onChange={e => setForm(f => ({ ...f, client: e.target.value }))}
                placeholder="e.g. Acme Corp"
                className="w-full px-2.5 py-1.5 border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-brand-600 bg-card" />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">Seniority level</label>
              <select value={form.level} onChange={e => setForm(f => ({ ...f, level: e.target.value }))}
                className="w-full px-2.5 py-1.5 border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-brand-600 bg-card">
                {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">Key skills</label>
              <textarea rows={3} value={form.skills} onChange={e => setForm(f => ({ ...f, skills: e.target.value }))}
                placeholder="React, TypeScript, AWS (comma-separated)"
                className="w-full px-2.5 py-1.5 border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-brand-600 bg-card resize-none" />
            </div>

            <button type="button" onClick={() => generate()} disabled={generating}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-md text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors">
              {generating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              {generating ? "Generating…" : jd ? "Regenerate" : "Generate JD"}
            </button>

            {jd && (
              <div className="space-y-1.5 pt-2 border-t border-border">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Rewrite</p>
                {REWRITE_MODES.map(m => (
                  <button key={m.key} type="button" onClick={() => generate(m.key)} disabled={generating}
                    className="w-full text-left px-2.5 py-1.5 border border-border rounded-md text-xs text-foreground hover:bg-muted/40 transition-colors">
                    {m.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right: output */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {biasFlags.length > 0 && (
              <div className="px-5 py-2.5 border-b border-border bg-amber-50 shrink-0">
                <div className="flex items-center gap-1.5 text-amber-700 text-xs font-medium">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {biasFlags.length} potential bias flag{biasFlags.length !== 1 ? "s" : ""} detected
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {biasFlags.map((f, i) => (
                    <span key={i} className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                      "{f.phrase}" → {f.suggestion}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <textarea
              value={jd}
              onChange={e => setJd(e.target.value)}
              placeholder="Generated job description will appear here — editable before accepting."
              className="flex-1 p-5 text-sm text-foreground bg-card resize-none focus:outline-none font-mono leading-relaxed"
            />

            {jd && (
              <div className="flex items-center gap-2 px-5 py-3 border-t border-border shrink-0">
                <button type="button" onClick={copyJd}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-xs text-foreground hover:bg-muted/40 transition-colors">
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied!" : "Copy"}
                </button>
                <div className="flex-1" />
                <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
                  Discard
                </button>
                <button type="button" onClick={() => { onAccept(jd); onClose(); }}
                  className="px-4 py-1.5 bg-brand-600 text-white rounded-md text-xs font-medium hover:bg-brand-700 transition-colors">
                  Use this JD
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
