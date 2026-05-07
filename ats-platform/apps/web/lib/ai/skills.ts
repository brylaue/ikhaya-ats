/**
 * Skill normalisation helpers (US-381).
 *
 * Two entry points:
 *   - `normaliseSkills(agencyId, raws, supabase)` — pure DB lookup, no LLM.
 *     Returns { canonical, removed, unknownTerms } where `unknownTerms` is
 *     any raw that wasn't found in the taxonomy.
 *   - `normaliseSkillsWithFallback(...)` — runs the DB lookup first, then
 *     falls back to Claude for the subset of unknown terms. Claude's output
 *     for each term is persisted back as an agency-scoped taxonomy row so
 *     subsequent saves are cache hits.
 *
 * The DB-only path is synchronous-ish (one SELECT with an IN clause over a
 * GIN-indexed aliases column) and safe to call on every candidate save.
 * The LLM fallback is deliberately opt-in — callers (e.g., the existing
 * `/api/candidates/[id]/normalize-skills` route) decide when to pay the
 * cost.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { callClaude, AiRateLimitError } from "@/lib/ai/client";

export interface NormaliseResult {
  canonical:    string[];
  removed:      string[];        // duplicates collapsed during normalisation
  unknownTerms: string[];        // raw terms not found in the taxonomy
  /** Parallel to `canonical`: each entry's category or null. */
  categories:   Array<string | null>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any, any, any, any, any>;

function normaliseLookupKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Pure DB normalisation. Does NOT call any LLM.
 * Returns canonical form where found, original term otherwise (kept in
 * `unknownTerms` so the caller can decide whether to pay for LLM expansion).
 */
export async function normaliseSkills(
  agencyId: string,
  raws:     string[],
  supabase: AnySupabase,
): Promise<NormaliseResult> {
  const cleaned = raws
    .map((r) => (typeof r === "string" ? r.trim() : ""))
    .filter((r) => r.length > 0);
  const uniqueLowerRaws = Array.from(new Set(cleaned.map(normaliseLookupKey)));

  if (uniqueLowerRaws.length === 0) {
    return { canonical: [], removed: [], unknownTerms: [], categories: [] };
  }

  // Fetch taxonomy rows where the lowered raw matches either the canonical
  // lowercase or an alias. We do two queries — one for agency-scoped rows
  // (override) and one for globals — and merge with agency precedence.
  const { data: agencyRows } = await supabase
    .from("skill_taxonomy")
    .select("canonical_name, aliases, category")
    .eq("agency_id", agencyId)
    .overlaps("aliases", uniqueLowerRaws);

  const { data: globalRows } = await supabase
    .from("skill_taxonomy")
    .select("canonical_name, aliases, category")
    .is("agency_id", null)
    .overlaps("aliases", uniqueLowerRaws);

  // Also fetch rows by exact canonical match (in case the raw is already
  // canonical and has no alias entry)
  const { data: agencyCanon } = await supabase
    .from("skill_taxonomy")
    .select("canonical_name, aliases, category")
    .eq("agency_id", agencyId)
    .in("canonical_name", cleaned);

  const { data: globalCanon } = await supabase
    .from("skill_taxonomy")
    .select("canonical_name, aliases, category")
    .is("agency_id", null)
    .in("canonical_name", cleaned);

  // Build lookup: lowered-raw → { canonical, category, source }.
  // Agency entries take precedence over global.
  type Entry = { canonical: string; category: string | null };
  const byAlias = new Map<string, Entry>();

  const addRows = (
    rows: Array<{ canonical_name: string; aliases: string[] | null; category: string | null }>,
    override: boolean,
  ) => {
    for (const row of rows ?? []) {
      const entry: Entry = { canonical: row.canonical_name, category: row.category };
      // Alias hits
      for (const alias of row.aliases ?? []) {
        const key = normaliseLookupKey(alias);
        if (override || !byAlias.has(key)) byAlias.set(key, entry);
      }
      // Canonical itself (case-insensitive)
      const canKey = normaliseLookupKey(row.canonical_name);
      if (override || !byAlias.has(canKey)) byAlias.set(canKey, entry);
    }
  };

  addRows(globalRows ?? [], false);
  addRows(globalCanon ?? [], false);
  addRows(agencyRows ?? [], true);  // agency overrides global
  addRows(agencyCanon ?? [], true);

  // Walk the original (deduped) raws → produce canonical list
  const seenCanonical = new Set<string>();
  const canonical:  string[]             = [];
  const categories: Array<string | null> = [];
  const removed:    string[]             = [];
  const unknown:    string[]             = [];

  // De-dupe on canonical so ["js", "javascript", "JS"] → ["JavaScript"] once.
  for (const raw of cleaned) {
    const hit = byAlias.get(normaliseLookupKey(raw));
    if (hit) {
      if (seenCanonical.has(hit.canonical)) {
        removed.push(raw);
        continue;
      }
      seenCanonical.add(hit.canonical);
      canonical.push(hit.canonical);
      categories.push(hit.category);
    } else {
      // Preserve raw casing but still de-dupe by lower-case
      const rawKey = normaliseLookupKey(raw);
      if (seenCanonical.has(rawKey)) {
        removed.push(raw);
        continue;
      }
      seenCanonical.add(rawKey);
      canonical.push(raw);
      categories.push(null);
      unknown.push(raw);
    }
  }

  return { canonical, removed, unknownTerms: unknown, categories };
}

