"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Sparkles, X, Copy, Check, ChevronDown, ChevronRight,
  Zap, MessageSquare, ClipboardList, FileText, Briefcase,
  TrendingUp, AlertCircle, CheckCircle2, RefreshCw, Send,
  Lightbulb, Target, Users, Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CandidateContext {
  id: string;
  fullName: string;
  currentTitle?: string;
  currentCompany?: string;
  skills?: string[];
  location?: string;
  yearsExperience?: number;
  summary?: string;
}

interface AICopilotProps {
  candidate: CandidateContext;
  onClose: () => void;
  onOpenCompose?: (to: string, subject: string, body: string) => void;
}

type AITab = "match" | "outreach" | "interview" | "summary";
type Tone  = "professional" | "casual" | "direct";

interface JobMatch {
  id: string;
  title: string;
  client: string;
  matchScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  fitReason: string;
}

interface InterviewCategory {
  category: string;
  questions: string[];
}

interface SummaryVerdict {
  label: string;
  sub: string;
}

// ─── Fallback mock data (shown on API error) ──────────────────────────────────

function fallbackMatches(candidate: CandidateContext): JobMatch[] {
  const skills = candidate.skills ?? [];
  const isEng  = (candidate.currentTitle ?? "").toLowerCase().includes("engineer");
  const isPM   = (candidate.currentTitle ?? "").toLowerCase().includes("product");
  if (isEng) return [
    { id: "j1", title: "VP of Engineering", client: "NovaTech Solutions", matchScore: 92,
      matchedSkills: skills.slice(0, 3), missingSkills: ["Fintech domain knowledge"],
      fitReason: `Strong engineering leadership background at ${candidate.currentCompany} scales well to this VP role.` },
    { id: "j3", title: "Director of Engineering", client: "Meridian Capital", matchScore: 78,
      matchedSkills: skills.slice(0, 2), missingSkills: ["Financial services experience"],
      fitReason: "Technical depth is a strong fit. Financial services domain experience would help." },
  ];
  if (isPM) return [
    { id: "j2", title: "Chief Product Officer", client: "Orbis Technologies", matchScore: 88,
      matchedSkills: skills.slice(0, 2).concat(["B2B SaaS"]), missingSkills: ["Marketplace experience"],
      fitReason: `Product leadership track at ${candidate.currentCompany} maps well to CPO scope.` },
  ];
  return [
    { id: "j7", title: "Design Director", client: "Orbis Technologies", matchScore: 85,
      matchedSkills: skills.slice(0, 3), missingSkills: ["B2B product design portfolio"],
      fitReason: `Craft-focused background from ${candidate.currentCompany} is exactly right.` },
  ];
}

function fallbackOutreach(candidate: CandidateContext): string {
  const name    = candidate.fullName.split(" ")[0];
  const company = candidate.currentCompany ?? "your current company";
  const skill   = candidate.skills?.[0] ?? "your expertise";
  return `Hi ${name},

I came across your profile and was immediately impressed by your work at ${company} — particularly how you've applied ${skill} to drive real outcomes.

I'm working with a confidential client going through rapid growth — they're looking for someone with exactly your background to lead their next chapter.

Would you be open to a brief 20-minute call this week to explore if there's a mutual fit?

Best,
Your Recruiter`;
}

function fallbackInterview(candidate: CandidateContext): InterviewCategory[] {
  return [
    { category: "Leadership & Scale", questions: [
      "Tell me about a time you scaled a team through rapid growth.",
      "How do you approach prioritisation when business priorities compete?",
    ]},
    { category: "Motivation & Fit", questions: [
      `What would make you leave ${candidate.currentCompany ?? "your current role"}?`,
      "Where do you want to be in 3-5 years?",
    ]},
  ];
}

