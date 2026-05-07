"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  ArrowLeft, Check, MapPin, Briefcase, Star,
  Download, ExternalLink,
  Building2, GraduationCap, Linkedin, Zap,
  ThumbsUp, ThumbsDown, HelpCircle, Send, Loader2, ClipboardList,
} from "lucide-react";
import { usePortalData } from "@/lib/supabase/hooks";
import { cn, getInitials, generateAvatarColor } from "@/lib/utils";
import { toast } from "sonner";
import { useAutoSave } from "@/hooks/use-auto-save";
import { SaveIndicator, SaveFlash } from "@/components/ui/save-indicator";
import type { ClientDecision } from "@/types";

// ─── Mock work history ────────────────────────────────────────────────────────

interface WorkEntry {
  company: string;
  title: string;
  start: string;
  end?: string;
  current?: boolean;
  bullets: string[];
}

function buildPortalWorkHistory(candidateId: string): WorkEntry[] {
  const seed = candidateId.charCodeAt(0) % 3;
  const banks: WorkEntry[][] = [
    [
      { company: "Stripe", title: "VP of Engineering", start: "2020-06", current: true, bullets: ["Led 120-person engineering org across 4 time zones", "Scaled platform from $2B to $14B in TPV", "Reduced P0 incidents by 73% through reliability overhaul"] },
      { company: "Shopify", title: "Director of Engineering", start: "2017-02", end: "2020-05", bullets: ["Built and scaled checkout infrastructure team to 40 engineers", "Delivered Shopify Payments in 14 new markets"] },
      { company: "Twilio", title: "Senior Software Engineer", start: "2014-08", end: "2017-01", bullets: ["Core contributor to Programmable Voice product", "Mentored 6 junior engineers to senior level"] },
    ],
    [
      { company: "Airbnb", title: "Head of Product", start: "2019-03", current: true, bullets: ["Defined 3-year product roadmap adopted by C-suite", "Launched Airbnb Rooms — 1M hosts in 90 days", "Built product team from 12 to 45 PMs globally"] },
      { company: "Uber", title: "Senior Product Manager", start: "2016-01", end: "2019-02", bullets: ["Owned Driver Partner experience — 5M+ DAU", "Led expansion into 12 APAC markets"] },
      { company: "LinkedIn", title: "Product Manager", start: "2013-06", end: "2015-12", bullets: ["Launched LinkedIn Learning (then Lynda.com integration)", "Grew premium subscriptions 40% YoY"] },
    ],
    [
      { company: "OpenAI", title: "Chief Product Officer", start: "2021-01", current: true, bullets: ["Defined product strategy for ChatGPT and API platform", "Grew API revenue from $0 to $1B ARR", "Built 30-person product team from scratch"] },
      { company: "Google", title: "Group Product Manager", start: "2016-06", end: "2020-12", bullets: ["Led Search quality and ranking PM team", "Launched Featured Snippets — now 30% of SERP real estate"] },
      { company: "Facebook", title: "Product Manager, Ads", start: "2013-01", end: "2016-05", bullets: ["Owned $2B ads revenue product line", "A/B tested and launched Dynamic Ads globally"] },
    ],
  ];
  return banks[seed];
}

// ─── Portal Scorecard Form ────────────────────────────────────────────────────

const PORTAL_REC_CFG = {
  strong_yes: { label: "Strong Yes",  emoji: "🟢", color: "border-emerald-400 bg-emerald-600 text-white" },
  yes:        { label: "Yes",         emoji: "✅",  color: "border-green-400 bg-green-600 text-white"    },
  maybe:      { label: "Maybe",       emoji: "🤔",  color: "border-amber-400 bg-amber-500 text-white"    },
  no:         { label: "No",          emoji: "❌",  color: "border-red-400 bg-red-600 text-white"        },
} as const;

type PortalRec = keyof typeof PORTAL_REC_CFG;

