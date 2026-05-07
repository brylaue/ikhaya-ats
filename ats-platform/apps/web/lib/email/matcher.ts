/**
 * Email-to-candidate matcher.
 *
 * Strategies (applied in order):
 *   1. Thread linking — if any message in the same thread is already linked to a candidate
 *   2. Exact match — email addresses on the candidate record match message participants
 *   3. Alt-domain match — gmail.com ↔ googlemail.com
 *   4. Fuzzy match — token-set similarity on local-part vs first+last name (free providers only)
 *
 * Stage 9 additions: matchThread, matchFuzzy, conflict detection.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import type { FullMessage, MessageRef, MatchStrategy, MatchStatus } from "@/types/email/provider";
import type { Database } from "@/types/supabase";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MatchResult {
  candidateId: string;
  strategy: MatchStrategy;
  confidence: number;
  matchedAddress: string;
  status: MatchStatus;
}

export interface FuzzyMatch {
  candidateId: string;
  candidateName: string;
  confidence: number;
  matchedAddress: string;
}

// ─── Config ──────────────────────────────────────────────────────────────────

/** Minimum token-set similarity score to surface a fuzzy match for review. */
const EMAIL_FUZZY_MATCH_FLOOR = parseFloat(
  process.env.EMAIL_FUZZY_MATCH_FLOOR ?? "0.65"
);

/** Free email providers where fuzzy matching is attempted (local-part is user-chosen). */
const FREE_PROVIDER_ALLOWLIST = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "hotmail.com",
  "hotmail.co.uk",
  "outlook.com",
  "live.com",
  "aol.com",
  "icloud.com",
  "me.com",
  "mail.com",
  "protonmail.com",
  "proton.me",
  "zoho.com",
  "yandex.com",
  "gmx.com",
  "gmx.net",
]);

