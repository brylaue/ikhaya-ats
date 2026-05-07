"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { FileText, CircleCheck as CheckCircle2, CirclePause as PauseCircle, Circle as XCircle, ChevronDown, ChevronUp, Briefcase, MapPin, Clock, Star, ExternalLink, DollarSign, ChartBar as BarChart2, ArrowRight } from "lucide-react";
import { usePortalData } from "@/lib/supabase/hooks";
import type { PortalSubmission } from "@/lib/supabase/hooks";
import { PortalNotifications } from "@/components/portal/portal-notifications";
import {
  cn,
  getInitials,
  generateAvatarColor,
  formatSalary,
  formatRelativeTime,
} from "@/lib/utils";
import type { ClientDecision } from "@/types";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

type DecisionState = Record<string, { decision: ClientDecision; reason: string; note: string }>;

const ADVANCE_REASONS = ["Strong background", "Culture fit", "Exceeds requirements", "Other"];
const HOLD_REASONS    = ["Awaiting budget approval", "Want to see more candidates", "Timing not right", "Other"];
const PASS_REASONS    = ["Under-qualified", "Over-qualified", "Not the right fit", "Salary expectations too high", "Other"];

// ─── Candidate Card ───────────────────────────────────────────────────────────

interface CandidateSubmissionCardProps {
  app: PortalSubmission;
  existingDecision?: { decision: ClientDecision; reason: string; note: string };
  onDecision: (appId: string, decision: ClientDecision, reason: string, note: string) => Promise<void>;
  portalSlug: string;
}

