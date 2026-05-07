/**
 * Server-side helpers for persisting email messages and their candidate links.
 *
 * Wraps the email_messages + email_threads + candidate_email_links tables.
 * Called from the sync worker (backfill) and delta webhook handlers.
 *
 * Stage 6.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FullMessage, MessageRef } from "@/types/email/provider";
import type { Database } from "@/types/supabase";
import { normalizeEmail } from "@/lib/email/normalize";
import { handleInboundMessage } from "@/lib/email/bounce-detector";

// ─── Types ────────────────────────────────────────────────────────────────────

export type MatchStrategy = "exact" | "alt" | "thread" | "fuzzy";

export interface CandidateMatch {
  candidateId: string;
  strategy: MatchStrategy;
  confidence: number;
  matchedAddress: string;
}

export interface UpsertThreadInput {
  agencyId: string;
  userId: string;
  provider: "google" | "microsoft";
  providerThreadId: string;
  subject: string | null;
  snippet: string | null;
  participantAddresses: string[];
  firstMsgAt: string;
  lastMsgAt: string;
}

export interface UpsertMessageInput {
  agencyId: string;
  userId: string;
  threadId: string;
  provider: "google" | "microsoft";
  providerMessageId: string;
  internetMessageId?: string | null; // RFC 822 Message-ID for cross-provider dedup
  direction: "inbound" | "outbound";
  fromAddress: string;
  toAddresses: string[];
  ccAddresses: string[];
  bccAddresses: string[];
  subject: string | null;
  snippet: string | null;
  bodyText: string | null | undefined;
  bodyHtml: string | null | undefined;
  sentAt: string;
  hasAttachments: boolean;
}

// ─── Thread helpers ───────────────────────────────────────────────────────────

/**
 * Upsert an email thread row. Conflict key: agency_id + provider + provider_thread_id.
 * Returns the thread's internal UUID.
 */
