/**
 * POST /api/candidates/[id]/ai/interview
 * US-376: Generate role-specific interview questions for a candidate via Claude.
 *
 * Body: {} (candidate context fetched server-side)
 * Returns: { questions: { category: string; questions: string[] }[] }
 *
 * Security fixes (US-515):
 *  - IDOR: candidate fetch scoped to caller's agency
 *  - Plan gate: ai_match_scoring (Growth) required
 *  - Prompt injection: all DB fields sanitized before reaching Claude
 *  - JSON.parse: wrapped in try/catch — malformed model output returns 502
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@/lib/supabase/server";
import { getAgencyContext }          from "@/lib/supabase/agency-cache";
import { requirePlan }               from "@/lib/api/require-plan";
import { callClaude, AiRateLimitError } from "@/lib/ai/client";
import { checkCsrf }                 from "@/lib/csrf";
import { sanitizeForPrompt }         from "@/lib/ai/sanitize";

const SYSTEM = `You are a senior executive recruiter and hiring advisor generating structured interview guides.
Given a candidate's background, produce 4 focused categories of 2-3 questions each.
Each question should be:
- Specific to the candidate's actual background (reference their title, company, or skills)
- Designed to surface evidence of impact, not just opinions
- Appropriate for a 45-60 minute recruiter screen (not a technical test)
Return ONLY valid JSON in this exact shape, no markdown fences, no extra keys:
[
  { "category": "Category Name", "questions": ["Question 1", "Question 2", "Question 3"] },
  ...
]`;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const ctx = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Plan gate — copilot features are Growth tier
  const planGuard = await requirePlan(supabase, ctx.agencyId, "ai_match_scoring");
  if (planGuard) return planGuard;

  const { id } = await params;

  // IDOR fix: scope to caller's agency
  const { data: candidate } = await supabase
    .from("candidates")
    .select("id, agency_id, full_name, current_title, current_company, skills, years_experience, summary")
    .eq("id", id)
    .eq("agency_id", ctx.agencyId)
    .single();

  if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const skillList = sanitizeForPrompt(
    Array.isArray(candidate.skills) ? (candidate.skills as string[]).join(", ") : ""
  );

  const userMsg = [
    `Candidate: ${sanitizeForPrompt(candidate.full_name)}`,
    `Current role: ${sanitizeForPrompt(candidate.current_title ?? "unknown")} at ${sanitizeForPrompt(candidate.current_company ?? "unknown")}`,
    candidate.years_experience ? `Experience: ${candidate.years_experience} years` : null,
    skillList                  ? `Key skills: ${skillList}` : null,
    candidate.summary          ? `Bio: ${sanitizeForPrompt(candidate.summary)}` : null,
    `Generate 4 question categories with 2-3 questions each. Always include a "Motivation & Fit" category last.`,
  ].filter(Boolean).join("\n");

  try {
    const raw = await callClaude(
      SYSTEM,
      [{ role: "user", content: userMsg }],
      1024,
      { agencyId: ctx.agencyId, userId: ctx.userId, operation: "interview_questions" }
    );

    // Strip any accidental markdown fences then parse
    const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();

    // US-504 / US-515: guard JSON.parse — malformed model output returns 502
    let questions: { category: string; questions: string[] }[];
    try {
      questions = JSON.parse(cleaned) as { category: string; questions: string[] }[];
    } catch {
      console.error("[ai/interview] model returned non-JSON:", cleaned.slice(0, 200));
      return NextResponse.json(
        { error: "AI returned malformed output — try again" },
        { status: 502 }
      );
    }

    return NextResponse.json({ questions });
  } catch (err) {
    if (err instanceof AiRateLimitError) {
      return NextResponse.json(
        { error: "AI daily cost limit reached", retryAfter: "24h" },
        { status: 429 }
      );
    }
    console.error("[ai/interview]", err);
    return NextResponse.json({ error: "Generation failed" }, { status: 502 });
  }
}
