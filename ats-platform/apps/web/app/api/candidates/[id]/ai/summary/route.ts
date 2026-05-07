/**
 * POST /api/candidates/[id]/ai/summary
 * US-376: Generate an executive recruiter summary for a candidate via Claude.
 *
 * Body: {} (candidate context fetched server-side)
 * Returns: { summary: string; verdict: { label: string; sub: string } }
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

const SYSTEM = `You are a senior executive recruiter writing internal candidate briefings for your colleagues.
Write a concise, opinionated executive summary (3-4 paragraphs) that covers:
1. Who this person is and what makes them stand out
2. Their communication style and how they come across to hiring managers
3. Key strengths (bold exactly as: **Key strengths:** followed by comma-separated list)
4. Watch areas — gaps, unknowns, or questions worth probing (bold as: **Watch areas:**)
5. A recruiter recommendation note (bold as: **Recruiter note:**)
Be specific, use their actual background, and avoid clichés. Write in a professional but direct editorial voice.
After the summary paragraphs, output a JSON block on a new line in this exact format:
VERDICT:{"label":"Strong candidate","sub":"Prioritise for active searches"}
Choose label from: "Strong candidate" | "Promising candidate" | "Proceed with caution" | "Not a fit"
Choose sub from: "Prioritise for active searches" | "Worth a conversation" | "Needs more vetting" | "Archive for now"`;

const FALLBACK_VERDICT = { label: "Strong candidate", sub: "Prioritise for active searches" };

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
    .select("id, agency_id, full_name, current_title, current_company, skills, location, years_experience, summary")
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
    candidate.location         ? `Location: ${sanitizeForPrompt(candidate.location)}` : null,
    skillList                  ? `Key skills: ${skillList}` : null,
    candidate.summary          ? `Bio / notes: ${sanitizeForPrompt(candidate.summary)}` : null,
  ].filter(Boolean).join("\n");

  try {
    const raw = await callClaude(
      SYSTEM,
      [{ role: "user", content: userMsg }],
      1024,
      { agencyId: ctx.agencyId, userId: ctx.userId, operation: "candidate_summary" }
    );

    // Split the VERDICT JSON from the summary text
    const verdictMatch = raw.match(/\nVERDICT:(\{.+\})/);
    const summary = verdictMatch ? raw.slice(0, verdictMatch.index).trim() : raw.trim();

    // US-504 / US-515: guard JSON.parse — malformed verdict should not crash the route
    let verdict = FALLBACK_VERDICT;
    if (verdictMatch) {
      try {
        verdict = JSON.parse(verdictMatch[1]) as { label: string; sub: string };
      } catch {
        console.warn("[ai/summary] Could not parse VERDICT JSON — using fallback");
      }
    }

    return NextResponse.json({ summary, verdict });
  } catch (err) {
    if (err instanceof AiRateLimitError) {
      return NextResponse.json(
        { error: "AI daily cost limit reached", retryAfter: "24h" },
        { status: 429 }
      );
    }
    console.error("[ai/summary]", err);
    return NextResponse.json({ error: "Generation failed" }, { status: 502 });
  }
}
