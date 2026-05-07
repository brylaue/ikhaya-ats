/**
 * AI Match Scoring with Explainable Rationale (US-110).
 *
 * Produces a 0-100 match score PLUS a structured breakdown the UI can render:
 *   { skills, experience, location, education, tenure }
 * and a short rationale + confidence 0-1.
 *
 * Design notes:
 * - The embedding-based cache `ai_match_scores.score` is kept as the primary
 *   ranking signal (already wired into `/api/candidates/[id]/matching-jobs`).
 *   This module layers *explanations* on top — same row, new columns populated
 *   lazily when a recruiter opens the details panel.
 * - Token budget: deliberately small (~800 out). Breakdown is the expensive
 *   field; we cap the matched/missing skill arrays at 8 entries each.
 * - Retraining on feedback is out-of-scope for this file — it just collects
 *   signal via the /feedback route. Reranker training is a future async job.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { callClaude, AiMalformedOutputError } from "@/lib/ai/client";
import { recordAiDecision, describeDecision } from "@/lib/ai/decision-log";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any, any, any, any, any>;

export interface CriterionBreakdown {
  score:   number;            // 0-100
  matched?: string[];         // populated for "skills"
  missing?: string[];         // populated for "skills"
  summary?: string;           // short one-liner, populated for non-skill criteria
}

export interface MatchBreakdown {
  skills?:     CriterionBreakdown;
  experience?: CriterionBreakdown;
  location?:   CriterionBreakdown;
  education?:  CriterionBreakdown;
  tenure?:     CriterionBreakdown;
}

export interface MatchExplanation {
  score:       number;         // 0-100 overall
  breakdown:   MatchBreakdown;
  rationale:   string;         // 1-2 sentences
  confidence:  number;         // 0-1
  generatedBy: string;         // model id
}

/** Raw candidate fields pulled for scoring. Column set matches real schema. */
interface CandidateSnapshot {
  first_name:      string | null;
  last_name:       string | null;
  current_title:   string | null;
  current_company: string | null;
  location:        Record<string, string> | string | null;
  skills:          string[] | null;
  summary:         string | null;
}

interface JobSnapshot {
  title:        string | null;
  location:     string | null;
  description:  string | null;
  requirements: string | null;
}

const SYSTEM_PROMPT = `You are an expert technical recruiter evaluating a candidate against a job.
Return ONLY valid JSON with this exact shape:
{
  "score": number (0-100),
  "breakdown": {
    "skills":     {"score": number, "matched": string[], "missing": string[]},
    "experience": {"score": number, "summary": string},
    "location":   {"score": number, "summary": string},
    "education":  {"score": number, "summary": string},
    "tenure":     {"score": number, "summary": string}
  },
  "rationale":  string (1-2 sentences — state strongest driver + biggest gap),
  "confidence": number (0-1, self-reported — lower if data is sparse)
}
Scoring rules:
- Overall score should reflect the weighted average (skills ~40%, experience ~25%, location ~15%, education ~10%, tenure ~10%).
- skills.matched: up to 8 explicit matches. missing: up to 8 requirement gaps.
- Be honest about gaps — don't inflate scores.
- Return confidence < 0.6 when the candidate/job snapshot is thin.`;

/**
 * Compute (or refresh) an explainable match score for a candidate/job pair.
 * Persists the breakdown + rationale onto the existing ai_match_scores row
 * (upsert on candidate_id,job_id).
 *
 * The caller is responsible for CSRF + auth. RLS enforces agency scoping when
 * reading the candidate/job rows.
 */
