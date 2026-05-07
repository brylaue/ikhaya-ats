/**
 * 90-day email backfill orchestrator.
 *
 * Triggered from the OAuth callback via `emailSyncQueue().add('backfill', ...)`.
 * In dev this runs in-process (JobSchedulerStub); in prod a BullMQ worker
 * picks it up.
 *
 * Pipeline per connection:
 *   1. `listMessages(inbox, 90d)` → candidate matcher (exact + alt only)
 *   2. For each ref with a match: `getMessage`, store bodies to S3, upsert
 *      thread+message, insert candidate_email_links.
 *   3. Repeat for `sent`.
 *   4. Stamp `backfill_completed_at`, emit `backfill_complete` sync_event.
 *
 * Data-minimisation rule (spec §9.1): we never fetch a full body or store
 * it in S3 unless the metadata ref matches at least one candidate. This
 * caps storage growth at ~O(hires) rather than O(user inbox).
 *
 * Stage 6.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import type { ProviderConnection, MessageRef, MatchStrategy } from "@/types/email/provider";
import { ProviderError } from "@/types/email/provider";
import { googleProvider } from "@/lib/email/providers/google";
import { getProvider } from "@/lib/email/providers";
import { upsertThread, insertMessage, matchAndLink } from "@/lib/email/storage/messages";
import { storeBodies } from "@/lib/email/storage/bodies";
import { createClient as createSupabaseServer } from "@/lib/supabase/server";
import { normalizeEmail, expandAddresses } from "@/lib/email/normalize";
import {
  emailSyncQueue,
  registerEmailSyncHandler,
  type BackfillJobData,
} from "@/lib/queue";

const BACKFILL_DAYS = parseInt(process.env.EMAIL_BACKFILL_DAYS ?? "90", 10);
const RATE_LIMIT_PER_SECOND = parseInt(
  process.env.EMAIL_SYNC_RATE_LIMIT_PER_USER ?? "5",
  10
);

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Enqueue a backfill for the given connection.
 * Returns immediately; the job runs in the worker process (or in-process stub).
 */
export async function enqueueBackfill(connectionId: string): Promise<void> {
  await emailSyncQueue().add("backfill", { connectionId });
}

/**
 * Run a backfill synchronously. Called by the BullMQ worker, the in-process
 * stub, or directly from tests.
 */
