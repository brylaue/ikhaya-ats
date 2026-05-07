/**
 * POST /api/candidates/[id]/normalize-skills
 * US-381: AI skill normalisation & auto-tag engine.
 *
 * Sends the candidate's raw skills array to Claude for canonical normalisation:
 * - Deduplicates variants ("JavaScript" / "JS" / "Javascript" → "JavaScript")
 * - Expands abbreviations to full names ("ML" → "Machine Learning")
 * - Groups into categories (Languages, Frameworks, Cloud, etc.)
 * - Auto-suggests relevant tags based on skill clusters
 *
 * Then upserts canonical skills into the `candidate_skills` table by
 * matching against the global `skills` taxonomy, creating new skill
 * records as needed.
 *
 * Body: {} (reads skills from DB)
 * Returns: { normalised: NormalisedSkillResult; updated: boolean }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@/lib/supabase/server";
import { createClient as svc }       from "@supabase/supabase-js";
import { callClaude, AiRateLimitError } from "@/lib/ai/client";
import { checkCsrf }                 from "@/lib/csrf";
import { normaliseSkills }           from "@/lib/ai/skills";
import { recordAiDecision, describeDecision } from "@/lib/ai/decision-log";
import { getAgencyContext }          from "@/lib/supabase/agency-cache";
import { requirePlan }               from "@/lib/api/require-plan";
import { sanitizeForPrompt }         from "@/lib/ai/sanitize";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export interface SkillGroup {
  category: string;
  skills:   string[];
}

export interface NormalisedSkillResult {
  canonical: string[];         // Deduplicated, properly cased skill list
  grouped:   SkillGroup[];     // Skills organised by category
  suggestedTags: string[];     // Tag names to auto-apply
  removed:   string[];         // Skills removed (duplicates/variants)
}

const CLAUDE_SYSTEM = `You are a technical skill normaliser for a recruiting database.
Given a raw list of skills, return ONLY valid JSON with this exact shape:
{
  "canonical": string[],          // Deduplicated, properly cased canonical skill names
  "grouped": [
    { "category": "Languages",    "skills": [...] },
    { "category": "Frameworks",   "skills": [...] },
    { "category": "Cloud & Infra","skills": [...] },
    { "category": "Data & AI",    "skills": [...] },
    { "category": "Tools & Platforms", "skills": [...] },
    { "category": "Methodologies","skills": [...] }
  ],
  "suggestedTags": string[],      // 1-5 broad role tags like "Frontend", "Backend", "ML Engineer"
  "removed": string[]             // Skills removed (exact duplicates or merged variants)
}
Rules:
- Always use the full canonical name: "JavaScript" not "JS", "TypeScript" not "TS", "Machine Learning" not "ML"
- Keep only real technical/professional skills, remove soft skills
- Omit empty categories from grouped
- suggestedTags should reflect the candidate's primary technical identity`;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const ctx      = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // US-499 / US-514: granular plan gate — ai_skill_normalise has its own key.
  const planGuard = await requirePlan(supabase, ctx.agencyId, "ai_skill_normalise");
  if (planGuard) return planGuard;

  const { id } = await params;

  // Fetch candidate and their current skills (agency-scoped so cross-tenant
  // IDs return 404 rather than leaking into the prompt)
  const { data: candidate } = await supabase
    .from("candidates")
    .select("id, agency_id, skills, full_name")
    .eq("id", id)
    .eq("agency_id", ctx.agencyId)
    .maybeSingle();

  if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rawSkills = (candidate.skills ?? []) as string[];
  if (rawSkills.length === 0) {
    return NextResponse.json({ normalised: { canonical: [], grouped: [], suggestedTags: [], removed: [] }, updated: false });
  }

  // US-381: Try the local taxonomy first — most known skills resolve
  // without an LLM call, keeping per-candidate cost under a cent.
  const local = await normaliseSkills(candidate.agency_id, rawSkills, supabase);

  // If every input was a clean hit we skip Claude entirely — just return
  // the DB-normalised form with basic category grouping. Suggested tags
  // still require LLM judgement so we only offer them when we go to Claude.
  if (local.unknownTerms.length === 0) {
    const groupedMap = new Map<string, string[]>();
    local.canonical.forEach((skill, i) => {
      const cat = local.categories[i] ?? "Other";
      const arr = groupedMap.get(cat) ?? [];
      arr.push(skill);
      groupedMap.set(cat, arr);
    });
    const grouped: SkillGroup[] = Array.from(groupedMap.entries()).map(([category, skills]) => ({
      category, skills,
    }));

    let updatedLocal = false;
    if (local.canonical.length > 0) {
      const { error } = await supabase
        .from("candidates")
        .update({ skills: local.canonical })
        .eq("id", id);
      updatedLocal = !error;
    }

    // Audit for consistency with the LLM path
    const dbAudit = svc(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
    await dbAudit.from("audit_events").insert({
      actor_id:  ctx.userId,
      action:    "candidate.skills_normalised",
      resource:  `candidate:${id}`,
      metadata:  {
        raw_count:       rawSkills.length,
        canonical_count: local.canonical.length,
        removed_count:   local.removed.length,
        source:          "taxonomy_only",
      },
    }).maybeSingle();

    if (updatedLocal) {
      await dbAudit.from("embedding_jobs").upsert({
        entity_type: "candidates",
        entity_id:   id,
        status:      "pending",
        queued_at:   new Date().toISOString(),
      }, { onConflict: "entity_type,entity_id" });
    }

    return NextResponse.json({
      normalised: {
        canonical:     local.canonical,
        grouped,
        suggestedTags: [],            // LLM-generated only
        removed:       local.removed,
      },
      updated: updatedLocal,
      source:  "taxonomy",
    });
  }

  // US-502: sanitize name + skills before sending to the model. A candidate
  // record edited by a user could contain injection phrases in either field.
  const safeName   = sanitizeForPrompt(candidate.full_name ?? "candidate", { maxLen: 128 });
  const safeSkills = sanitizeForPrompt(rawSkills.join(", "), { maxLen: 4000 });

  // Call Claude for normalisation
  let normalised: NormalisedSkillResult;
  try {
    const raw = await callClaude(
      CLAUDE_SYSTEM,
      [{ role: "user", content: `Raw skills for ${safeName}:\n${safeSkills}` }],
      1024,
      { agencyId: candidate.agency_id, userId: ctx.userId, operation: "skill_normalize" }
    );

    // US-504: defensive JSON.parse — malformed model output → structured 502.
    const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    try {
      normalised = JSON.parse(cleaned) as NormalisedSkillResult;
    } catch {
      console.error("[normalize-skills] model returned non-JSON:", cleaned.slice(0, 200));
      return NextResponse.json(
        { error: "AI returned malformed output — try again" },
        { status: 502 }
      );
    }

    if (!Array.isArray(normalised.canonical) || !Array.isArray(normalised.grouped)) {
      return NextResponse.json(
        { error: "AI returned unexpected shape — try again" },
        { status: 502 }
      );
    }
  } catch (err) {
    if (err instanceof AiRateLimitError) {
      return NextResponse.json(
        { error: "AI daily cost limit reached", retryAfter: "24h" },
        { status: 429 }
      );
    }
    console.error("[normalize-skills] Claude call failed:", err);
    return NextResponse.json({ error: "AI normalisation failed" }, { status: 502 });
  }

  // US-327: run mutations on tenant-scoped tables through the user client so
  // RLS enforces agency isolation. Service role is reserved for the system
  // tables below (audit_events, embedding_jobs) where no per-user policy
  // applies.
  let updated = false;
  if (normalised.canonical.length > 0) {
    const { error } = await supabase
      .from("candidates")
      .update({ skills: normalised.canonical })
      .eq("id", id);
    updated = !error;
    if (error) console.error("[normalize-skills] skills update failed:", error);
  }

  // Auto-apply suggested tags (via user-scoped client → RLS guards agency_id)
  if (normalised.suggestedTags.length > 0 && candidate.agency_id) {
    for (const tagName of normalised.suggestedTags) {
      // Upsert tag
      const { data: tag } = await supabase
        .from("tags")
        .upsert({ name: tagName, agency_id: candidate.agency_id }, { onConflict: "name,agency_id" })
        .select("id")
        .single();

      if (tag?.id) {
        await supabase
          .from("candidate_tags")
          .upsert({ candidate_id: id, tag_id: tag.id }, { onConflict: "candidate_id,tag_id" })
          .maybeSingle();
      }
    }
  }

  const db = svc(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  // Audit log
  await db.from("audit_events").insert({
    actor_id:  ctx.userId,
    action:    "candidate.skills_normalised",
    resource:  `candidate:${id}`,
    metadata:  {
      raw_count:       rawSkills.length,
      canonical_count: normalised.canonical.length,
      removed_count:   normalised.removed.length,
      tags_suggested:  normalised.suggestedTags,
    },
  }).maybeSingle();

  // Queue embedding refresh since skills changed
  if (updated) {
    await db.from("embedding_jobs").upsert({
      entity_type: "candidates",
      entity_id:   id,
      status:      "pending",
      queued_at:   new Date().toISOString(),
    }, { onConflict: "entity_type,entity_id" });
  }

  // US-422: AI decision log. Skill normalisation reshapes the skills
  // array the candidate's portal displays, so it's candidate-visible.
  void recordAiDecision({
    agencyId:           candidate.agency_id,
    userId:             ctx.userId,
    type:               "skill_normalise",
    subject:            { type: "candidate", id },
    provider:           "anthropic",
    model:              "claude-sonnet-4-6",
    rationale:          describeDecision("skill_normalise"),
    inputPayload:       { rawCount: rawSkills.length, canonicalCount: normalised.canonical.length, tagsSuggested: normalised.suggestedTags },
    visibleToCandidate: true,
  });

  return NextResponse.json({ normalised, updated });
}
