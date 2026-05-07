/**
 * POST /api/ai/jd-generate — US-112: AI Job Description Generator & Assistant
 *
 * Drafts a job description from: role title, client name, seniority level,
 * and key skills. Supports rewrite modes (inclusive, shorter, more technical).
 * Also runs bias detection and returns flagged phrases.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAgencyContext } from "@/lib/supabase/agency-cache";
import { requirePlan } from "@/lib/api/require-plan";
import { checkCsrf } from "@/lib/csrf";
import { sanitizeForPrompt } from "@/lib/ai/sanitize";
import { checkAgencyLimit, recordUsage, AiRateLimitError } from "@/lib/ai/cost-tracker";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are an expert technical recruiter and job description writer.
Write clear, compelling, bias-free job descriptions in Markdown format.
Structure: Summary (2-3 sentences) → Responsibilities (5-7 bullets) → Requirements (must-have + nice-to-have) → What we offer.
Avoid gendered language (rockstar, ninja, he/she), age-coded phrases (recent grad, digital native), and exclusionary requirements.
Keep descriptions concise — 300-400 words target.`;

const REWRITE_PROMPTS: Record<string, string> = {
  inclusive:  "Rewrite to remove biased, gendered, or exclusionary language. Replace each flagged phrase with a neutral alternative. Keep all factual requirements.",
  shorter:    "Condense to ~200 words. Keep must-have requirements. Remove nice-to-haves and marketing fluff.",
  technical:  "Rewrite to be more technically specific. Replace vague requirements with precise technology names, version numbers, and concrete experience examples.",
};

export async function POST(req: NextRequest) {
  try {
    // US-503: CSRF + Content-Type guard.
    const csrfErr = checkCsrf(req);
    if (csrfErr) return csrfErr;

    // US-496 fix: proper call signature + real agency context resolution.
    const supabase = await createClient();
    const ctx = await getAgencyContext(supabase);
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // US-499 / US-514: granular plan gate — ai_jd_generator has its own key.
    const planGuard = await requirePlan(supabase, ctx.agencyId, "ai_jd_generator");
    if (planGuard) return planGuard;

    const { title, clientName, level, skills, currentJd, rewriteMode } = await req.json();

    // US-502: sanitize every user-supplied value before it reaches Claude.
    const safeTitle      = sanitizeForPrompt(title);
    const safeClientName = sanitizeForPrompt(clientName ?? "a fast-growing technology company");
    const safeLevel      = sanitizeForPrompt(level ?? "Mid-level");
    const safeSkills     = sanitizeForPrompt(Array.isArray(skills) ? skills.join(", ") : skills ?? "to be determined");
    const safeCurrentJd  = sanitizeForPrompt(currentJd, { maxLen: 6_000 });

    let userMessage: string;

    if (rewriteMode && safeCurrentJd) {
      const modeKey = typeof rewriteMode === "string" ? rewriteMode : "inclusive";
      const instruction = REWRITE_PROMPTS[modeKey] ?? REWRITE_PROMPTS.inclusive;
      userMessage = `${instruction}\n\nOriginal JD:\n${safeCurrentJd}`;
    } else {
      if (!safeTitle) return NextResponse.json({ error: "title is required" }, { status: 400 });
      userMessage = `Write a job description for:
Role: ${safeTitle}
Client / Company: ${safeClientName}
Seniority: ${safeLevel}
Key skills: ${safeSkills}`;
    }

    // US-500: gate the Claude call through the cost tracker.
    try {
      await checkAgencyLimit(ctx.agencyId);
    } catch (limitErr: any) {
      if (limitErr instanceof AiRateLimitError) {
        return NextResponse.json(
          { error: "AI daily cap reached", used: limitErr.usedUsd, cap: limitErr.capUsd },
          { status: 429 },
        );
      }
      throw limitErr;
    }

    const startedAt = Date.now();
    const model = "claude-haiku-4-5-20251001";
    const message = await anthropic.messages.create({
      model,
      max_tokens: 1024,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: "user", content: userMessage }],
    });

    // Record actual usage (fire-and-forget).
    void recordUsage({
      agencyId:     ctx.agencyId,
      userId:       ctx.userId,
      provider:     "anthropic",
      model,
      operation:    rewriteMode ? `jd_rewrite_${rewriteMode}` : "jd_generate",
      inputTokens:  message.usage?.input_tokens  ?? 0,
      outputTokens: message.usage?.output_tokens ?? 0,
      latencyMs:    Date.now() - startedAt,
    });

    const jd = (message.content[0] as { text: string }).text;

    // Bias detection — scan for common problematic phrases
    const BIAS_PATTERNS: { pattern: RegExp; suggestion: string }[] = [
      { pattern: /\b(rockstar|ninja|guru|wizard|superstar)\b/gi,          suggestion: "experienced professional" },
      { pattern: /\b(he|she|his|her)\b/gi,                                suggestion: "they / their" },
      { pattern: /\b(recent graduate|new grad|fresh graduate)\b/gi,        suggestion: "early-career professional" },
      { pattern: /\b(digital native|tech native)\b/gi,                    suggestion: "technology-comfortable" },
      { pattern: /\b(young|energetic team)\b/gi,                          suggestion: "dynamic team" },
      { pattern: /\b(must have \d+ years?)\b/gi,                          suggestion: "strong background in" },
    ];

    const biasFlags: { phrase: string; suggestion: string; index: number }[] = [];
    for (const { pattern, suggestion } of BIAS_PATTERNS) {
      let match: RegExpExecArray | null;
      const re = new RegExp(pattern.source, pattern.flags);
      while ((match = re.exec(jd)) !== null) {
        biasFlags.push({ phrase: match[0], suggestion, index: match.index });
      }
    }

    return NextResponse.json({ jd, biasFlags });
  } catch (err: any) {
    // US-504: malformed JSON bodies should produce 400, not 500.
    if (err?.name === "SyntaxError") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