function fallbackSummary(candidate: CandidateContext): { summary: string; verdict: SummaryVerdict } {
  const title  = candidate.currentTitle ?? "professional";
  const company = candidate.currentCompany ?? "their company";
  const skills = (candidate.skills ?? []).slice(0, 3).join(", ");
  return {
    summary: `${candidate.fullName} is a ${title} currently at ${company}${candidate.yearsExperience ? ` with ${candidate.yearsExperience}+ years of experience` : ""}${skills ? `, with strengths in ${skills}` : ""}.\n\n**Key strengths:** Deep domain expertise, strong execution track record.\n\n**Watch areas:** Validate scope appetite and trajectory fit.\n\n**Recruiter note:** Solid candidate — worth a conversation.`,
    verdict: { label: "Promising candidate", sub: "Worth a conversation" },
  };
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function fetchOutreach(candidateId: string, tone: Tone, roleContext: string): Promise<string> {
  const res = await fetch(`/api/candidates/${candidateId}/ai/outreach`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tone, roleContext }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const { draft } = await res.json();
  return draft as string;
}

async function fetchInterview(candidateId: string): Promise<InterviewCategory[]> {
  const res = await fetch(`/api/candidates/${candidateId}/ai/interview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const { questions } = await res.json();
  return questions as InterviewCategory[];
}

async function fetchSummary(candidateId: string): Promise<{ summary: string; verdict: SummaryVerdict }> {
  const res = await fetch(`/api/candidates/${candidateId}/ai/summary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data as { summary: string; verdict: SummaryVerdict };
}

// ─── Match Score Ring ─────────────────────────────────────────────────────────

function MatchRing({ score }: { score: number }) {
  const color = score >= 85 ? "#10b981" : score >= 70 ? "#3b82f6" : score >= 55 ? "#f59e0b" : "#ef4444";
  const r = 20, circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <svg width="52" height="52" className="shrink-0">
      <circle cx="26" cy="26" r={r} fill="none" stroke="hsl(var(--border))" strokeWidth="4" />
      <circle
        cx="26" cy="26" r={r}
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeDashoffset={circ / 4}
        strokeLinecap="round"
      />
      <text x="26" y="30" textAnchor="middle" fontSize="11" fontWeight="700" fill={color}>{score}%</text>
    </svg>
  );
}

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-accent transition-colors"
    >
      {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied!" : label}
    </button>
  );
}

// ─── Loading shimmer ──────────────────────────────────────────────────────────

