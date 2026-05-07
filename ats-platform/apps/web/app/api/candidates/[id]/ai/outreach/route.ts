/**
 * POST /api/candidates/[id]/ai/outreach
 * US-376: Generate a personalised outreach email for a candidate via Claude.
 *
 * Body: { tone?: "professional" | "casual" | "direct"; roleContext?: string }
 * Returns: { draft: string }
 *
 * Security fixes (US-515):
 *  - IDOR: candidate fetch scoped to caller's agency (defence-in-depth on top of RLS)
 *  - Plan gate: ai_match_scoring (Growth) required
 *  - Prompt injection: all user-supplied fields sanitized before reaching Claude
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@/lib/supabase/server";
import { getAgencyContext }          from "@/lib/supabase/agency-cache";
import { requirePlan }               from "@/lib/api/require-plan";
import { callClaude, AiRateLimitError } from "@/lib/ai/client";
import { checkCsrf }                 from "@/lib/csrf";
import { sanitizeForPrompt }         from "@/lib/ai/sanitize";

const SYSTEM = `You are an expert executive recruiter writing personalised cold outreach emails for top-tier candidates.
Write a compelling, concise outreach email (3-4 short paragraphs, no fluff) that:
- Opens with a specific, genuine observation about the candidate's background
- Teases an exciting opportunity without revealing the client name
- Creates curiosity and a clear, low-friction call to action (20-min call)
- Closes with a warm but professional sign-off from the recruiter
Do NOT use generic phrases like "I hope this finds you well" or "I am reaching out because".
Return ONLY the email body text with no subject line prefix.`;

const TONE_GUIDE: Record<string, string> = {
  casual:       "conversational and warm",
  direct:       "brief, direct, and punchy",
  professional: "polished and professional",
};

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
  const { tone = "professional", roleContext = "" } = await req.json().catch(() => ({}));

  // IDOR fix: scope fetch to caller's agency (defence-in-depth on top of RLS)
  const { data: candidate } = await supabase
    .from("candidates")
    .select("id, agency_id, full_name, current_title, current_company, skills, location, years_experience, summary")
    .eq("id", id)
    .eq("agency_id", ctx.agencyId)
    .single();

  if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Fetch recruiter name for sign-off
  const { data: recruiter } = await supabase
    .from("users")
    .select("full_name")
    .eq("id", ctx.userId)
    .single();

  const recruiterName = sanitizeForPrompt(recruiter?.full_name ?? "Your recruiter");
  const skillList     = sanitizeForPrompt(
    Array.isArray(candidate.skills) ? (candidate.skills as string[]).join(", ") : ""
  );
  const safeContext   = sanitizeForPrompt(roleContext, { maxLen: 1_000 });
  const toneGuide     = TONE_GUIDE[typeof tone === "string" ? tone : "professional"] ?? TONE_GUIDE.professional;

  const userMsg = [
    `Candidate: ${sanitizeForPrompt(candidate.full_name)}`,
    `Current role: ${sanitizeForPrompt(candidate.current_title ?? "unknown")} at ${sanitizeForPrompt(candidate.current_company ?? "unknown")}`,
    candidate.years_experience ? `Experience: ${candidate.years_experience} years` : null,
    candidate.location         ? `Location: ${sanitizeForPrompt(candidate.location)}` : null,
    skillList                  ? `Key skills: ${skillList}` : null,
    candidate.summary          ? `Bio: ${sanitizeForPrompt(candidate.summary)}` : null,
    safeContext                ? `Role context (confidential): ${safeContext}` : null,
    `Tone: ${toneGuide}`,
    `Recruiter name for sign-off: ${recruiterName}`,
  ].filter(Boolean).join("\n");

  try {
    const draft = await callClaude(
      SYSTEM,
      [{ role: "user", content: userMsg }],
      800,
      { agencyId: ctx.agencyId, userId: ctx.userId, operation: "candidate_outreach" }
    );
    return NextResponse.json({ draft });
  } catch (err) {
    if (err instanceof AiRateLimitError) {
      return NextResponse.json(
        { error: "AI daily cost limit reached", retryAfter: "24h" },
        { status: 429 }
      );
    }
    console.error("[ai/outreach]", err);
    return NextResponse.json({ error: "Generation failed" }, { status: 502 });
  }
}