function PortalScorecardForm({
  portalSlug,
  candidateId,
  candidateName,
}: {
  portalSlug:    string;
  candidateId:   string;
  candidateName: string;
}) {
  const [step,           setStep]           = useState<"rate" | "done">("rate");
  const [clientName,     setClientName]     = useState("");
  const [clientEmail,    setClientEmail]    = useState("");
  const [recommendation, setRecommendation] = useState<PortalRec | null>(null);
  const [overallRating,  setOverallRating]  = useState(0);
  const [hoverRating,    setHoverRating]    = useState(0);
  const [pros,           setPros]           = useState("");
  const [cons,           setCons]           = useState("");
  const [notes,          setNotes]          = useState("");
  const [saving,         setSaving]         = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientName.trim() || !recommendation) return;
    setSaving(true);
    try {
      const res = await fetch("/api/portal/scorecard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          portalSlug,
          candidateId,
          clientName:     clientName.trim(),
          clientEmail:    clientEmail.trim() || undefined,
          recommendation,
          overallRating:  overallRating || null,
          pros:           pros.trim() || undefined,
          cons:           cons.trim() || undefined,
          notes:          notes.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setStep("done");
    } catch {
      toast.error("Could not submit — please try again");
    } finally {
      setSaving(false);
    }
  }

  if (step === "done") {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 mx-auto mb-3">
          <Check className="h-6 w-6 text-emerald-600" />
        </div>
        <p className="text-sm font-bold text-emerald-800">Scorecard submitted!</p>
        <p className="mt-1 text-xs text-emerald-700">Your structured feedback has been shared with your recruiter.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-white p-5 shadow-sm space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <ClipboardList className="h-4 w-4 text-indigo-600" />
        <p className="text-sm font-semibold text-foreground">Rate {candidateName}</p>
      </div>

      {/* Recommendation */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground mb-2">Would you recommend them?</p>
        <div className="grid grid-cols-2 gap-2">
          {(Object.entries(PORTAL_REC_CFG) as [PortalRec, typeof PORTAL_REC_CFG[PortalRec]][]).map(([key, cfg]) => (
            <button
              key={key}
              type="button"
              onClick={() => setRecommendation(recommendation === key ? null : key)}
              className={cn(
                "flex items-center gap-2 rounded-xl border-2 px-3 py-2 text-xs font-semibold transition-all",
                recommendation === key
                  ? cfg.color
                  : "border-border text-muted-foreground hover:border-border"
              )}
            >
              <span>{cfg.emoji}</span>{cfg.label}
            </button>
          ))}
        </div>
      </div>

      {/* Star rating */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground mb-2">Overall rating</p>
        <div className="flex items-center gap-1">
          {[1,2,3,4,5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setOverallRating(overallRating === n ? 0 : n)}
              onMouseEnter={() => setHoverRating(n)}
              onMouseLeave={() => setHoverRating(0)}
              className="transition-transform hover:scale-110"
            >
              <Star className={cn(
                "h-6 w-6 transition-colors",
                n <= (hoverRating || overallRating) ? "fill-amber-400 text-amber-400" : "text-gray-200"
              )} />
            </button>
          ))}
          {overallRating > 0 && (
            <span className="ml-1 text-xs text-muted-foreground">{overallRating}/5</span>
          )}
        </div>
      </div>

      {/* Pros / cons */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-1">Pros</p>
          <textarea
            value={pros}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setPros(e.target.value)}
            placeholder="Strengths you noticed…"
            rows={2}
            className="w-full resize-none rounded-xl border border-border bg-muted/50 px-3 py-2 text-xs text-foreground placeholder-gray-400 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-400"
          />
        </div>
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-1">Cons</p>
          <textarea
            value={cons}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setCons(e.target.value)}
            placeholder="Concerns or gaps…"
            rows={2}
            className="w-full resize-none rounded-xl border border-border bg-muted/50 px-3 py-2 text-xs text-foreground placeholder-gray-400 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-400"
          />
        </div>
      </div>

      {/* Notes */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground mb-1">Additional notes (optional)</p>
        <textarea
          value={notes}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
          placeholder="Any other feedback for your recruiter…"
          rows={2}
          className="w-full resize-none rounded-xl border border-border bg-muted/50 px-3 py-2 text-sm text-foreground placeholder-gray-400 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-400"
        />
      </div>

      {/* Divider */}
      <div className="border-t border-border pt-3 space-y-3">
        <p className="text-xs font-semibold text-muted-foreground">Your contact info</p>
        <input
          type="text"
          required
          value={clientName}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setClientName(e.target.value)}
          placeholder="Your name *"
          className="w-full rounded-xl border border-border bg-muted/50 px-3 py-2 text-sm text-foreground placeholder-gray-400 outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <input
          type="email"
          value={clientEmail}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setClientEmail(e.target.value)}
          placeholder="Email (optional)"
          className="w-full rounded-xl border border-border bg-muted/50 px-3 py-2 text-sm text-foreground placeholder-gray-400 outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <button
        onClick={handleSubmit}
        disabled={!recommendation || !clientName.trim() || saving}
        className={cn(
          "w-full flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold text-white transition-all",
          !recommendation || !clientName.trim() || saving
            ? "bg-muted cursor-not-allowed"
            : "bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99]"
        )}
      >
        {saving ? (
          <><Loader2 className="h-4 w-4 animate-spin" />Submitting…</>
        ) : (
          <><ClipboardList className="h-4 w-4" />Submit Scorecard</>
        )}
      </button>
    </div>
  );
}

