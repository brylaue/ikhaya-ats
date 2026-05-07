/**
 * Stage 10 — Data purge utilities.
 *
 * Two entry points:
 *   1. purgeUserData(userId, provider) — wipes everything for a single user+provider
 *   2. purgeCandidateEmailData(candidateId) — RTBF cascade when a candidate is deleted
 *
 * Both are idempotent; safe to re-run on partial failures.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProviderId } from "@/types/email/provider";

// ─── User data purge ────────────────────────────────────────────────────────

export interface PurgeUserResult {
  linksDeleted: number;
  messagesDeleted: number;
  threadsDeleted: number;
  connectionDeleted: boolean;
}

/**
 * Fully purge a user's email data for one provider.
 *
 * Order matters — candidate_email_links reference email_messages, so delete
 * links first, then messages, then threads, then the connection row, then
 * the encrypted token. Finally record an audit event.
 *
 * S3 body cleanup: in v1 bodies are stored inline (body_html / body_text
 * columns). When we move to S3, add key-prefix deletion here:
 *   `tenants/<agencyId>/<provider>/<provider_message_id>/`
 */
export async function purgeUserData(
  supabase: SupabaseClient,
  userId: string,
  provider: ProviderId,
  agencyId: string,
  opts?: { auditActorId?: string }
): Promise<PurgeUserResult> {
  // 1. Find all message IDs for this user+provider
  const { data: messages } = await supabase
    .from("email_messages")
    .select("id")
    .eq("user_id", userId)
    .eq("provider", provider);

  const messageIds = (messages ?? []).map((m) => m.id);

  // 2. Delete candidate_email_links for those messages
  let linksDeleted = 0;
  if (messageIds.length > 0) {
    // Batch in chunks of 200 to stay within Supabase query limits
    for (let i = 0; i < messageIds.length; i += 200) {
      const batch = messageIds.slice(i, i + 200);
      const { count } = await supabase
        .from("candidate_email_links")
        .delete({ count: "exact" })
        .in("message_id", batch);
      linksDeleted += count ?? 0;
    }
  }

  // 3. Delete email_messages
  const { count: messagesDeleted } = await supabase
    .from("email_messages")
    .delete({ count: "exact" })
    .eq("user_id", userId)
    .eq("provider", provider);

  // 4. Delete orphaned threads (threads with no remaining messages)
  const { data: orphanedThreads } = await supabase
    .from("email_threads")
    .select("id")
    .eq("user_id", userId)
    .eq("provider", provider);

  let threadsDeleted = 0;
  for (const thread of orphanedThreads ?? []) {
    const { count: remaining } = await supabase
      .from("email_messages")
      .select("id", { count: "exact", head: true })
      .eq("thread_id", thread.id);

    if ((remaining ?? 0) === 0) {
      await supabase.from("email_threads").delete().eq("id", thread.id);
      threadsDeleted++;
    }
  }

  // 5. Delete provider_connections row
  const { error: connError } = await supabase
    .from("provider_connections")
    .delete()
    .eq("user_id", userId)
    .eq("provider", provider);

  const connectionDeleted = !connError;

  // 6. Record audit event
  await supabase.from("sync_events").insert({
    user_id: userId,
    agency_id: agencyId,
    provider,
    event_type: "purged",
    messages_processed: 0,
    matches_created: 0,
    detail: {
      links_deleted: linksDeleted,
      messages_deleted: messagesDeleted ?? 0,
      threads_deleted: threadsDeleted,
      actor_id: opts?.auditActorId ?? userId,
    },
  });

  return {
    linksDeleted,
    messagesDeleted: messagesDeleted ?? 0,
    threadsDeleted,
    connectionDeleted,
  };
}

// ─── Candidate data purge (RTBF) ────────────────────────────────────────────

export interface PurgeCandidateResult {
  linksDeleted: number;
  messagesDeleted: number;
}

/**
 * Right-to-be-forgotten: when a candidate is deleted, remove all their
 * email links and any messages that have no remaining links to any candidate.
 */
export async function purgeCandidateEmailData(
  supabase: SupabaseClient,
  candidateId: string,
  agencyId: string
): Promise<PurgeCandidateResult> {
  // 1. Find all links for this candidate
  const { data: links } = await supabase
    .from("candidate_email_links")
    .select("id, message_id")
    .eq("candidate_id", candidateId);

  if (!links || links.length === 0) {
    return { linksDeleted: 0, messagesDeleted: 0 };
  }

  const messageIds = [...new Set(links.map((l) => l.message_id))];

  // 2. Delete all candidate_email_links for this candidate
  const { count: linksDeleted } = await supabase
    .from("candidate_email_links")
    .delete({ count: "exact" })
    .eq("candidate_id", candidateId);

  // 3. For each message, check if any links remain; delete orphans
  let messagesDeleted = 0;
  for (const msgId of messageIds) {
    const { count: remaining } = await supabase
      .from("candidate_email_links")
      .select("id", { count: "exact", head: true })
      .eq("message_id", msgId);

    if ((remaining ?? 0) === 0) {
      await supabase.from("email_messages").delete().eq("id", msgId);
      messagesDeleted++;
    }
  }

  // 4. Record audit event
  await supabase.from("sync_events").insert({
    agency_id: agencyId,
    provider: "google", // generic audit — not provider-specific
    event_type: "rtbf_purge",
    messages_processed: 0,
    matches_created: 0,
    detail: {
      target_candidate_id: candidateId,
      links_deleted: linksDeleted ?? 0,
      messages_deleted: messagesDeleted,
    },
  });

  return {
    linksDeleted: linksDeleted ?? 0,
    messagesDeleted,
  };
}
