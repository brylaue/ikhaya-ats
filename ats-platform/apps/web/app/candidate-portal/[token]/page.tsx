"use client";

/**
 * /candidate-portal/[token]
 * US-240: Candidate-facing portal — stage status view.
 *
 * Public page (no auth). The token in the URL is the credential.
 * Shows the candidate their name, the role they applied for,
 * their current pipeline stage with a progress indicator, and
 * any prep materials the recruiter has attached to their profile.
 */

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { CircleCheck as CheckCircle2, Clock, BookOpen, ExternalLink, ChevronRight, Loader as Loader2, CircleAlert as AlertCircle, Briefcase, Building2, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Stage {
  name:     string;
  position: number;
}

interface PrepItem {
  id:          string;
  title:       string;
  contentType: "text" | "link";
  body:        string | null;
  url:         string | null;
  stageName:   string | null;
}

interface PortalData {
  locked?: boolean;
  candidate: {
    firstName:      string;
    lastName:       string;
    email:          string;
    currentTitle:   string | null;
    currentCompany: string | null;
  };
  job: { title: string; company: string | null } | null;
  pipeline: {
    currentStage:      string | null;
    currentStageOrder: number;
    stages:            Stage[];
  };
  prepContent: PrepItem[];
}

// ─── Stage progress bar ───────────────────────────────────────────────────────

function StageProgress({ stages, currentOrder }: { stages: Stage[]; currentOrder: number }) {
  if (stages.length === 0) return null;
  return (
    <div className="mb-8">
      <div className="flex items-center gap-0">
        {stages.map((stage, i) => {
          const isDone    = stage.position < currentOrder;
          const isCurrent = stage.position === currentOrder;
          const isLast    = i === stages.length - 1;
          return (
            <div key={stage.name} className="flex items-center flex-1 min-w-0">
              <div className="flex flex-col items-center flex-1">
                <div
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-colors",
                    isDone    && "bg-brand-600 border-brand-600 text-white",
                    isCurrent && "bg-white border-brand-600 text-brand-600",
                    !isDone && !isCurrent && "bg-white border-slate-300 text-slate-400"
                  )}
                >
                  {isDone ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                </div>
                <span
                  className={cn(
                    "mt-1.5 text-[10px] font-medium text-center leading-tight max-w-[60px] truncate",
                    isCurrent ? "text-brand-600" : isDone ? "text-slate-600" : "text-slate-400"
                  )}
                >
                  {stage.name}
                </span>
              </div>
              {!isLast && (
                <div
                  className={cn(
                    "h-0.5 flex-1 mx-1 -mt-4",
                    stage.position < currentOrder ? "bg-brand-600" : "bg-slate-200"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Prep item card ───────────────────────────────────────────────────────────

function PrepCard({ item }: { item: PrepItem }) {
  const [expanded, setExpanded] = useState(false);

  if (item.contentType === "link") {
    return (
      <a
        href={item.url ?? "#"}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-white hover:border-brand-300 hover:bg-brand-50 transition-colors group"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="shrink-0 w-8 h-8 rounded-lg bg-brand-100 flex items-center justify-center">
            <ExternalLink className="h-4 w-4 text-brand-600" />
          </div>
          <span className="text-sm font-medium text-slate-800 truncate">{item.title}</span>
        </div>
        <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-brand-600 shrink-0 ml-2" />
      </a>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="shrink-0 w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
            <FileText className="h-4 w-4 text-violet-600" />
          </div>
          <span className="text-sm font-medium text-slate-800">{item.title}</span>
        </div>
        <ChevronRight
          className={cn(
            "h-4 w-4 text-slate-400 shrink-0 ml-2 transition-transform",
            expanded && "rotate-90"
          )}
        />
      </button>
      {expanded && item.body && (
        <div className="px-4 pb-4 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap border-t border-slate-100 pt-3">
          {item.body}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CandidatePortalPage() {
  const params = useParams<{ token: string }>();
  const [data,    setData]    = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/candidate-portal/${params.token}`)
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error ?? "Unable to load portal");
        }
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [params.token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-sm w-full bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-sm">
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-6 w-6 text-red-500" />
          </div>
          <h1 className="text-lg font-semibold text-slate-800 mb-2">Link unavailable</h1>
          <p className="text-sm text-slate-500">{error ?? "This portal link is no longer active."}</p>
          <p className="text-xs text-slate-400 mt-4">
            If you think this is a mistake, contact the recruiter who sent you this link.
          </p>
        </div>
      </div>
    );
  }

  const { candidate, job, pipeline, prepContent, locked } = data;
  const fullName = `${candidate.firstName} ${candidate.lastName}`;

  // US-241: Stage gate — recruiter locked content until a later stage
  if (locked) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-sm w-full bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-sm">
          <div className="w-14 h-14 rounded-full bg-violet-50 flex items-center justify-center mx-auto mb-4">
            <Clock className="h-7 w-7 text-violet-500" />
          </div>
          <h1 className="text-lg font-semibold text-slate-800 mb-2">Coming soon, {candidate.firstName}!</h1>
          <p className="text-sm text-slate-500 leading-relaxed">
            Your recruiter is preparing materials for the next step
            {pipeline.currentStage ? ` — you're currently at <strong>${pipeline.currentStage}</strong>` : ""}.
            Check back after your next interview stage for prep resources.
          </p>
          {job && (
            <p className="text-xs text-slate-400 mt-4 font-medium">{job.title}{job.company ? ` · ${job.company}` : ""}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-slate-700">Candidate Portal</span>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        {/* Welcome card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <p className="text-sm text-slate-500 mb-1">Welcome back,</p>
          <h1 className="text-2xl font-bold text-slate-900">{fullName}</h1>
          {candidate.currentTitle && (
            <p className="text-sm text-slate-500 mt-1">{candidate.currentTitle}</p>
          )}

          {job && (
            <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col gap-1">
              <div className="flex items-center gap-2 text-sm text-slate-700">
                <Briefcase className="h-4 w-4 text-slate-400" />
                <span className="font-medium">{job.title}</span>
              </div>
              {job.company && (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Building2 className="h-4 w-4 text-slate-400" />
                  <span>{job.company}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Stage progress */}
        {pipeline.stages.length > 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-5">
              <Clock className="h-4 w-4 text-brand-600" />
              <h2 className="text-sm font-semibold text-slate-800">Application Status</h2>
            </div>
            <StageProgress stages={pipeline.stages} currentOrder={pipeline.currentStageOrder} />
            {pipeline.currentStage && (
              <div className="flex items-center gap-2 mt-2 pt-4 border-t border-slate-100">
                <span className="text-xs text-slate-500">Current stage:</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 text-xs font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse" />
                  {pipeline.currentStage}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-brand-600" />
              <h2 className="text-sm font-semibold text-slate-800">Application Status</h2>
            </div>
            <p className="text-sm text-slate-500">
              Your application is under review. We'll be in touch soon.
            </p>
          </div>
        )}

        {/* Prep content */}
        {prepContent.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <BookOpen className="h-4 w-4 text-violet-600" />
              <h2 className="text-sm font-semibold text-slate-800">Preparation Materials</h2>
            </div>
            <div className="space-y-3">
              {prepContent.map((item) => (
                <PrepCard key={item.id} item={item} />
              ))}
            </div>
          </div>
        )}

        {/* US-422: Candidate-facing AI transparency */}
        <AiTransparencySection token={params.token} firstName={candidate.firstName} />

        {/* Footer */}
        <p className="text-center text-xs text-slate-400 pb-4">
          This is a private link for {candidate.firstName} only — please do not share it.
        </p>
      </div>
    </div>
  );
}

// ─── AI transparency section (US-422) ─────────────────────────────────────────

interface TransparencyDecision {
  id:           string;
  type:         string;
  rationale:    string | null;
  modelCardUrl: string | null;
  model:        string;
  provider:     string;
  relatedType:  string | null;
  relatedId:    string | null;
  relatedLabel: string | null;
  createdAt:    string;
}

interface TransparencyResponse {
  enabled:   boolean;
  decisions: TransparencyDecision[];
}

const CANDIDATE_TYPE_COPY: Record<string, string> = {
  match_score_embedding: "We ranked your profile against a role using vector similarity.",
  match_score_explain:   "We scored how well your profile fits a role and wrote a short rationale.",
  resume_parse:          "We extracted structured fields (title, company, skills, experience) from your résumé.",
  skill_normalise:       "We standardised your skill names to a shared taxonomy.",
  candidate_summary:     "We wrote a short summary of your profile for your recruiter's view.",
  candidate_outreach:    "We drafted an outreach message addressed to you for a recruiter to review.",
  shortlist_compile:     "We included you in a ranked shortlist with a short blurb.",
  auto_tag:              "We suggested tags based on your profile.",
};

function AiTransparencySection({ token, firstName }: { token: string; firstName: string }) {
  const [data, setData] = useState<TransparencyResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/candidate-portal/${token}/ai-decisions`)
      .then(async (r) => r.ok ? r.json() : { enabled: false, decisions: [] })
      .then(setData)
      .catch(() => setData({ enabled: false, decisions: [] }))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return null;
  if (!data || !data.enabled) return null;            // agency opted out
  if (data.decisions.length === 0) return null;       // nothing to show yet

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <svg className="h-4 w-4 text-violet-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2l2.09 5.26L20 8l-4 4 1 6-5-3-5 3 1-6-4-4 5.91-.74L12 2z" />
        </svg>
        <h2 className="text-sm font-semibold text-slate-800">AI transparency</h2>
      </div>
      <p className="text-xs text-slate-500 leading-relaxed mb-4">
        {firstName}, you have a right to know when automated tools shaped your application.
        Here are the AI-assisted steps your recruiter's agency took on your profile.
      </p>
      <ol className="space-y-3">
        {data.decisions.map((d) => {
          const copy = CANDIDATE_TYPE_COPY[d.type] ?? d.rationale ?? "An AI-assisted decision was logged on your profile.";
          const date = new Date(d.createdAt);
          return (
            <li key={d.id} className="rounded-lg border border-slate-100 px-3 py-2.5 bg-slate-50/40">
              <div className="text-sm text-slate-800 leading-snug">{copy}</div>
              {d.relatedLabel && (
                <div className="text-[11px] text-slate-500 mt-0.5">For role: {d.relatedLabel}</div>
              )}
              <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                <span>{d.provider}/{d.model}</span>
                {d.modelCardUrl && (
                  <a href={d.modelCardUrl} target="_blank" rel="noopener noreferrer"
                     className="text-violet-600 hover:text-violet-800 underline">
                    model card
                  </a>
                )}
                <span>•</span>
                <span>{date.toLocaleDateString()}</span>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="text-[11px] text-slate-400 mt-4 leading-relaxed">
        These records are kept for audit purposes in line with the EU AI Act. Contact your recruiter if you have questions.
      </p>
    </div>
  );
}