export async function runBackfill(connectionId: string): Promise<BackfillResult> {
  const supabase = await createSupabaseServer();
  const conn = await loadConnection(supabase, connectionId);
  if (!conn) {
    console.warn(`[backfill] connection ${connectionId} not found`);
    return { messagesSeen: 0, messagesProcessed: 0, matchesCreated: 0 };
  }

  if (!conn.syncEnabled) {
    console.info(`[backfill] connection ${connectionId} has sync_enabled=false, skipping`);
    return { messagesSeen: 0, messagesProcessed: 0, matchesCreated: 0 };
  }

  const adapter = conn.provider === "google" ? googleProvider : getProvider(conn.provider);

  // ─── Emit backfill_start ─────────────────────────────────────────────
  await supabase.from("sync_events").insert({
    agency_id:  conn.agencyId ?? null,
    user_id:    conn.userId,
    provider:   conn.provider,
    event_type: "backfill_start",
    occurred_at: new Date().toISOString(),
  });

  const sinceIso = new Date(Date.now() - BACKFILL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const limiter = makeRateLimiter(RATE_LIMIT_PER_SECOND);

  let messagesSeen = 0;
  let messagesProcessed = 0;
  let matchesCreated = 0;

  try {
    for (const folder of ["inbox", "sent"] as const) {
      for await (const refs of adapter.listMessages(conn, { sinceIso, folder })) {
        for (const ref of refs) {
          messagesSeen++;

          // Data-minimisation: probe candidate index with metadata only.
          const preMatches = await probeCandidateIndex(supabase, conn.agencyId ?? "", ref);
          if (preMatches.length === 0) continue;

          // Match hit → fetch full message (rate-limited)
          try {
            const fullMsg = await limiter(() =>
              adapter.getMessage(conn, ref.providerMessageId)
            );

            // Upsert thread first so we have a parent row for the message
            const threadId = await upsertThread(supabase, {
              agencyId:  conn.agencyId ?? "",
              userId:    conn.userId,
              provider:  conn.provider,
              providerThreadId: ref.providerThreadId,
              subject:   ref.subject ?? null,
              snippet:   fullMsg.snippet,
              participantAddresses: [
                fullMsg.from,
                ...fullMsg.toAddresses.map((a) => a.address),
                ...fullMsg.ccAddresses.map((a) => a.address),
              ],
              firstMsgAt: ref.receivedAt,
              lastMsgAt:  ref.receivedAt,
            });

            const direction =
              normalizeEmail(fullMsg.from) === normalizeEmail(conn.email) ? "outbound" : "inbound";

            // Insert the message row *without* the body — body goes to S3.
            const messageId = await insertMessage(supabase, {
              agencyId:  conn.agencyId ?? "",
              userId:    conn.userId,
              threadId,
              provider:  conn.provider,
              providerMessageId: ref.providerMessageId,
              internetMessageId: ref.internetMessageId ?? fullMsg.internetMessageId ?? null,
              direction,
              fromAddress:   fullMsg.from,
              toAddresses:   fullMsg.toAddresses.map((a) => a.address),
              ccAddresses:   fullMsg.ccAddresses.map((a) => a.address),
              bccAddresses:  fullMsg.bccAddresses.map((a) => a.address),
              subject:       fullMsg.subject ?? null,
              snippet:       fullMsg.snippet,
              // Body columns left null — body lives in S3
              bodyHtml:      null,
              bodyText:      null,
              sentAt:        ref.receivedAt,
              hasAttachments: fullMsg.hasAttachments,
            });

            if (!messageId) continue; // concurrent worker already inserted

            // Body → S3. `storeBodies` sanitises via DOMPurify.
            await storeBodies({
              tenantId:          conn.agencyId ?? "unknown",
              provider:          conn.provider,
              providerMessageId: ref.providerMessageId,
              bodyHtml:          fullMsg.bodyHtml,
              bodyText:          fullMsg.bodyText,
            });

            // Link to candidate(s). `matchAndLink` does exact+alt lookup
            // against the full address set and inserts candidate_email_links.
            const matches = await matchAndLink(
              supabase,
              conn.agencyId ?? "",
              conn.userId,
              messageId,
              fullMsg
            );

            messagesProcessed++;
            matchesCreated += matches.length;
          } catch (err) {
            if (err instanceof ProviderError && err.code === "rate_limited") {
              // Pause and re-throw to halt the backfill — worker will retry
              throw err;
            }
            if (err instanceof ProviderError && err.code === "invalid_grant") {
              // Connection is dead — mark disabled and stop
              await supabase
                .from("provider_connections")
                .update({ sync_enabled: false })
                .eq("id", conn.id);
              throw err;
            }
            console.error(
              `[backfill] failed on message ${ref.providerMessageId}:`,
              err
            );
            // Non-fatal: continue to next message
          }
        }
      }
    }

    // ─── Stamp completion ────────────────────────────────────────────
    await supabase
      .from("provider_connections")
      .update({ backfill_completed_at: new Date().toISOString() })
      .eq("id", conn.id);

    await supabase.from("sync_events").insert({
      agency_id:  conn.agencyId ?? null,
      user_id:    conn.userId,
      provider:   conn.provider,
      event_type: "backfill_complete",
      messages_processed: messagesProcessed,
      matches_created:    matchesCreated,
      occurred_at: new Date().toISOString(),
    });

    return { messagesSeen, messagesProcessed, matchesCreated };
  } catch (err) {
    await supabase.from("sync_events").insert({
      agency_id:  conn.agencyId ?? null,
      user_id:    conn.userId,
      provider:   conn.provider,
      event_type: "backfill_error",
      error_code:
        err instanceof ProviderError ? err.code : "sync_failed",
      error_body: { message: String(err) },
      occurred_at: new Date().toISOString(),
    });
    throw err;
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BackfillResult {
  messagesSeen: number;
  messagesProcessed: number;
  matchesCreated: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function loadConnection(
  supabase: SupabaseClient<Database>,
  id: string
): Promise<ProviderConnection | null> {
  const { data, error } = await supabase
    .from("provider_connections")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id,
    userId: data.user_id,
    agencyId: data.agency_id,
    provider: data.provider,
    providerSub: data.provider_sub,
    email: data.email,
    msTenantId: data.ms_tenant_id ?? null,
    scopes: data.scopes ?? [],
    syncEnabled: data.sync_enabled ?? true,
    backfillCompletedAt: data.backfill_completed_at ?? null,
    deltaCursor: data.delta_cursor ?? null,
    realtimeSubscriptionId: data.realtime_subscription_id ?? null,
    realtimeExpiresAt: data.realtime_expires_at ?? null,
    accessTokenExpiresAt: data.access_token_expires_at ?? null,
    refreshTokenSecretRef: data.refresh_token_secret_ref ?? null,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

/**
 * Lightweight candidate-index probe. Given a MessageRef (metadata only),
 * return the candidate IDs whose stored email / alt_email match any of
 * the ref's participant addresses under the normalisation rules.
 *
 * This is a dumber, read-only version of matchAndLink — we don't want to
 * incur a body fetch or write DB rows until we know the message is
 * candidate-relevant.
 */
async function probeCandidateIndex(
  supabase: SupabaseClient<Database>,
  agencyId: string,
  ref: MessageRef
): Promise<{ candidateId: string; strategy: MatchStrategy }[]> {
  if (!agencyId) return [];

  // Collect all addresses (from + to + cc + bcc), normalise, and also try
  // dot-stripped gmail variants.
  const rawAddresses = [ref.from, ...ref.to, ...ref.cc, ...ref.bcc].filter(Boolean);
  const candidateKeys = new Set<string>();
  for (const raw of rawAddresses) {
    for (const norm of expandAddresses(raw)) candidateKeys.add(norm);
  }
  if (candidateKeys.size === 0) return [];

  // Two queries: exact on `email`, exact on `alt_email`.
  const keys = Array.from(candidateKeys);
  const [byEmail, byAlt] = await Promise.all([
    supabase
      .from("candidates")
      .select("id")
      .eq("agency_id", agencyId)
      .in("email", keys),
    supabase
      .from("candidates")
      .select("id")
      .eq("agency_id", agencyId)
      .in("alt_email", keys),
  ]);

  const results = new Map<string, MatchStrategy>();
  for (const row of byEmail.data ?? []) results.set(row.id, "exact");
  for (const row of byAlt.data ?? []) if (!results.has(row.id)) results.set(row.id, "alt");

  return Array.from(results.entries()).map(([candidateId, strategy]) => ({ candidateId, strategy }));
}

/**
 * Simple token-bucket-style rate limiter — caps in-flight `fn()` calls so
 * we stay under the per-connection quota. Not persistent; per-process.
 *
 * Good enough for Stage 6; prod rate limiting (Stage 10) will use Redis.
 */
function makeRateLimiter(perSecond: number) {
  const interval = 1000 / Math.max(perSecond, 1);
  let nextAvailable = 0;

  return async <T>(fn: () => Promise<T>): Promise<T> => {
    const now = Date.now();
    const waitFor = Math.max(0, nextAvailable - now);
    nextAvailable = Math.max(now, nextAvailable) + interval;
    if (waitFor > 0) await new Promise((r) => setTimeout(r, waitFor));
    return fn();
  };
}

// ─── Handler registration ────────────────────────────────────────────────────
//
// The in-process JobSchedulerStub looks up handlers at `add()` time, so we
// register on import. The prod BullMQ worker imports this module at startup
// for the same effect. Safe to call multiple times — later registrations
// just overwrite.

registerEmailSyncHandler("backfill", async (data) => {
  const { connectionId } = data as BackfillJobData;
  await runBackfill(connectionId);
});