export async function upsertThread(
  supabase: SupabaseClient<Database>,
  input: UpsertThreadInput
): Promise<string> {
  const { data, error } = await supabase
    .from("email_threads")
    .upsert(
      {
        agency_id:         input.agencyId,
        user_id:           input.userId,
        provider:          input.provider,
        provider_thread_id: input.providerThreadId,
        subject:           input.subject,
        snippet:           input.snippet,
        participant_count: input.participantAddresses.length,
        first_msg_at:      input.firstMsgAt,
        last_msg_at:       input.lastMsgAt,
      },
      { onConflict: "agency_id,provider,provider_thread_id" }
    )
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

// ─── Message helpers ──────────────────────────────────────────────────────────

/**
 * Insert an email message row.  Returns the message's internal UUID,
 * or null if the message already exists (idempotent).
 *
 * internet_message_id dedup (Stage 7): If a row with the same
 * internet_message_id already exists for this agency (possibly from
 * a different user — e.g. both sender and recipient are Ikhaya users
 * on different providers), we skip body storage (it's duplicate) and
 * return the existing row's ID. The caller is still responsible for
 * creating per-user link records.
 */
export async function insertMessage(
  supabase: SupabaseClient<Database>,
  input: UpsertMessageInput
): Promise<string | null> {
  // Check for existing row by provider_message_id (same provider, same message)
  const { data: existing } = await supabase
    .from("email_messages")
    .select("id")
    .eq("agency_id", input.agencyId)
    .eq("provider_message_id", input.providerMessageId)
    .maybeSingle();

  if (existing) return existing.id;

  // ─── internet_message_id dedup ─────────────────────────────────────
  // Check if the same logical email (by RFC 822 Message-ID) already exists
  // for this agency, possibly from a different provider or user.
  // If so, skip body storage — the message content is identical.
  if (input.internetMessageId) {
    const { data: dedupHit } = await supabase
      .from("email_messages")
      .select("id")
      .eq("agency_id", input.agencyId)
      .eq("internet_message_id", input.internetMessageId)
      .maybeSingle();

    if (dedupHit) {
      // Message body already stored — return existing ID.
      // Caller will still create per-user candidate_email_links.
      return dedupHit.id;
    }
  }

  const { data, error } = await supabase
    .from("email_messages")
    .insert({
      agency_id:           input.agencyId,
      user_id:             input.userId,
      thread_id:           input.threadId,
      provider:            input.provider,
      provider_message_id: input.providerMessageId,
      internet_message_id: input.internetMessageId ?? null,
      direction:           input.direction,
      from_address:        normalizeEmail(input.fromAddress),
      to_addresses:        input.toAddresses.map(normalizeEmail),
      cc_addresses:        input.ccAddresses.map(normalizeEmail),
      bcc_addresses:       input.bccAddresses.map(normalizeEmail),
      subject:             input.subject,
      snippet:             input.snippet,
      body_text:           input.bodyText ?? null,
      body_html:           input.bodyHtml ?? null,
      sent_at:             input.sentAt,
      has_attachments:     input.hasAttachments,
    })
    .select("id")
    .single();

  if (error) {
    // Duplicate key — already inserted by concurrent worker
    if (error.code === "23505") return null;
    throw error;
  }

  return data.id;
}

// ─── Candidate link helpers ───────────────────────────────────────────────────

/**
 * Match a message's participant addresses against the candidates table
 * and insert candidate_email_links rows for each match.
 *
 * Strategy priority: exact → alt (domain alias).
 * Returns the list of matches created.
 */
export async function matchAndLink(
  supabase: SupabaseClient<Database>,
  agencyId: string,
  userId: string,
  messageId: string,
  msg: Pick<FullMessage, "from" | "toAddresses" | "ccAddresses" | "bccAddresses">
): Promise<CandidateMatch[]> {
  // Collect all participant addresses
  const rawAddresses = [
    msg.from,
    ...msg.toAddresses.map((a) => a.address),
    ...msg.ccAddresses.map((a) => a.address),
    ...msg.bccAddresses.map((a) => a.address),
  ].filter(Boolean);

  const normalised = [...new Set(rawAddresses.map(normalizeEmail))];
  if (normalised.length === 0) return [];

  // Query candidates by email / alt_email
  const { data: candidates } = await supabase
    .from("candidates")
    .select("id, email, alt_email")
    .eq("agency_id", agencyId)
    .or(
      normalised.map((a) => `email.eq.${a}`).join(",") +
        "," +
        normalised.map((a) => `alt_email.eq.${a}`).join(",")
    );

  if (!candidates?.length) return [];

  const matches: CandidateMatch[] = [];

  for (const cand of candidates) {
    const candidateEmail = normalizeEmail(cand.email ?? "");
    const altEmail = cand.alt_email ? normalizeEmail(cand.alt_email) : null;

    let matchedAddress: string | null = null;
    let strategy: MatchStrategy = "exact";

    for (const addr of normalised) {
      if (addr === candidateEmail || addr === altEmail) {
        matchedAddress = addr;
        strategy = "exact";
        break;
      }
    }

    if (!matchedAddress) continue;

    matches.push({
      candidateId: cand.id,
      strategy,
      confidence: 1.0,
      matchedAddress,
    });

    // Insert link (skip if already exists)
    const { data: existing } = await supabase
      .from("candidate_email_links")
      .select("id")
      .eq("candidate_id", cand.id)
      .eq("message_id", messageId)
      .maybeSingle();

    if (!existing) {
      await supabase.from("candidate_email_links").insert({
        candidate_id:     cand.id,
        message_id:       messageId,
        match_strategy:   strategy,
        match_confidence: 1.0,
        matched_address:  matchedAddress,
        agency_id:        agencyId,
        status:           "active",
      });
    }
  }

  // Log sync event for this message
  if (matches.length > 0) {
    await supabase.from("sync_events").insert({
      agency_id:          agencyId,
      user_id:            userId,
      provider:           "google", // overridden by caller if needed
      event_type:         "message_matched",
      messages_processed: 1,
      matches_created:    matches.length,
      occurred_at:        new Date().toISOString(),
    });
  }

  return matches;
}

// ─── Combined helper ──────────────────────────────────────────────────────────

/**
 * Full pipeline for one FullMessage:
 *   1. Upsert the thread
 *   2. Insert the message
 *   3. Match + link to candidates
 *
 * Returns { threadId, messageId, matches } or null if the message already existed.
 */
export async function processFullMessage(
  supabase: SupabaseClient<Database>,
  params: {
    agencyId: string;
    userId: string;
    provider: "google" | "microsoft";
    ref: MessageRef;
    msg: FullMessage;
    userEmail: string;
  }
): Promise<{ threadId: string; messageId: string; matches: CandidateMatch[] } | null> {
  const { agencyId, userId, provider, ref, msg, userEmail } = params;

  const direction = normalizeEmail(msg.from) === normalizeEmail(userEmail)
    ? "outbound" as const
    : "inbound" as const;

  // 1. Upsert thread
  const allParticipants = [
    msg.from,
    ...msg.toAddresses.map((a) => a.address),
    ...msg.ccAddresses.map((a) => a.address),
  ];

  const threadId = await upsertThread(supabase, {
    agencyId,
    userId,
    provider,
    providerThreadId: ref.providerThreadId,
    subject:          ref.subject ?? null,
    snippet:          msg.snippet ?? null,
    participantAddresses: [...new Set(allParticipants.map(normalizeEmail))],
    firstMsgAt:       ref.receivedAt,
    lastMsgAt:        ref.receivedAt,
  });

  // 2. Insert message (with internet_message_id for cross-provider dedup)
  const messageId = await insertMessage(supabase, {
    agencyId,
    userId,
    threadId,
    provider,
    providerMessageId: ref.providerMessageId,
    internetMessageId: ref.internetMessageId ?? msg.internetMessageId ?? null,
    direction,
    fromAddress:       msg.from,
    toAddresses:       msg.toAddresses.map((a) => a.address),
    ccAddresses:       msg.ccAddresses.map((a) => a.address),
    bccAddresses:      msg.bccAddresses.map((a) => a.address),
    subject:           msg.subject ?? null,
    snippet:           msg.snippet ?? null,
    bodyText:          msg.bodyText,
    bodyHtml:          msg.bodyHtml,
    sentAt:            ref.receivedAt,
    hasAttachments:    msg.hasAttachments,
  });

  // Already existed — idempotent skip
  if (!messageId) return null;

  // 3. Match + link
  const matches = await matchAndLink(supabase, agencyId, userId, messageId, msg);

  // 4. Inbound-only: detect DSNs / spam complaints / auto-replies (US-472).
  //    Errors are swallowed — detector logs internally, and a bounce miss
  //    should never break the primary sync write.
  if (direction === "inbound") {
    try {
      await handleInboundMessage({
        agencyId,
        headers: {
          contentType: (msg as unknown as { contentType?: string }).contentType,
          from:        msg.from,
          subject:     msg.subject ?? "",
          rawHeaders:  safeParseHeaders((msg as unknown as { rawHeaders?: string }).rawHeaders),
        },
        bodyText:       msg.bodyText ?? undefined,
        bodyHtml:       msg.bodyHtml ?? undefined,
        rawHeadersJson: (msg as unknown as { rawHeaders?: string }).rawHeaders,
      });
    } catch (err) {
      console.error("[storage/messages] bounce detector failed", err);
    }
  }

  return { threadId, messageId, matches };
}

function safeParseHeaders(raw: string | undefined): Record<string, string> | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      out[k.toLowerCase()] = typeof v === "string" ? v : String(v ?? "");
    }
    return out;
  } catch { return undefined; }
}
