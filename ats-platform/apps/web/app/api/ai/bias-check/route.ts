/**
 * POST /api/ai/bias-check
 * US-483: JD Bias Checker — AI scans a job description for biased language.
 *
 * Detects gendered wording, ageist phrases, exclusionary requirements,
 * cultural-fit code words, and other language known to deter diverse applicants.
 * Returns structured findings with specific quotes and plain-English alternatives.
 *
 * Body:    { text: string }          — raw JD text (max 5000 chars)
 * Returns: { score, summary, issues }
 */

import { NextRequest, NextResponse }          from "next/server";
import { createClient }                       from "@/lib/supabase/server";
import { callClaude, AiRateLimitError }       from "@/lib/ai/client";
import { checkCsrf }                          from "@/lib/csrf";
import { getAgencyContext }                   from "@/lib/supabase/agency-cache";
import { requirePlan }                        from "@/lib/api/require-plan";
import { sanitizeForPrompt }                  from "@/lib/ai/sanitize";

// ─── Types ────────────────────────────────────────────────────────────────────

export type BiasSeverity = "high" | "medium" | "low";
export type BiasCategory =
  | "gendered_language"
  | "ageism"
  | "exclusionary_requirement"
  | "culture_fit_code"
  | "ability_bias"
  | "socioeconomic"
  | "other";

export interface BiasIssue {
  phrase:      string;          // Exact or near-exact quote from the JD
  category:    BiasCategory;
  severity:    BiasSeverity;
  explanation: string;          // Why this phrase may be problematic
  suggestion:  string;          // A concrete alternative
}

export interface BiasCheckResult {
  /** 0 = no issues found, 100 = severely biased */
  score:    number;
  summary:  string;             // 1–2 sentence plain-English verdict
  issues:   BiasIssue[];
}

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM = `You are an expert HR consultant specializing in equitable hiring practices and inclusive job description writing. Your task is to analyze job descriptions for language that may unintentionally deter qualified candidates from underrepresented groups.

Analyze the provided job description for these bias categories:
- gendered_language: Words/phrases that skew male or female (e.g. "rockstar", "ninja", "nurturing", "dominant")
- ageism: Language that implies age preferences (e.g. "recent graduate", "digital native", "energetic young team")
- exclusionary_requirement: Requirements that unnecessarily narrow the pool (e.g. "Ivy League", "4-year degree" for roles where it's not essential, years of experience that are inflated)
- culture_fit_code: Vague phrases that can mask cultural homogeneity preferences (e.g. "culture fit", "work hard, play hard", "beer Fridays")
- ability_bias: Physical/cognitive requirements not essential to the role (e.g. "must be able to lift 50lbs" for a desk job)
- socioeconomic: Language that assumes socioeconomic background (e.g. unpaid internship framing, "must have own car")
- other: Any other language that research shows deters diverse applicants

Return ONLY valid JSON in this exact shape — no markdown, no extra keys:
{
  "score": number,            // 0–100 bias score (0 = clean, 100 = highly biased)
  "summary": string,          // 1–2 sentences: overall assessment and main concern
  "issues": [
    {
      "phrase": string,       // Exact or near-exact quote from the JD
      "category": string,     // One of the categories above
      "severity": string,     // "high" | "medium" | "low"
      "explanation": string,  // Why this may deter applicants (1–2 sentences)
      "suggestion": string    // Concrete replacement or guidance (1 sentence)
    }
  ]
}

If no issues are found, return score 0, a positive summary, and an empty issues array.
Be specific — quote the actual phrase from the text. Do not invent problems that aren't there.`;

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const ctx = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // US-499 / US-514: granular plan-tier gate — bias checker has its own key.
  const planGuard = await requirePlan(supabase, ctx.agencyId, "ai_bias_checker");
  if (planGuard) return planGuard;

  const body = await req.json().catch(() => ({}));
  const { text } = body as { text?: string };

  if (!text || text.trim().length < 20) {
    return NextResponse.json(
      { error: "text is required (min 20 characters)" },
      { status: 400 }
    );
  }

  // US-502: sanitize + truncate. sanitizeForPrompt already caps and scrubs
  // injection phrases; passing maxLen explicitly keeps behaviour identical
  // to the prior slice(0, 5000).
  const jdText = sanitizeForPrompt(text.trim(), { maxLen: 5000 });

  try {
    const raw = await callClaude(
      SYSTEM,
      [{ role: "user", content: `Analyze this job description for biased language:\n\n${jdText}` }],
      1500,
      { agencyId: ctx.agencyId, userId: ctx.userId, operation: "bias_check" }
    );

    // US-504: wrap JSON.parse so malformed model output returns a structured
    // 502 instead of a 500 with "Unexpected token" bubbling up.
    const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    let result: BiasCheckResult;
    try {
      result = JSON.parse(cleaned) as BiasCheckResult;
    } catch {
      console.error("[ai/bias-check] model returned non-JSON:", cleaned.slice(0, 200));
      return NextResponse.json(
        { error: "AI returned malformed output — try again" },
        { status: 502 }
      );
    }

    // Validate shape
    if (typeof result.score !== "number" || !result.summary || !Array.isArray(result.issues)) {
      return NextResponse.json(
        { error: "AI returned unexpected shape — try again" },
        { status: 502 }
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AiRateLimitError) {
      return NextResponse.json(
        { error: "AI daily cost limit reached", retryAfter: "24h" },
        { status: 429 }
      );
    }
    console.error("[ai/bias-check]", err);
    return NextResponse.json({ error: "Analysis failed" }, { status: 502 });
  }
}