export async function explainMatchScore(params: {
  agencyId:    string;
  userId?:     string;
  candidateId: string;
  jobId:       string;
  supabase:    AnySupabase;
  /** Existing cached score to anchor on. If omitted we let the LLM compute. */
  existingScore?: number | null;
}): Promise<MatchExplanation> {
  const { agencyId, userId, candidateId, jobId, supabase, existingScore } = params;

  // Fetch both sides in parallel.
  const [candRes, jobRes] = await Promise.all([
    supabase
      .from("candidates")
      .select("first_name, last_name, current_title, current_company, location, skills, summary")
      .eq("id", candidateId)
      .eq("agency_id", agencyId)
      .maybeSingle(),
    supabase
      .from("jobs")
      .select("title, location, description, requirements")
      .eq("id", jobId)
      .maybeSingle(),
  ]);

  const candidate = candRes.data as CandidateSnapshot | null;
  const job       = jobRes.data  as JobSnapshot       | null;

  if (!candidate || !job) {
    throw new Error("Candidate or job not found for this agency");
  }

  const candName = [candidate.first_name, candidate.last_name].filter(Boolean).join(" ") || "—";
  const candLocation = formatLocation(candidate.location);

  const userContent = [
    `CANDIDATE:`,
    `Name: ${candName}`,
    `Current title: ${candidate.current_title ?? "—"}`,
    `Current company: ${candidate.current_company ?? "—"}`,
    `Location: ${candLocation || "—"}`,
    `Skills: ${(candidate.skills ?? []).join(", ") || "—"}`,
    `Summary: ${truncate(candidate.summary ?? "", 600)}`,
    ``,
    `JOB:`,
    `Title: ${job.title ?? "—"}`,
    `Location: ${job.location ?? "—"}`,
    `Description: ${truncate(job.description ?? "", 800)}`,
    `Requirements: ${truncate(job.requirements ?? "", 600)}`,
    ``,
    existingScore != null
      ? `Pre-computed vector similarity score: ${existingScore.toFixed(1)}/100. Use this as an anchor — your overall score should generally stay within ±15 of it unless the breakdown strongly contradicts.`
      : `No pre-computed score — calibrate from scratch.`,
  ].join("\n");

  const raw = await callClaude(
    SYSTEM_PROMPT,
    [{ role: "user", content: userContent }],
    800,
    { agencyId, userId: userId ?? undefined, operation: "match_score_explain" },
  );

  // US-504: defensive JSON.parse so a malformed model response surfaces as a
  // typed error rather than an unhandled SyntaxError. The route handler
  // translates AiMalformedOutputError → HTTP 502.
  const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  let parsed: Partial<MatchExplanation>;
  try {
    parsed = JSON.parse(cleaned) as Partial<MatchExplanation>;
  } catch {
    console.error("[match-score] model returned non-JSON:", cleaned.slice(0, 200));
    throw new AiMalformedOutputError("match_score");
  }

  const explanation: MatchExplanation = {
    score:       clamp0100(parsed.score ?? existingScore ?? 50),
    breakdown:   sanitizeBreakdown(parsed.breakdown ?? {}),
    rationale:   (parsed.rationale ?? "").slice(0, 600),
    confidence:  clamp01(parsed.confidence ?? 0.5),
    generatedBy: "claude-sonnet-4-6",
  };

  // Persist back to ai_match_scores (upsert: score may be refreshed too).
  // Uses the user's supabase client so RLS enforces agency scoping on write.
  await supabase
    .from("ai_match_scores")
    .upsert(
      {
        agency_id:     agencyId,
        candidate_id:  candidateId,
        job_id:        jobId,
        score:         explanation.score,
        breakdown:     explanation.breakdown,
        rationale:     explanation.rationale,
        confidence:    explanation.confidence,
        generated_by:  explanation.generatedBy,
        explained_at:  new Date().toISOString(),
      },
      { onConflict: "candidate_id,job_id" },
    );

  // US-422: EU AI Act decision log. Candidate-visible because the match
  // score directly shapes whether the candidate gets surfaced for this job.
  void recordAiDecision({
    agencyId,
    userId:             userId ?? null,
    type:               "match_score_explain",
    subject:            { type: "candidate", id: candidateId },
    related:            { type: "job", id: jobId },
    provider:           "anthropic",
    model:              explanation.generatedBy,
    rationale:          describeDecision("match_score_explain"),
    inputPayload:       { candidateId, jobId, existingScore },
    visibleToCandidate: true,
  });

  return explanation;
}

/* ─── helpers ────────────────────────────────────────────────────────────── */

function clamp0100(n: unknown): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(100, Math.round(x)));
}

function clamp01(n: unknown): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return 0.5;
  return Math.max(0, Math.min(1, Number(x.toFixed(2))));
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function formatLocation(loc: CandidateSnapshot["location"]): string {
  if (!loc) return "";
  if (typeof loc === "string") return loc;
  // location is jsonb — prefer city, state, country order
  const parts = [loc.city, loc.state, loc.country].filter(Boolean);
  return parts.join(", ");
}

function sanitizeBreakdown(raw: Partial<MatchBreakdown>): MatchBreakdown {
  const keys: Array<keyof MatchBreakdown> = [
    "skills", "experience", "location", "education", "tenure",
  ];
  const out: MatchBreakdown = {};
  for (const k of keys) {
    const v = raw[k];
    if (!v || typeof v !== "object") continue;
    out[k] = {
      score:   clamp0100((v as CriterionBreakdown).score),
      matched: Array.isArray((v as CriterionBreakdown).matched)
        ? (v as CriterionBreakdown).matched!.slice(0, 8).map(String)
        : undefined,
      missing: Array.isArray((v as CriterionBreakdown).missing)
        ? (v as CriterionBreakdown).missing!.slice(0, 8).map(String)
        : undefined,
      summary: typeof (v as CriterionBreakdown).summary === "string"
        ? (v as CriterionBreakdown).summary!.slice(0, 200)
        : undefined,
    };
  }
  return out;
}