function CandidateSubmissionCard({ app, existingDecision, onDecision, portalSlug }: CandidateSubmissionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<"idle" | "deciding">("idle");
  const [pendingDecision, setPendingDecision] = useState<ClientDecision | null>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");

  const candidate = app.candidate!;

  const decisionBg: Record<ClientDecision, string> = {
    advance: "border-emerald-300 bg-emerald-50",
    hold:    "border-amber-300 bg-amber-50",
    pass:    "border-red-200 bg-red-50",
  };

  const decisionLabel: Record<ClientDecision, string> = {
    advance: "Advanced",
    hold:    "On Hold",
    pass:    "Passed",
  };

  const decisionColor: Record<ClientDecision, string> = {
    advance: "text-emerald-700",
    hold:    "text-amber-700",
    pass:    "text-red-600",
  };

  const reasons =
    pendingDecision === "advance" ? ADVANCE_REASONS :
    pendingDecision === "hold"    ? HOLD_REASONS :
                                    PASS_REASONS;

  function startDecision(d: ClientDecision) {
    setPendingDecision(d);
    setReason("");
    setNote("");
    setMode("deciding");
  }

  async function submitDecision() {
    if (!pendingDecision || !reason) return;
    await onDecision(app.id, pendingDecision, reason, note);
    setMode("idle");
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border bg-white shadow-sm transition-all",
        existingDecision ? decisionBg[existingDecision.decision] : "border-slate-200"
      )}
    >
      {/* Card Header */}
      <div className="flex items-start gap-4 p-5">
        {/* Avatar */}
        <div
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white",
            generateAvatarColor(candidate.id)
          )}
        >
          {getInitials(candidate.fullName)}
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-slate-900">{candidate.fullName}</h3>
                <Link
                  href={`/portal/${portalSlug}/candidate/${candidate.id}`}
                  className="flex items-center gap-0.5 text-[10px] font-medium text-indigo-600 hover:underline"
                >
                  Full profile<ExternalLink className="h-2.5 w-2.5" />
                </Link>
              </div>
              <p className="text-sm text-slate-500">{candidate.currentTitle} · {candidate.currentCompany}</p>
            </div>
            {existingDecision ? (
              <span className={cn("rounded-full px-3 py-1 text-xs font-semibold border", decisionBg[existingDecision.decision], decisionColor[existingDecision.decision])}>
                {decisionLabel[existingDecision.decision]}
              </span>
            ) : (
              app.score != null && (
                <div className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                  {app.score} match
                </div>
              )
            )}
          </div>

          {/* Meta row */}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
            {candidate.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {[candidate.location.city, candidate.location.state].filter(Boolean).join(", ")}
                {candidate.openToRemote && " · Remote OK"}
              </span>
            )}
            {candidate.desiredSalary && (
              <span className="flex items-center gap-1">
                <DollarSign className="h-3.5 w-3.5" />
                {formatSalary(candidate.desiredSalary, candidate.salaryCurrency ?? "USD", true)}
              </span>
            )}
            {app.submittedToClientAt && (
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                Submitted {formatRelativeTime(app.submittedToClientAt)}
              </span>
            )}
          </div>

          {/* Skills */}
          {candidate.skills.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {candidate.skills.slice(0, 4).map((cs) => (
                <span key={cs.skillId} className="rounded-sm bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                  {cs.skill.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recruiter highlight */}
      {app.recruiterNote && (
        <div className="mx-5 mb-3 rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm text-slate-700 italic">
          "{app.recruiterNote}"
        </div>
      )}

      {/* Existing decision feedback */}
      {existingDecision && (
        <div className="mx-5 mb-3 rounded-lg border border-slate-200 bg-white/70 p-3 text-sm">
          <p className="font-medium text-slate-700">Your feedback</p>
          <p className="text-slate-600">Reason: {existingDecision.reason}</p>
          {existingDecision.note && <p className="mt-0.5 text-slate-500">{existingDecision.note}</p>}
        </div>
      )}

      {/* Expand toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-center gap-1 border-t border-slate-100 py-2 text-xs text-slate-500 hover:bg-slate-50 transition-colors"
      >
        {expanded ? (
          <><ChevronUp className="h-3.5 w-3.5" /> Hide resume details</>
        ) : (
          <><ChevronDown className="h-3.5 w-3.5" /> View resume details</>
        )}
      </button>

      {/* Expanded resume section */}
      {expanded && (
        <div className="border-t border-slate-100 p-5 space-y-4">
          {/* Work history */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Work History</p>
            <div className="space-y-2">
              {candidate.skills.slice(0, 2).map((cs, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <span className="mt-1.5 h-2 w-2 rounded-full bg-slate-300 shrink-0" />
                  <div>
                    <span className="font-medium text-slate-800">{cs.skill.name}</span>
                    <span className="text-slate-500"> · {cs.yearsExperience}y exp</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Download resume */}
          <button className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
            <FileText className="h-4 w-4" />
            Download Resume PDF
          </button>
        </div>
      )}

      {/* Decision form */}
      {mode === "deciding" && pendingDecision && (
        <div className="border-t border-slate-200 bg-slate-50/80 p-4 space-y-3">
          <p className="text-sm font-semibold text-slate-800">
            {pendingDecision === "advance" ? "✅ Advance this candidate" :
             pendingDecision === "hold"    ? "⏸ Put on hold" :
                                             "❌ Pass on this candidate"}
          </p>
          <div>
            <label className="text-xs font-medium text-slate-600">Reason (required)</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">Select a reason…</option>
              {reasons.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Additional notes (optional)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Any specific feedback for the recruiter…"
              className="mt-1 block w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={submitDecision}
              disabled={!reason}
              className={cn(
                "flex-1 rounded-lg py-2 text-sm font-semibold text-white transition-colors",
                pendingDecision === "advance" ? "bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300" :
                pendingDecision === "hold"    ? "bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300" :
                                               "bg-red-500 hover:bg-red-600 disabled:bg-red-300"
              )}
            >
              Confirm
            </button>
            <button
              onClick={() => setMode("idle")}
              className="flex-1 rounded-lg border border-slate-200 bg-white py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Decision buttons */}
      {mode === "idle" && !existingDecision && (
        <div className="flex items-center gap-2 border-t border-slate-100 p-4">
          <button
            onClick={() => startDecision("advance")}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
          >
            <CheckCircle2 className="h-4 w-4" />
            Advance
          </button>
          <button
            onClick={() => startDecision("hold")}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100 transition-colors"
          >
            <PauseCircle className="h-4 w-4" />
            Hold
          </button>
          <button
            onClick={() => startDecision("pass")}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 py-2 text-sm font-semibold text-red-600 hover:bg-red-100 transition-colors"
          >
            <XCircle className="h-4 w-4" />
            Pass
          </button>
        </div>
      )}

      {/* Change mind link */}
      {existingDecision && (
        <div className="flex justify-center border-t border-slate-100 py-2">
          <button
            onClick={() => { setMode("deciding"); setPendingDecision(existingDecision.decision); setReason(existingDecision.reason); setNote(existingDecision.note); }}
            className="text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2"
          >
            Change decision
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Req Summary Banner ───────────────────────────────────────────────────────

// Canonical pipeline order for stage sorting
const STAGE_ORDER = ["sourced", "screened", "submitted", "client review", "interview", "final", "offer", "advancing", "placed", "hired"];

function stageRank(name: string): number {
  const n = name.toLowerCase();
  const i = STAGE_ORDER.findIndex((s) => n.includes(s));
  return i === -1 ? 99 : i;
}

const STAGE_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  sourced:       { bg: "bg-slate-100",   text: "text-slate-600",   dot: "bg-slate-400"   },
  screened:      { bg: "bg-brand-50",     text: "text-brand-700",    dot: "bg-brand-400"    },
  submitted:     { bg: "bg-indigo-50",   text: "text-indigo-700",  dot: "bg-indigo-400"  },
  "client review": { bg: "bg-violet-50", text: "text-violet-700",  dot: "bg-violet-400"  },
  interview:     { bg: "bg-amber-50",    text: "text-amber-700",   dot: "bg-amber-400"   },
  final:         { bg: "bg-orange-50",   text: "text-orange-700",  dot: "bg-orange-400"  },
  offer:         { bg: "bg-emerald-50",  text: "text-emerald-700", dot: "bg-emerald-400" },
  advancing:     { bg: "bg-emerald-50",  text: "text-emerald-700", dot: "bg-emerald-500" },
  placed:        { bg: "bg-emerald-100", text: "text-emerald-800", dot: "bg-emerald-600" },
  hired:         { bg: "bg-emerald-100", text: "text-emerald-800", dot: "bg-emerald-600" },
};

function stageCfg(name: string) {
  const key = STAGE_ORDER.find((s) => name.toLowerCase().includes(s));
  return key ? STAGE_COLORS[key] : { bg: "bg-slate-100", text: "text-slate-600", dot: "bg-slate-400" };
}

function StageBadge({ name }: { name: string }) {
  const cfg = stageCfg(name);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${cfg.bg} ${cfg.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {name}
    </span>
  );
}

function ScoreRing({ score }: { score: number }) {
  const r = 10, circ = 2 * Math.PI * r;
  const fill = circ * (1 - score / 100);
  const color = score >= 75 ? "#10b981" : score >= 55 ? "#8b5cf6" : "#f59e0b";
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" className="shrink-0">
      <circle cx="14" cy="14" r={r} fill="none" stroke="#e2e8f0" strokeWidth="3" />
      <circle
        cx="14" cy="14" r={r} fill="none" stroke={color} strokeWidth="3"
        strokeDasharray={circ} strokeDashoffset={fill}
        strokeLinecap="round" transform="rotate(-90 14 14)"
      />
      <text x="14" y="18" textAnchor="middle" fontSize="7" fontWeight="700" fill={color}>{score}</text>
    </svg>
  );
}

interface ReqSummaryBannerProps {
  submissions: PortalSubmission[];
  decisions: DecisionState;
  jobTitle: string;
}

function ReqSummaryBanner({ submissions, decisions, jobTitle }: ReqSummaryBannerProps) {
  const [open, setOpen] = useState(false);

  // Compute per-stage groups
  const stageMap = new Map<string, PortalSubmission[]>();
  for (const s of submissions) {
    const stage = s.stageName ?? "Submitted";
    if (!stageMap.has(stage)) stageMap.set(stage, []);
    stageMap.get(stage)!.push(s);
  }
  const stages = [...stageMap.entries()]
    .sort(([a], [b]) => stageRank(a) - stageRank(b));

  const advancingCount = submissions.filter((s) => decisions[s.id]?.decision === "advance").length;
  const pendingCount   = submissions.filter((s) => !decisions[s.id]).length;

  if (submissions.length === 0) return null;

  return (
    <div className="mb-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Header row — always visible */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-4 px-5 py-3.5 text-left hover:bg-slate-50/80 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <BarChart2 className="h-4 w-4 text-slate-400" />
          Search Summary
        </div>

        {/* Stat chips */}
        <div className="flex items-center gap-2 flex-1 flex-wrap">
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
            {submissions.length} in pipeline
          </span>
          {advancingCount > 0 && (
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
              {advancingCount} advancing
            </span>
          )}
          {pendingCount > 0 && (
            <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
              {pendingCount} awaiting review
            </span>
          )}
          {/* Stage funnel: compact when collapsed */}
          {!open && (
            <div className="ml-1 hidden sm:flex items-center gap-1">
              {stages.map(([name, apps], i) => (
                <span key={name} className="flex items-center gap-1">
                  {i > 0 && <ArrowRight className="h-2.5 w-2.5 text-slate-300" />}
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${stageCfg(name).bg} ${stageCfg(name).text}`}>
                    {name} · {apps.length}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 text-xs text-slate-400 shrink-0">
          {open ? "Hide" : "Show"} details
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </div>
      </button>

      {/* Expanded body */}
      {open && (
        <div className="border-t border-slate-100">
          {/* Pipeline funnel bar */}
          <div className="flex items-center gap-0 overflow-x-auto px-5 py-4 border-b border-slate-100">
            {stages.map(([name, apps], i) => {
              const cfg = stageCfg(name);
              return (
                <div key={name} className="flex items-center gap-0 shrink-0">
                  {i > 0 && (
                    <div className="h-0 w-6 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-l-[10px] border-l-slate-200 shrink-0" />
                  )}
                  <div className={`flex flex-col items-center rounded-lg px-4 py-2 ${cfg.bg}`}>
                    <span className={`text-lg font-bold ${cfg.text}`}>{apps.length}</span>
                    <span className={`text-[10px] font-semibold uppercase tracking-wider ${cfg.text} opacity-80`}>{name}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Candidate rows */}
          <div className="divide-y divide-slate-50">
            {submissions.map((app) => {
              if (!app.candidate) return null;
              const c       = app.candidate;
              const stage   = app.stageName ?? "Submitted";
              const decision = decisions[app.id];
              return (
                <div key={app.id} className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50/60 transition-colors">
                  {/* Avatar */}
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${generateAvatarColor(c.id)}`}>
                    {getInitials(c.fullName)}
                  </div>

                  {/* Name + title */}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900 truncate">{c.fullName}</p>
                    <p className="text-[11px] text-slate-500 truncate">{c.currentTitle}{c.currentCompany ? ` · ${c.currentCompany}` : ""}</p>
                  </div>

                  {/* Stage badge */}
                  <div className="shrink-0 hidden sm:block">
                    <StageBadge name={stage} />
                  </div>

                  {/* Match score */}
                  {app.score != null && (
                    <div className="shrink-0 hidden md:block">
                      <ScoreRing score={app.score} />
                    </div>
                  )}

                  {/* Recruiter note */}
                  {app.recruiterNote && (
                    <p className="hidden lg:block max-w-xs text-[11px] text-slate-500 italic truncate flex-1">
                      "{app.recruiterNote}"
                    </p>
                  )}

                  {/* Decision pill */}
                  {decision && (
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      decision.decision === "advance" ? "bg-emerald-50 text-emerald-700" :
                      decision.decision === "hold"    ? "bg-amber-50 text-amber-700" :
                                                        "bg-red-50 text-red-600"
                    }`}>
                      {decision.decision === "advance" ? "Advancing" : decision.decision === "hold" ? "On Hold" : "Passed"}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClientPortalPage() {
  const params = useParams<{ portalSlug: string }>();
  const { data, loading, notFound, saveDecision } = usePortalData(params.portalSlug);
  const [decisions, setDecisions] = useState<DecisionState>({});
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  // Pre-populate decisions from DB data on load
  useEffect(() => {
    if (!data) return;
    const seeded: DecisionState = {};
    data.submissions.forEach((s) => {
      if (s.clientDecision) {
        seeded[s.id] = {
          decision: s.clientDecision as ClientDecision,
          reason:   s.clientDecisionReason ?? "",
          note:     s.clientDecisionNote ?? "",
        };
      }
    });
    if (Object.keys(seeded).length > 0) {
      setDecisions((prev) => ({ ...seeded, ...prev }));
    }
  }, [data]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-500">Loading portal…</p>
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <p className="text-2xl font-bold text-slate-900">Portal not found</p>
          <p className="mt-1 text-slate-500">Check the link you were sent.</p>
        </div>
      </div>
    );
  }

  const client = data.company;
  const clientJobs = data.jobs.filter((j) => j.status === "active");
  const selectedJob = activeJobId
    ? clientJobs.find((j) => j.id === activeJobId)
    : clientJobs[0];

  const submissions: PortalSubmission[] = data.submissions.filter(
    (s) => s.jobId === selectedJob?.id
  );

  const pending   = submissions.filter((a) => !decisions[a.id]);
  const decided   = submissions.filter((a) =>  decisions[a.id]);
  const advanced  = decided.filter((a) => decisions[a.id].decision === "advance").length;

  async function handleDecision(appId: string, decision: ClientDecision, reason: string, note: string) {
    setDecisions((prev) => ({ ...prev, [appId]: { decision, reason, note } }));
    const labels = { advance: "Advanced ✅", hold: "Put on hold ⏸", pass: "Passed ❌" };
    toast.success(labels[decision]);
    try {
      await saveDecision(appId, decision as "advance" | "hold" | "pass", reason, note);
    } catch (_err) {
      toast.error("Failed to save decision — please try again");
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Portal header */}
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold text-white", generateAvatarColor(client.id))}>
              {getInitials(client.name ?? "")}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">{client.name}</p>
              <p className="text-xs text-slate-500">Candidate Review Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <PortalNotifications portalSlug={params.portalSlug} submissions={data?.submissions ?? []} />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-8">
        {/* Job selector tabs */}
        {clientJobs.length > 1 && (
          <div className="mb-6 flex gap-2 overflow-x-auto">
            {clientJobs.map((job) => (
              <button
                key={job.id}
                onClick={() => setActiveJobId(job.id)}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                  (activeJobId ?? clientJobs[0].id) === job.id
                    ? "border-brand-300 bg-brand-50 text-brand-700"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                )}
              >
                <Briefcase className="h-3.5 w-3.5" />
                {job.title}
              </button>
            ))}
          </div>
        )}

        {selectedJob && (
          <>
            {/* Job header */}
            <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-xl font-bold text-slate-900">{selectedJob.title}</h1>
                  <div className="mt-1.5 flex flex-wrap gap-3 text-sm text-slate-500">
                    {selectedJob.location && (
                      <span className="flex items-center gap-1"><MapPin className="h-4 w-4" />{selectedJob.location}</span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-slate-900">{submissions.length}</p>
                  <p className="text-xs text-slate-500">candidates submitted</p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="mt-4">
                <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                  <span>{decided.length} reviewed · {advanced} advanced</span>
                  <span>{pending.length} awaiting review</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-brand-500 transition-all"
                    style={{ width: submissions.length ? `${(decided.length / submissions.length) * 100}%` : "0%" }}
                  />
                </div>
              </div>
            </div>

            {/* Req Summary Banner */}
            <ReqSummaryBanner
              submissions={submissions}
              decisions={decisions}
              jobTitle={selectedJob.title}
            />

            {/* Pending review */}
            {pending.length > 0 && (
              <div className="mb-8">
                <p className="mb-3 text-sm font-semibold text-slate-700">
                  Awaiting your review ({pending.length})
                </p>
                <div className="space-y-4">
                  {pending.map((app) => (
                    <CandidateSubmissionCard
                      key={app.id}
                      app={app}
                      existingDecision={decisions[app.id]}
                      onDecision={handleDecision}
                      portalSlug={params.portalSlug}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Already reviewed */}
            {decided.length > 0 && (
              <div>
                <p className="mb-3 text-sm font-semibold text-slate-400">
                  Already reviewed ({decided.length})
                </p>
                <div className="space-y-4">
                  {decided.map((app) => (
                    <CandidateSubmissionCard
                      key={app.id}
                      app={app}
                      existingDecision={decisions[app.id]}
                      onDecision={handleDecision}
                      portalSlug={params.portalSlug}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {submissions.length === 0 && (
              <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 py-16 text-center">
                <Briefcase className="mb-3 h-10 w-10 text-slate-300" />
                <p className="font-semibold text-slate-600">No candidates submitted yet</p>
                <p className="mt-1 text-sm text-slate-400">Your recruiter will notify you when profiles arrive.</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