// ─── Decision panel ───────────────────────────────────────────────────────────

const DECISION_CFG: Record<ClientDecision, { label: string; icon: React.ElementType; color: string; bg: string; border: string }> = {
  advance:  { label: "Advance to interview", icon: ThumbsUp,    color: "text-emerald-700", bg: "bg-emerald-600", border: "border-emerald-400" },
  hold:     { label: "Hold for now",          icon: HelpCircle,  color: "text-amber-700",   bg: "bg-amber-500",   border: "border-amber-400"   },
  rejected: { label: "Not the right fit",    icon: ThumbsDown,  color: "text-red-700",     bg: "bg-red-600",     border: "border-red-400"     },
};

const ADVANCE_REASONS = ["Strong background", "Culture fit", "Exceeds requirements", "Impressive trajectory", "Other"];
const HOLD_REASONS    = ["Want to see more candidates", "Need internal alignment", "Budget timing", "Other"];
const REJECT_REASONS  = ["Under-qualified", "Over-qualified", "Not the right fit", "Salary expectations too high", "Other"];

interface FeedbackDraft {
  decision: ClientDecision | null;
  reason: string;
  note: string;
}

function DecisionPanel({
  candidateName,
  candidateId,
  decision,
  reason,
  note,
  onDecision,
  onReason,
  onNote,
  onSubmit,
  submitting,
  submitted,
}: {
  candidateName: string;
  candidateId: string;
  decision: ClientDecision | null;
  reason: string;
  note: string;
  onDecision: (d: ClientDecision) => void;
  onReason: (r: string) => void;
  onNote: (n: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  submitted: boolean;
}) {
  // Auto-save draft: decision + reason + note together
  const draft: FeedbackDraft = { decision, reason, note };
  const { status: saveStatus } = useAutoSave<FeedbackDraft>({
    key: `portal-feedback-draft-${candidateId}`,
    value: draft,
    debounceMs: 400,
  });

  // Flash "Draft saved" immediately on decision/reason selection
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showFlash() {
    setFlash(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(false), 2000);
  }

  function handleDecision(d: ClientDecision) {
    onDecision(d);
    showFlash();
  }

  function handleReason(r: string) {
    onReason(r);
    showFlash();
  }

  const reasons =
    decision === "advance"  ? ADVANCE_REASONS :
    decision === "hold"     ? HOLD_REASONS :
    decision === "rejected" ? REJECT_REASONS : [];

  if (submitted) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center animate-fade-in-up">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 mx-auto mb-3">
          <Check className="h-6 w-6 text-emerald-600" />
        </div>
        <p className="text-sm font-bold text-emerald-800">Feedback submitted</p>
        <p className="mt-1 text-xs text-emerald-700">
          Your recruiter has been notified and will follow up shortly.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-white p-5 shadow-sm space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">Your decision on {candidateName}</p>
        {/* Draft saved indicator */}
        <div className="h-4">
          <SaveFlash show={flash} />
          {!flash && <SaveIndicator status={saveStatus} className="text-muted-foreground/60" />}
        </div>
      </div>

      {/* Decision buttons */}
      <div className="grid grid-cols-3 gap-2">
        {(["advance", "hold", "rejected"] as ClientDecision[]).map((d) => {
          const cfg = DECISION_CFG[d];
          const Icon = cfg.icon;
          return (
            <button
              key={d}
              onClick={() => handleDecision(d)}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-xl border-2 p-3 transition-all",
                decision === d
                  ? `${cfg.border} ${cfg.bg} text-white shadow-md scale-[1.02]`
                  : "border-border hover:border-border hover:scale-[1.01] text-muted-foreground"
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-semibold text-center leading-tight">{cfg.label}</span>
            </button>
          );
        })}
      </div>

      {/* Progress steps */}
      {decision && (
        <div className="flex items-center gap-1.5 py-0.5">
          <span className={cn("h-1.5 w-1.5 rounded-full", decision ? "bg-indigo-500" : "bg-muted")} />
          <span className="h-px flex-1 bg-muted">
            <span className={cn("block h-px bg-indigo-400 transition-all duration-500", reason ? "w-full" : "w-0")} />
          </span>
          <span className={cn("h-1.5 w-1.5 rounded-full transition-colors", reason ? "bg-indigo-500" : "bg-muted")} />
          <span className="h-px flex-1 bg-muted">
            <span className={cn("block h-px bg-indigo-400 transition-all duration-500", note.trim() ? "w-full" : "w-0")} />
          </span>
          <span className={cn("h-1.5 w-1.5 rounded-full transition-colors", note.trim() ? "bg-indigo-500" : "bg-muted")} />
          <span className="text-[10px] text-muted-foreground/60 ml-1">
            {!reason ? "Choose a reason" : !note.trim() ? "Add notes (optional)" : "Ready to submit"}
          </span>
        </div>
      )}

      {/* Reason */}
      {decision && reasons.length > 0 && (
        <div className="animate-fade-in-up">
          <p className="text-xs font-semibold text-foreground mb-1.5">Primary reason</p>
          <div className="flex flex-wrap gap-1.5">
            {reasons.map((r) => (
              <button
                key={r}
                onClick={() => handleReason(r)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-all border",
                  reason === r
                    ? "border-indigo-400 bg-indigo-600 text-white scale-[1.02] shadow-sm"
                    : "border-border text-muted-foreground hover:border-border hover:scale-[1.01]"
                )}
              >
                {reason === r && <Check className="inline h-2.5 w-2.5 mr-1 -mt-px" />}
                {r}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Note */}
      {decision && (
        <div className="animate-fade-in-up">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-semibold text-foreground">Additional notes (optional)</p>
            <SaveIndicator status={saveStatus} />
          </div>
          <textarea
            value={note}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onNote(e.target.value)}
            placeholder="Any specific feedback for your recruiter…"
            rows={3}
            className="w-full resize-none rounded-xl border border-border bg-muted/50 px-3 py-2.5 text-sm text-foreground placeholder-gray-400 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-400 transition-colors"
          />
        </div>
      )}

      <button
        onClick={onSubmit}
        disabled={!decision || submitting}
        className={cn(
          "w-full flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold text-white transition-all",
          !decision || submitting
            ? "bg-muted cursor-not-allowed"
            : "bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99]"
        )}
      >
        {submitting ? (
          <><Loader2 className="h-4 w-4 animate-spin" />Submitting…</>
        ) : (
          <><Send className="h-4 w-4" />Submit Feedback</>
        )}
      </button>

      {/* Reassurance note */}
      {decision && !submitted && (
        <p className="text-center text-[10px] text-muted-foreground/60">
          Your progress is automatically saved
        </p>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

interface PageProps {
  params: { portalSlug: string; candidateId: string };
}

const DRAFT_KEY = (candidateId: string) => `portal-feedback-draft-${candidateId}`;

export default function PortalCandidatePage({ params }: PageProps) {
  const { data, loading, notFound } = usePortalData(params.portalSlug);

  const [decision, setDecision]   = useState<ClientDecision | null>(null);
  const [reason, setReason]       = useState("");
  const [note, setNote]           = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [activeSection, setSection] = useState<"overview" | "experience" | "questions">("overview");

  // Restore draft on mount
  useEffect(() => {
    if (submitted) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY(params.candidateId));
      if (raw) {
        const draft: FeedbackDraft = JSON.parse(raw);
        if (draft.decision) setDecision(draft.decision);
        if (draft.reason)   setReason(draft.reason);
        if (draft.note)     setNote(draft.note);
      }
    } catch { /* no-op */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/50">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/50">
        <div className="text-center">
          <p className="text-muted-foreground">Candidate not found or link has expired.</p>
        </div>
      </div>
    );
  }

  const client    = data.company;
  const submission = data.submissions.find((s) => s.candidateId === params.candidateId);
  const candidate = submission?.candidate;
  const job       = submission ? data.jobs.find((j) => j.id === submission.jobId) : null;

  if (!candidate) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/50">
        <div className="text-center">
          <p className="text-muted-foreground">Candidate not found or link has expired.</p>
        </div>
      </div>
    );
  }

  const workHistory = buildPortalWorkHistory(candidate.id);
  const candidateSkills = candidate.skills.map((s) => s.skill.name);
  const candidateLocation = candidate.location ? String(candidate.location.city ?? "") : "";

  async function handleSubmit() {
    if (!decision) return;
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 800));
    // Clear draft on successful submit
    try { localStorage.removeItem(DRAFT_KEY(params.candidateId)); } catch { /* no-op */ }
    setSubmitting(false);
    setSubmitted(true);
    toast.success("Feedback sent to your recruiter");
  }

  return (
    <div className="min-h-screen bg-muted/50">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-border bg-white px-4 py-3 shadow-sm">
        <div className="mx-auto max-w-5xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href={`/portal/${params.portalSlug}`}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />Back
            </Link>
            <div className="h-4 w-px bg-muted" />
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 shadow-sm">
                <Zap className="h-4 w-4 text-white" strokeWidth={2.5} />
              </div>
              <span className="text-sm font-semibold text-foreground">{client.name ?? ""}</span>
            </div>
          </div>
          <span className="text-xs text-muted-foreground/60">Powered by Ikhaya</span>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ── Left: Candidate summary + decision ── */}
          <div className="lg:col-span-1 space-y-5">
            {/* Profile card */}
            <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
              {/* Avatar + name */}
              <div className="flex flex-col items-center text-center mb-5">
                <div className={cn("flex h-16 w-16 items-center justify-center rounded-full text-xl font-bold text-white shadow-md", generateAvatarColor(candidate.id))}>
                  {getInitials(candidate.fullName)}
                </div>
                <h1 className="mt-3 text-lg font-bold text-foreground">{candidate.fullName}</h1>
                <p className="text-sm text-muted-foreground">{candidate.currentTitle ?? "—"}</p>
                {candidate.currentCompany && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <Building2 className="h-3.5 w-3.5" />{candidate.currentCompany}
                  </p>
                )}
                {candidateLocation && (
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground/60">
                    <MapPin className="h-3 w-3" />{candidateLocation}
                  </p>
                )}
              </div>

              {/* Quick stats */}
              {job && (
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 mb-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-600 mb-2">Submitted for</p>
                  <p className="text-sm font-semibold text-foreground">{job.title}</p>
                  <p className="text-xs text-muted-foreground">{client.name ?? ""}</p>
                </div>
              )}

              {/* Actions */}
              <div className="mt-4 space-y-2">
                {(candidate as any).portfolioUrl ? (
                  <a
                    href={(candidate as any).portfolioUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-border py-2 text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
                  >
                    <Download className="h-3.5 w-3.5" />Download Resume
                  </a>
                ) : (
                  <button
                    onClick={() => toast.info("Resume not available — contact your recruiter")}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2 text-xs font-medium text-muted-foreground/60 cursor-not-allowed"
                    disabled
                  >
                    <Download className="h-3.5 w-3.5" />Resume on request
                  </button>
                )}
                {candidate.linkedinUrl && (
                  <a
                    href={candidate.linkedinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-border py-2 text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
                  >
                    <Linkedin className="h-3.5 w-3.5" />LinkedIn Profile
                    <ExternalLink className="h-3 w-3 opacity-60" />
                  </a>
                )}
              </div>
            </div>

            {/* Decision panel */}
            <DecisionPanel
              candidateName={candidate.firstName}
              candidateId={candidate.id}
              decision={decision}
              reason={reason}
              note={note}
              onDecision={setDecision}
              onReason={setReason}
              onNote={setNote}
              onSubmit={handleSubmit}
              submitting={submitting}
              submitted={submitted}
            />

            {/* Scorecard panel */}
            <PortalScorecardForm
              portalSlug={params.portalSlug}
              candidateId={candidate.id}
              candidateName={candidate.firstName}
            />
          </div>

          {/* ── Right: Detail sections ── */}
          <div className="lg:col-span-2 space-y-5">
            {/* Section nav */}
            <div className="flex items-center gap-1 rounded-xl border border-border bg-white p-1 shadow-sm">
              {(["overview", "experience", "questions"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSection(s)}
                  className={cn(
                    "flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors capitalize",
                    activeSection === s
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Overview tab */}
            {activeSection === "overview" && (
              <div className="space-y-4">
                {/* Recruiter pitch */}
                <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/60 mb-3">Recruiter's note</p>
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">
                    {`${candidate.firstName} is an exceptional candidate who I believe is an outstanding fit for this role.\n\nTheir trajectory speaks for itself — consistent progression at top-tier companies, combined with a leadership style that complements the culture you've described.\n\nI'm happy to arrange an introduction call at your earliest convenience.`}
                  </p>
                </div>

                {/* Skills */}
                {candidateSkills.length > 0 && (
                  <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/60 mb-3">Skills</p>
                    <div className="flex flex-wrap gap-2">
                      {candidateSkills.map((skill) => (
                        <span key={skill} className="rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-medium text-foreground">
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Experience tab */}
            {activeSection === "experience" && (
              <div className="space-y-4">
                {/* Work history */}
                <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/60 mb-4">Work history</p>
                  <div className="space-y-6">
                    {workHistory.map((entry, i) => (
                      <div key={i} className="flex gap-4">
                        <div className="flex flex-col items-center">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                            <Briefcase className="h-4 w-4 text-muted-foreground" />
                          </div>
                          {i < workHistory.length - 1 && (
                            <div className="mt-1 flex-1 w-px bg-muted min-h-[24px]" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0 pb-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold text-foreground">{entry.title}</p>
                              <p className="text-xs text-muted-foreground">{entry.company}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-[10px] text-muted-foreground/60">
                                {entry.start} — {entry.current ? "Present" : entry.end}
                              </p>
                              {entry.current && (
                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-semibold text-emerald-700">Current</span>
                              )}
                            </div>
                          </div>
                          <ul className="mt-2 space-y-1">
                            {entry.bullets.map((b, bi) => (
                              <li key={bi} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gray-400" />{b}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Education stub */}
                <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/60 mb-4">Education</p>
                  <div className="flex gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100">
                      <GraduationCap className="h-4 w-4 text-indigo-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">Bachelor of Science, Computer Science</p>
                      <p className="text-xs text-muted-foreground">Stanford University · 2010 – 2014</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Questions tab */}
            {activeSection === "questions" && (
              <div className="rounded-2xl border border-border bg-white p-5 shadow-sm space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/60">Ask your recruiter</p>
                <p className="text-sm text-muted-foreground">
                  Have a question about {candidate.firstName} or this search? Send a message directly to your recruiter.
                </p>

                <QuestionBox candidateName={candidate.firstName} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── QuestionBox ──────────────────────────────────────────────────────────────

function QuestionBox({ candidateName }: { candidateName: string }) {
  const [q, setQ]           = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent]     = useState(false);

  // Auto-save draft while typing
  const { status: saveStatus, clearDraft, loadDraft } = useAutoSave({
    key: `portal-question-draft-${candidateName}`,
    value: q,
  });

  // Restore draft on mount
  useEffect(() => {
    const draft = loadDraft<string>();
    if (draft) setQ(draft);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSend() {
    if (!q.trim()) return;
    setSending(true);
    await new Promise((r) => setTimeout(r, 500));
    clearDraft();
    setSending(false);
    setSent(true);
    toast.success("Message sent to your recruiter");
    setQ("");
    setTimeout(() => setSent(false), 3000);
  }

  const QUICK_QS = [
    `Can ${candidateName} start within 30 days?`,
    `What are ${candidateName}'s salary expectations?`,
    `Can you share ${candidateName}'s references?`,
    `Is ${candidateName} open to relocation?`,
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {QUICK_QS.map((qs) => (
          <button
            key={qs}
            onClick={() => setQ(qs)}
            className="rounded-full border border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
          >
            {qs}
          </button>
        ))}
      </div>
      <div className="relative">
        <textarea
          value={q}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setQ(e.target.value)}
          placeholder="Type your question…"
          rows={3}
          className="w-full resize-none rounded-xl border border-border bg-muted/50 px-3 py-2.5 text-sm text-foreground placeholder-gray-400 outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
        />
        {/* Save indicator inside textarea corner */}
        <div className="absolute bottom-2 right-3">
          <SaveIndicator status={saveStatus} />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground/60">Your message is auto-saved as you type</span>
        <button
          onClick={handleSend}
          disabled={!q.trim() || sending || sent}
          className={cn(
            "flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition-all",
            sent
              ? "bg-emerald-600 text-white"
              : sending
              ? "bg-indigo-400 text-white cursor-wait"
              : "bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40"
          )}
        >
          {sent     ? <><Check className="h-3.5 w-3.5" />Sent!</> :
           sending  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Sending…</> :
                      <><Send className="h-3.5 w-3.5" />Send to recruiter</>}
        </button>
      </div>
    </div>
  );
}