/**
 * Full normalisation: DB lookup + Claude fallback for unknown terms.
 * On LLM success the new mappings are written back as agency-scoped rows
 * so future saves are cache hits.
 */
export async function normaliseSkillsWithFallback(params: {
  agencyId: string;
  userId?:  string;
  raws:     string[];
  supabase: AnySupabase;
}): Promise<NormaliseResult & { fallbackUsed: boolean }> {
  const { agencyId, userId, raws, supabase } = params;

  const firstPass = await normaliseSkills(agencyId, raws, supabase);
  if (firstPass.unknownTerms.length === 0) {
    return { ...firstPass, fallbackUsed: false };
  }

  // Ask Claude to return canonical forms + category for the unknowns.
  // Very short prompt to keep cost minimal — this is the only LLM call.
  const system = `You are a recruiting skill normaliser. For each raw skill given,
return ONLY valid JSON — an array of objects:
[{"raw": string, "canonical": string, "category": string}]
Rules:
- canonical: canonical proper-cased skill name (e.g. "JavaScript" not "js")
- category: one of Languages | Frameworks | Cloud & Infra | Data | Data & AI | APIs | Tools | Methodologies | Other
- If the term is not a real technical/professional skill, set canonical to "" (empty string).`;

  let mappings: Array<{ raw: string; canonical: string; category: string }> = [];
  try {
    const raw = await callClaude(
      system,
      [{ role: "user", content: `Skills:\n${firstPass.unknownTerms.join("\n")}` }],
      512,
      { agencyId, userId, operation: "skill_normalise_fallback" },
    );
    const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    mappings = JSON.parse(cleaned);
    if (!Array.isArray(mappings)) mappings = [];
  } catch (err) {
    if (err instanceof AiRateLimitError) throw err;
    console.warn("[normaliseSkillsWithFallback] LLM call failed:", err);
    return { ...firstPass, fallbackUsed: false };
  }

  // Persist mappings as agency-scoped taxonomy rows (ignore conflicts)
  const rowsToInsert = mappings
    .filter((m) => m.raw && m.canonical && m.canonical.trim().length > 0)
    .map((m) => ({
      agency_id:      agencyId,
      canonical_name: m.canonical,
      aliases:        [normaliseLookupKey(m.raw)],
      category:       m.category || null,
    }));

  if (rowsToInsert.length > 0) {
    // onConflict → do nothing (unique index on agency + slug)
    await supabase
      .from("skill_taxonomy")
      .upsert(rowsToInsert, { onConflict: "agency_id,canonical_slug", ignoreDuplicates: true });
  }

  // Replay normalisation so unknowns are now resolved
  const second = await normaliseSkills(agencyId, raws, supabase);
  return { ...second, fallbackUsed: true };
}