// Domain aliases (e.g., gmail <-> googlemail)
const DOMAIN_ALIASES: Record<string, string> = {
  "gmail.com": "googlemail.com",
  "googlemail.com": "gmail.com",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeEmail(email: string): string {
  const lower = email.toLowerCase().trim();
  return lower.replace(/\s+/g, "");
}

function getNormalisedDomain(email: string): string {
  const domain = email.split("@")[1] || "";
  return DOMAIN_ALIASES[domain] || domain;
}

/**
 * Token-set similarity between two strings.
 *
 * Tokenises both inputs (split on non-alphanum, lowercased), then computes:
 *   |intersection| / |union|
 *
 * This is Jaccard similarity on token sets — robust to reordering
 * (e.g. "john.smith" vs "smith john") and partial overlap.
 */
export function tokenSetSimilarity(a: string, b: string): number {
  const tokenize = (s: string): Set<string> =>
    new Set(
      s
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length > 0)
    );

  const setA = tokenize(a);
  const setB = tokenize(b);

  if (setA.size === 0 && setB.size === 0) return 0;

  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Extract the local part of an email, stripping +tags and dots for free providers.
 */
function extractLocalTokens(email: string): string {
  const normalized = normalizeEmail(email);
  const atIdx = normalized.lastIndexOf("@");
  if (atIdx === -1) return normalized;

  let local = normalized.slice(0, atIdx);
  const domain = normalized.slice(atIdx + 1);

  // Strip +tag
  const plusIdx = local.indexOf("+");
  if (plusIdx !== -1) local = local.slice(0, plusIdx);

  // For free providers, dots are non-significant separators — keep as token delimiters
  if (FREE_PROVIDER_ALLOWLIST.has(domain)) {
    local = local.replace(/\./g, " ");
  } else {
    local = local.replace(/\./g, " ");
  }

  return local;
}

// ─── Thread Matching ─────────────────────────────────────────────────────────

/**
 * Check if any message in this thread is already linked to a candidate.
 *
 * If the thread has links to >1 different candidate, returns null and flags
 * the thread as conflicted.
 *
 * @returns candidateId if unambiguous, null otherwise.
 */
export async function matchThread(
  supabase: SupabaseClient<Database>,
  agencyId: string,
  threadId: string
): Promise<{ candidateId: string | null; hasConflict: boolean }> {
  if (!threadId) return { candidateId: null, hasConflict: false };

  // Find all active links for messages in this thread
  const { data: links, error } = await supabase
    .from("candidate_email_links")
    .select("candidate_id, email_messages!inner(thread_id)")
    .eq("email_messages.thread_id", threadId)
    .in("status", ["active"])
    .limit(100);

  if (error || !links || links.length === 0) {
    return { candidateId: null, hasConflict: false };
  }

  // Collect unique candidate IDs
  const candidateIds = new Set<string>();
  for (const link of links) {
    candidateIds.add((link as any).candidate_id);
  }

  if (candidateIds.size === 1) {
    return { candidateId: Array.from(candidateIds)[0], hasConflict: false };
  }

  // Multiple candidates on this thread → conflict
  // Flag the thread
  await supabase
    .from("email_threads")
    .update({ has_conflict: true })
    .eq("provider_thread_id", threadId);

  return { candidateId: null, hasConflict: true };
}

// ─── Fuzzy Matching ──────────────────────────────────────────────────────────

/**
 * Fuzzy-match a message's participants against the candidate pool.
 *
 * Only applied to addresses from free email providers (where the local part
 * is user-chosen and likely contains name tokens). Results are returned with
 * status='pending_review' — they must be confirmed before appearing on timelines.
 *
 * @returns Array of fuzzy matches above EMAIL_FUZZY_MATCH_FLOOR
 */
export async function matchFuzzy(
  supabase: SupabaseClient<Database>,
  agencyId: string,
  addresses: string[],
  excludeCandidateIds: Set<string> = new Set()
): Promise<FuzzyMatch[]> {
  const results: FuzzyMatch[] = [];

  // Only try fuzzy on free-provider addresses
  const freeAddresses = addresses.filter((addr) => {
    const domain = normalizeEmail(addr).split("@")[1];
    return domain && FREE_PROVIDER_ALLOWLIST.has(domain);
  });

  if (freeAddresses.length === 0) return results;

  // Check rejection table to avoid re-suggesting rejected pairs
  const { data: rejections } = await supabase
    .from("email_match_rejections")
    .select("candidate_id, rejected_address")
    .in(
      "rejected_address",
      freeAddresses.map((a) => normalizeEmail(a))
    );

  const rejectedPairs = new Set(
    (rejections ?? []).map(
      (r: any) => `${r.candidate_id}:${r.rejected_address}`
    )
  );

  // Load all candidates for this agency (paginated for large pools)
  const { data: candidates, error } = await supabase
    .from("candidates")
    .select("id, first_name, last_name")
    .eq("agency_id", agencyId)
    .limit(2000);

  if (error || !candidates) return results;

  for (const addr of freeAddresses) {
    const localTokens = extractLocalTokens(addr);
    const normalizedAddr = normalizeEmail(addr);

    for (const cand of candidates) {
      if (excludeCandidateIds.has(cand.id)) continue;

      const key = `${cand.id}:${normalizedAddr}`;
      if (rejectedPairs.has(key)) continue;

      const candName = `${cand.first_name ?? ""} ${cand.last_name ?? ""}`.trim();
      if (!candName) continue;

      const similarity = tokenSetSimilarity(localTokens, candName);

      if (similarity >= EMAIL_FUZZY_MATCH_FLOOR) {
        // Only add if not already present with higher confidence
        const existing = results.find(
          (r) => r.candidateId === cand.id && r.matchedAddress === addr
        );
        if (!existing || existing.confidence < similarity) {
          if (existing) {
            existing.confidence = similarity;
          } else {
            results.push({
              candidateId: cand.id,
              candidateName: candName,
              confidence: Math.round(similarity * 100) / 100,
              matchedAddress: addr,
            });
          }
        }
      }
    }
  }

  // Sort by confidence descending
  results.sort((a, b) => b.confidence - a.confidence);
  return results;
}

// ─── Core Matching Pipeline ──────────────────────────────────────────────────

async function matchMessage(
  supabase: SupabaseClient<Database>,
  agencyId: string,
  msg: FullMessage
): Promise<MatchResult[]> {
  const matches: MatchResult[] = [];

  // Collect all addresses from the message
  const allAddresses = [
    msg.from,
    ...msg.to,
    ...msg.cc,
    ...msg.bcc,
  ].filter(Boolean);

  if (allAddresses.length === 0) return matches;

  // ── Strategy 0: Thread linking ──
  if (msg.providerThreadId) {
    const threadResult = await matchThread(
      supabase,
      agencyId,
      msg.providerThreadId
    );
    if (threadResult.candidateId) {
      matches.push({
        candidateId: threadResult.candidateId,
        strategy: "thread",
        confidence: 0.9,
        matchedAddress: msg.from,
        status: "active",
      });
      // Thread match is high-priority — return immediately
      return matches;
    }
    // If conflict detected, fall through to exact-only (no fuzzy)
    if (threadResult.hasConflict) {
      // Only do exact matching for conflicted threads
      return matchExactOnly(supabase, agencyId, allAddresses);
    }
  }

  // ── Strategy 1: Exact match ──
  for (const addr of allAddresses) {
    const normalized = normalizeEmail(addr);

    const { data: candidates } = await supabase
      .from("candidates")
      .select("id")
      .eq("agency_id", agencyId)
      .or(
        `email.eq.${normalized},alt_email.eq.${normalized}`
      )
      .limit(10);

    if (candidates) {
      for (const cand of candidates) {
        matches.push({
          candidateId: cand.id,
          strategy: "exact",
          confidence: 1.0,
          matchedAddress: addr,
          status: "active",
        });
      }
    }
  }

  // ── Strategy 2: Alt-domain matching ──
  for (const addr of allAddresses) {
    const normalized = normalizeEmail(addr);
    const [local, domain] = normalized.split("@");
    if (!local || !domain) continue;

    const altDomain = getNormalisedDomain(addr);
    if (altDomain === domain) continue;

    const altEmail = `${local}@${altDomain}`;

    const { data: candidates } = await supabase
      .from("candidates")
      .select("id")
      .eq("agency_id", agencyId)
      .or(`email.eq.${altEmail},alt_email.eq.${altEmail}`)
      .limit(10);

    if (candidates) {
      for (const cand of candidates) {
        if (!matches.some((m) => m.candidateId === cand.id)) {
          matches.push({
            candidateId: cand.id,
            strategy: "alt",
            confidence: 0.95,
            matchedAddress: addr,
            status: "active",
          });
        }
      }
    }
  }

  // ── Strategy 3: Fuzzy match (free providers only) ──
  const exactCandidateIds = new Set(matches.map((m) => m.candidateId));
  const fuzzyResults = await matchFuzzy(
    supabase,
    agencyId,
    allAddresses,
    exactCandidateIds
  );

  for (const fuzzy of fuzzyResults) {
    matches.push({
      candidateId: fuzzy.candidateId,
      strategy: "fuzzy",
      confidence: fuzzy.confidence,
      matchedAddress: fuzzy.matchedAddress,
      status: "pending_review", // Fuzzy matches require human confirmation
    });
  }

  // Remove duplicates, keeping highest confidence
  const deduped = new Map<string, MatchResult>();
  for (const match of matches) {
    const key = match.candidateId;
    const existing = deduped.get(key);
    if (!existing || match.confidence > existing.confidence) {
      deduped.set(key, match);
    }
  }

  return Array.from(deduped.values());
}

/**
 * Exact-only matching — used for conflicted threads where we don't want
 * to add more fuzzy ambiguity.
 */
async function matchExactOnly(
  supabase: SupabaseClient<Database>,
  agencyId: string,
  addresses: string[]
): Promise<MatchResult[]> {
  const matches: MatchResult[] = [];

  for (const addr of addresses) {
    const normalized = normalizeEmail(addr);

    const { data: candidates } = await supabase
      .from("candidates")
      .select("id")
      .eq("agency_id", agencyId)
      .or(`email.eq.${normalized},alt_email.eq.${normalized}`)
      .limit(10);

    if (candidates) {
      for (const cand of candidates) {
        if (!matches.some((m) => m.candidateId === cand.id)) {
          matches.push({
            candidateId: cand.id,
            strategy: "exact",
            confidence: 1.0,
            matchedAddress: addr,
            status: "active",
          });
        }
      }
    }
  }

  return matches;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function matchMessageAndLink(
  supabase: SupabaseClient<Database>,
  agencyId: string,
  userId: string,
  msg: FullMessage,
  messageDbId: string
): Promise<MatchResult[]> {
  const matches = await matchMessage(supabase, agencyId, msg);

  // Insert matches into candidate_email_links
  for (const match of matches) {
    // Check if already linked
    const { data: existing } = await supabase
      .from("candidate_email_links")
      .select("id")
      .eq("candidate_id", match.candidateId)
      .eq("message_id", messageDbId)
      .single();

    if (!existing) {
      await supabase.from("candidate_email_links").insert({
        candidate_id: match.candidateId,
        message_id: messageDbId,
        match_strategy: match.strategy,
        match_confidence: match.confidence,
        matched_address: match.matchedAddress,
        status: match.status,
      });
    }
  }

  return matches;
}
