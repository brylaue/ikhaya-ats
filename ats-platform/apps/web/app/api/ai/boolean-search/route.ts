/**
 * POST /api/ai/boolean-search
 * US-383: AI Boolean Search Generator — NL → Boolean string.
 *
 * Accepts a plain-English description of a candidate/search requirement,
 * returns a structured LinkedIn/ATS-compatible Boolean string plus a
 * clause-by-clause explanation.
 *
 * Body: { description: string; platform?: "linkedin" | "generic" }
 * Returns: { boolean: string; clauses: BooleanClause[]; tips: string[] }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@/lib/supabase/server";
import { getAgencyContext }          from "@/lib/supabase/agency-cache";
import { callClaude, AiRateLimitError } from "@/lib/ai/client";
import { checkCsrf }                 from "@/lib/csrf";
import { requirePlan }               from "@/lib/api/require-plan";
import { sanitizeForPrompt }         from "@/lib/ai/sanitize";

export interface BooleanClause {
  clause:       string;   // e.g. `("machine learning" OR "ML")`
  explanation:  string;   // plain-English reason this clause was included
}

export interface BooleanSearchResult {
  boolean:  string;           // Full assembled Boolean string
  clauses:  BooleanClause[];  // Clause-by-clause breakdown
  tips:     string[];         // 1–3 tips for refining the search
}

const SYSTEM = `You are an expert Boolean search specialist for executive recruiting.
Given a plain-English description of the ideal candidate, generate a precise Boolean search string
suitable for LinkedIn Recruiter or similar ATS/sourcing platforms.

Return ONLY valid JSON in this exact shape — no markdown fences, no extra keys:
{
  "boolean": string,        // Complete Boolean string ready to paste into a search bar
  "clauses": [
    { "clause": string, "explanation": string }
  ],
  "tips": string[]          // 1–3 short tips for refining the search further
}

Boolean syntax rules:
- Use AND, OR, NOT (uppercase)
- Use double quotes for exact phrases: "machine learning"
- Use parentheses to group OR alternatives: ("JavaScript" OR "TypeScript" OR "JS")
- NOT to exclude: NOT "visa sponsorship"
- title: operator for LinkedIn title searches when appropriate: title:("Software Engineer")
- Keep the string practical — 200 chars max on most platforms
- Do NOT include personal demographics, protected characteristics, or illegal screening criteria

Focus the Boolean on skills, titles, industries, seniority signals, and company types.`;

export async function POST(req: NextRequest) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const ctx      = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // US-499 / US-514: granular plan gate — ai_boolean_search has its own key.
  const planGuard = await requirePlan(supabase, ctx.agencyId, "ai_boolean_search");
  if (planGuard) return planGuard;

  const body = await req.json().catch(() => ({}));
  const { description, platform = "linkedin" } = body as { description?: string; platform?: string };

  if (!description || description.trim().length < 5) {
    return NextResponse.json({ error: "description is required (min 5 characters)" }, { status: 400 });
  }

  // US-502: sanitize NL input before sending to the model.
  const safeDesc     = sanitizeForPrompt(description.trim(), { maxLen: 2000 });
  const safePlatform = sanitizeForPrompt(platform, { maxLen: 32 });
  const userMsg      = `Platform: ${safePlatform}\nSearch description: ${safeDesc}`;

  try {
    const raw = await callClaude(
      SYSTEM,
      [{ role: "user", content: userMsg }],
      1024,
      { agencyId: ctx.agencyId, userId: ctx.userId, operation: "boolean_search" }
    );

    // US-504: parse defensively — malformed model output → 502, not a 500.
    const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    let result: BooleanSearchResult;
    try {
      result = JSON.parse(cleaned) as BooleanSearchResult;
    } catch {
      console.error("[ai/boolean-search] model returned non-JSON:", cleaned.slice(0, 200));
      return NextResponse.json(
        { error: "AI returned malformed output — try again" },
        { status: 502 }
      );
    }

    if (typeof result.boolean !== "string" || !Array.isArray(result.clauses)) {
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
    console.error("[ai/boolean-search]", err);
    return NextResponse.json({ error: "Generation failed" }, { status: 502 });
  }
}