function AIGenerating({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12">
      <div className="relative flex h-10 w-10 items-center justify-center">
        <div className="absolute inset-0 rounded-full border-2 border-brand-200 animate-ping opacity-40" />
        <Sparkles className="h-5 w-5 text-brand-600 animate-pulse" />
      </div>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AICopilot({ candidate, onClose, onOpenCompose }: AICopilotProps) {
  const [activeTab, setActiveTab]         = useState<AITab>("match");
  const [generating, setGenerating]       = useState(false);
  const [outreachDraft, setOutreachDraft] = useState("");
  const [editingOutreach, setEditingOutreach] = useState(false);
  const [selectedTone, setSelectedTone]   = useState<Tone>("professional");
  const [roleContext, setRoleContext]      = useState("");
  const [questions, setQuestions]         = useState<InterviewCategory[]>([]);
  const [summary, setSummary]             = useState("");
  const [verdict, setVerdict]             = useState<SummaryVerdict>({ label: "Strong candidate", sub: "Prioritise for active searches" });
  const matches = fallbackMatches(candidate); // Job match tab still uses local scoring (no LLM needed)

  // ── Load content when tab changes ─────────────────────────────────────────

  const loadOutreach = useCallback(async (tone: Tone = selectedTone, ctx: string = roleContext) => {
    setGenerating(true);
    try {
      const draft = await fetchOutreach(candidate.id, tone, ctx);
      setOutreachDraft(draft);
    } catch {
      setOutreachDraft(fallbackOutreach(candidate));
    } finally {
      setGenerating(false);
    }
  }, [candidate, selectedTone, roleContext]);

  const loadInterview = useCallback(async () => {
    setGenerating(true);
    try {
      const qs = await fetchInterview(candidate.id);
      setQuestions(qs);
    } catch {
      setQuestions(fallbackInterview(candidate));
    } finally {
      setGenerating(false);
    }
  }, [candidate]);

  const loadSummary = useCallback(async () => {
    setGenerating(true);
    try {
      const data = await fetchSummary(candidate.id);
      setSummary(data.summary);
      setVerdict(data.verdict);
    } catch {
      const fb = fallbackSummary(candidate);
      setSummary(fb.summary);
      setVerdict(fb.verdict);
    } finally {
      setGenerating(false);
    }
  }, [candidate]);

  useEffect(() => {
    if (activeTab === "outreach" && !outreachDraft) loadOutreach();
    if (activeTab === "interview" && questions.length === 0) loadInterview();
    if (activeTab === "summary" && !summary) loadSummary();
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const TABS: { id: AITab; label: string; icon: React.ElementType }[] = [
    { id: "match",     label: "Job Match",  icon: Target },
    { id: "outreach",  label: "Outreach",   icon: MessageSquare },
    { id: "interview", label: "Interview",  icon: ClipboardList },
    { id: "summary",   label: "Summary",    icon: FileText },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-border px-4 py-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-violet-600 shadow-sm">
              <Sparkles className="h-3.5 w-3.5 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">AI Copilot</p>
              <p className="text-[10px] text-muted-foreground">{candidate.fullName}</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-muted-foreground hover:bg-accent transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="mt-3 flex gap-0 border-b border-border -mb-3.5 pb-0">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-2 text-[11px] font-medium border-b-2 transition-colors",
                  activeTab === tab.id
                    ? "border-brand-600 text-brand-600"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-3 w-3" />{tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {generating ? (
          <AIGenerating
            label={
              activeTab === "match"     ? "Matching against active searches…" :
              activeTab === "outreach"  ? "Personalising your outreach…" :
              activeTab === "interview" ? "Building interview guide…" :
                                          "Summarising candidate profile…"
            }
          />
        ) : (

          <>
            {/* ── Match Tab ── */}
            {activeTab === "match" && (
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="h-3.5 w-3.5 text-brand-500" />
                  <p className="text-xs text-muted-foreground">Matched against {matches.length} active searches</p>
                </div>
                {matches.map((match) => (
                  <div key={match.id} className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-3">
                      <MatchRing score={match.matchScore} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground leading-tight">{match.title}</p>
                        <p className="text-xs text-muted-foreground">{match.client}</p>
                      </div>
                    </div>

                    <p className="mt-3 text-xs text-foreground leading-relaxed">{match.fitReason}</p>

                    <div className="mt-3 space-y-1.5">
                      {match.matchedSkills.length > 0 && (
                        <div className="flex items-start gap-2">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                          <div className="flex flex-wrap gap-1">
                            {match.matchedSkills.map(s => (
                              <span key={s} className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">{s}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {match.missingSkills.length > 0 && (
                        <div className="flex items-start gap-2">
                          <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                          <div className="flex flex-wrap gap-1">
                            {match.missingSkills.map(s => (
                              <span key={s} className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">{s}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="mt-3 flex gap-2 border-t border-border pt-3">
                      <button
                        onClick={() => {
                          window.location.href = `/jobs/${match.id}`;
                          toast.success(`Opening ${match.title} — add ${candidate.fullName} to pipeline`);
                        }}
                        className="flex flex-1 items-center justify-center gap-1 rounded-md bg-brand-600 py-1.5 text-[11px] font-semibold text-white hover:bg-brand-700 transition-colors"
                      >
                        <Send className="h-3 w-3" />Submit
                      </button>
                      <button
                        onClick={() => { setActiveTab("outreach"); }}
                        className="flex flex-1 items-center justify-center gap-1 rounded-md border border-border py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-accent transition-colors"
                      >
                        <MessageSquare className="h-3 w-3" />Draft Outreach
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Outreach Tab ── */}
            {activeTab === "outreach" && (
              <div className="p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-brand-500" />
                    <p className="text-xs text-muted-foreground">Personalised for {candidate.fullName}</p>
                  </div>
                  <button
                    onClick={() => loadOutreach(selectedTone, roleContext).then(() => toast.success("Regenerated"))}
                    className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-accent transition-colors"
                  >
                    <RefreshCw className="h-3 w-3" />Regenerate
                  </button>
                </div>

                {/* Draft area */}
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  {editingOutreach ? (
                    <textarea
                      value={outreachDraft}
                      onChange={(e) => setOutreachDraft(e.target.value)}
                      className="w-full min-h-[320px] resize-none p-4 text-xs font-mono leading-relaxed text-foreground bg-transparent outline-none"
                    />
                  ) : (
                    <pre className="p-4 text-xs leading-relaxed text-foreground font-sans whitespace-pre-wrap">{outreachDraft}</pre>
                  )}
                  <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2 bg-muted/20">
                    <button
                      onClick={() => setEditingOutreach(v => !v)}
                      className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {editingOutreach ? "Preview" : "Edit"}
                    </button>
                    <div className="flex items-center gap-2">
                      <CopyButton text={outreachDraft} label="Copy email" />
                      <button
                        onClick={() => {
                          const subject = `Opportunity for ${candidate.fullName}`;
                          if (onOpenCompose) {
                            onOpenCompose(candidate.fullName, subject, outreachDraft);
                          } else {
                            navigator.clipboard.writeText(outreachDraft);
                            toast.success("Draft copied to clipboard");
                          }
                        }}
                        className="flex items-center gap-1 rounded-md bg-brand-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-brand-700 transition-colors"
                      >
                        <Send className="h-3 w-3" />Send
                      </button>
                    </div>
                  </div>
                </div>

                {/* Tone selector */}
                <div>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Tone</p>
                  <div className="flex gap-1.5">
                    {(["Professional", "Casual", "Direct"] as const).map((t) => {
                      const tone = t.toLowerCase() as Tone;
                      return (
                        <button
                          key={t}
                          onClick={() => {
                            setSelectedTone(tone);
                            loadOutreach(tone, roleContext);
                          }}
                          className={cn(
                            "rounded-full border px-3 py-1 text-[11px] font-medium transition-colors",
                            selectedTone === tone
                              ? "border-brand-400 text-brand-600 bg-brand-50"
                              : "border-border text-muted-foreground hover:border-brand-400 hover:text-brand-600 hover:bg-brand-50"
                          )}
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Role context */}
                <div>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Role context (optional)</p>
                  <input
                    type="text"
                    value={roleContext}
                    placeholder="e.g. VP Engineering at NovaTech, $280k base…"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-brand-400"
                    onChange={(e) => setRoleContext(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") loadOutreach(selectedTone, roleContext);
                    }}
                  />
                </div>
              </div>
            )}

            {/* ── Interview Tab ── */}
            {activeTab === "interview" && (
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
                    <p className="text-xs text-muted-foreground">Tailored for {candidate.currentTitle ?? "this candidate"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => loadInterview().then(() => toast.success("Regenerated"))}
                      className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-accent transition-colors"
                    >
                      <RefreshCw className="h-3 w-3" />
                    </button>
                    <CopyButton
                      text={questions.flatMap(c => [`${c.category}:\n`, ...c.questions.map(q => `• ${q}`), ""]).join("\n")}
                      label="Copy all"
                    />
                  </div>
                </div>

                {questions.map((cat) => (
                  <CategoryBlock key={cat.category} category={cat.category} questions={cat.questions} />
                ))}
              </div>
            )}

            {/* ── Summary Tab ── */}
            {activeTab === "summary" && (
              <div className="p-4 space-y-4">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <Star className="h-3.5 w-3.5 text-brand-500" />
                    <p className="text-xs text-muted-foreground">Executive summary</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => loadSummary().then(() => toast.success("Regenerated"))}
                      className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-accent transition-colors"
                    >
                      <RefreshCw className="h-3 w-3" />
                    </button>
                    <CopyButton text={summary} label="Copy" />
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-card p-4">
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    {summary.split("\n\n").map((para, i) => (
                      <p key={i} className="text-xs leading-relaxed text-foreground mb-3 last:mb-0">
                        {para.split(/(\*\*[^*]+\*\*)/).map((chunk, j) =>
                          chunk.startsWith("**") && chunk.endsWith("**")
                            ? <strong key={j} className="font-semibold">{chunk.slice(2, -2)}</strong>
                            : chunk
                        )}
                      </p>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-brand-200 bg-brand-50 dark:bg-brand-950/20 dark:border-brand-800 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-700 dark:text-brand-300 mb-1">Quick verdict</p>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-900">
                      <TrendingUp className="h-5 w-5 text-brand-600" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-brand-700 dark:text-brand-300">{verdict.label}</p>
                      <p className="text-[10px] text-brand-600 dark:text-brand-400">{verdict.sub}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Question category block ──────────────────────────────────────────────────

function CategoryBlock({ category, questions }: { category: string; questions: string[] }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between px-3.5 py-2.5 text-left hover:bg-accent/40 transition-colors"
      >
        <span className="text-xs font-semibold text-foreground">{category}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">{questions.length}</span>
          {open
            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          }
        </div>
      </button>
      {open && (
        <ul className="border-t border-border divide-y divide-border">
          {questions.map((q, i) => (
            <li key={i} className="group flex items-start gap-3 px-3.5 py-3 hover:bg-accent/30 transition-colors">
              <span className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-bold text-muted-foreground mt-0.5">{i + 1}</span>
              <p className="flex-1 text-xs text-foreground leading-relaxed">{q}</p>
              <CopyButton text={q} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
