/**
 * POST /api/ai/interview-prep
 * US-485: AI Interview Prep Question Generator.
 *
 * Given a candidate profile + job description (via pipeline entry IDs),
 * generates tailored interview questions across key competency categories.
 * Questions are grounded in the candidate's actual background.
 *
 * Body: { candidateId: string; jobId?: string }
 * Response: {
 *   sections: Array<{
 *     category: string;
 *     questions: Array<{ question: string; rationale: string }>;
 *   }>;
 *   candidateName: string;
 *   jobTitle: string | null;
 * }
 */

import { NextRequest, NextResponse }   from "next/server";
import { createClient }                 from "@/lib/supabase/server";
import { getAgencyContext }             from "@/lib/supabase/agency-cache";
import { checkCsrf }                    from "@/lib/csrf";
import { getAIClient }                  from "@/lib/ai/client";
import { requirePlan }                  from "@/lib/api/require-plan";
import { sanitizeForPrompt }            from "@/lib/ai/sanitize";

export async function POST(req: NextRequest) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const ctx      = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // US-499: plan gate — interview-prep is a Pro feature.
  const planGuard = await requirePlan(supabase, ctx.agencyId, "stage_prep_library");
  if (planGuard) return planGuard;

  const body = await req.json().catch(() => ({}));
  const { candidateId, jobId } = body as { candidateId?: string; jobId?: string };

  if (!candidateId) {
    return NextResponse.json({ error: "candidateId is required" }, { status: 400 });
  }

  // Fetch candidate
  const { data: candidate } = await supabase
    .from("candidates")
    .select("id, first_name, last_name, current_title, current_company, skills, summary, work_experience")
    .eq("id", candidateId)
    .eq("agency_id", ctx.agencyId)
    .single();

  if (!candidate) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });

  // Fetch job if provided
  let jobTitle: string | null = null;
  let jobDescription: string | null = null;
  let jobRequirements: string | null = null;

  if (jobId) {
    const { data: job } = await supabase
      .from("jobs")
      .select("title, description, requirements, location, salary_min, salary_max")
      .eq("id", jobId)
      .eq("agency_id", ctx.agencyId)
      .single();

    if (job) {
      jobTitle       = job.title;
      jobDescription = job.description;
      jobRequirements = job.requirements;
    }
  }

  const candidateName = `${candidate.first_name} ${candidate.last_name}`;
  const skillsList    = (candidate.skills ?? []).join(", ");

  // US-502: sanitize every free-text field destined for the Claude prompt.
  const safeCandName   = sanitizeForPrompt(candidateName);
  const safeTitle      = sanitizeForPrompt(candidate.current_title ?? "Not specified");
  const safeCompany    = sanitizeForPrompt(candidate.current_company ?? "Not specified");
  const safeSkills     = sanitizeForPrompt(skillsList || "Not specified");
  const safeSummary    = sanitizeForPrompt(candidate.summary ?? "", { maxLen: 1200 });
  const safeJobTitle   = sanitizeForPrompt(jobTitle ?? "");
  const safeJobDesc    = sanitizeForPrompt(jobDescription ?? "", { maxLen: 2000 });
  const safeJobReqs    = sanitizeForPrompt(jobRequirements ?? "", { maxLen: 1500 });

  const prompt = `You are a senior recruiting expert generating tailored interview questions.

CANDIDATE: ${safeCandName}
Current role: ${safeTitle} at ${safeCompany}
Skills: ${safeSkills}
${safeSummary ? `Summary: ${safeSummary}` : ""}

${safeJobTitle ? `ROLE BEING INTERVIEWED FOR: ${safeJobTitle}` : "GENERAL INTERVIEW (no specific role)"}
${safeJobDesc ? `Job description: ${safeJobDesc}` : ""}
${safeJobReqs ? `Requirements: ${safeJobReqs}` : ""}

Generate interview questions in exactly 4 categories:
1. Role Fit & Motivation (2-3 questions grounded in their background and this role)
2. Technical / Domain Expertise (3 questions testing depth in their skill areas)
3. Behavioural / Situational (3 STAR-format questions tied to common challenges in this type of role)
4. Culture & Working Style (2 questions)

For each question also provide a brief rationale (1 sentence) explaining why it's relevant to this specific candidate.

Respond in JSON only — no markdown fences:
{
  "sections": [
    {
      "category": "string",
      "questions": [
        { "question": "string", "rationale": "string" }
      ]
    }
  ]
}`;

  try {
    const ai = getAIClient({ userId: ctx.userId, agencyId: ctx.agencyId });
    const message = await ai.messages.create({
      model:      "claude-opus-4-6",
      max_tokens: 2048,
      messages:   [{ role: "user", content: prompt }],
    });

    const raw  = (message.content[0] as { text: string }).text.trim();
    const cleaned = raw.replace(/^```json\n?|```$/g, "");

    // US-504: parse defensively so a malformed model response becomes a
    // structured 502 rather than an unhandled SyntaxError.
    let json: { sections?: unknown };
    try {
      json = JSON.parse(cleaned);
    } catch {
      console.error("[interview-prep] model returned non-JSON:", cleaned.slice(0, 200));
      return NextResponse.json(
        { error: "AI returned malformed output — try again" },
        { status: 502 }
      );
    }

    if (!Array.isArray(json?.sections)) {
      return NextResponse.json(
        { error: "AI returned unexpected shape — try again" },
        { status: 502 }
      );
    }

    return NextResponse.json({
      sections:      json.sections,
      candidateName,
      jobTitle,
    });
  } catch (e) {
    console.error("[interview-prep] AI error", e);
    return NextResponse.json({ error: "Failed to generate questions" }, { status: 500 });
  }
}
