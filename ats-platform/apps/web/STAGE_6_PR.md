# Stage 6 — Gmail Sync Engine (Backfill + Delta + Candidate Matching)

## Summary

Implements the full Gmail message sync pipeline: 90-day backfill on connect, delta sync on Pub/Sub push, and email-to-candidate matching via exact and domain-alias strategies.

## What shipped

### Email normalisation (`lib/email/normalize.ts`)
- `normalizeEmail(raw)` — canonical form: lowercase, Gmail dot-strip, +tag-strip, googlemail→gmail alias
- `expandAddresses(raw)` — returns normalised + original bare form for pre-existing un-normalised rows
- `emailsMatch(a, b)`, `parseAddressList(header)` — convenience helpers

### Message storage layer (`lib/email/storage/messages.ts`)
- `upsertThread` — idempotent; conflict key `agency_id, provider, provider_thread_id`
- `insertMessage` — idempotent; returns `null` if the message already exists (concurrent-safe)
- `matchAndLink` — queries candidates by normalised email/alt_email, inserts `candidate_email_links` rows
- `processFullMessage` — full pipeline (thread upsert → message insert → match+link) called from both backfill and delta handlers

### Gmail adapter (`lib/email/gmail-adapter.ts`) — already existed, now wired
- `getAccessToken(conn)` — refresh on each call (access token not persisted; uses encrypted refresh token from DB)
- `listMessages(conn, { sinceIso, folder })` — paginates Gmail API with batch size 50, yields `MessageRef[]`
- `getMessage(conn, id)` — fetches full payload, extracts HTML + text body, normalises headers
- `fetchDelta(conn)` — uses Gmail history API (`/history?startHistoryId=`) to pull changes since last cursor; falls back to 7-day backfill if no cursor set

### Backfill sync worker (`lib/email/sync-worker.ts`) — already existed, now wired
- Iterates inbox + sent via `listMessages`, fetches full message, upserts thread+message, runs matcher
- Writes `sync_events` rows for each page (type: `backfill_page`) and on completion/error
- Marks `backfill_completed_at` on the connection row when done

### Candidate matcher (`lib/email/matcher.ts`) — already existed
- Strategy 1: exact match against `candidates.email` and `candidates.alt_email`
- Strategy 2: alt-domain match (gmail.com ↔ googlemail.com)
- Deduplicates by candidate ID, keeps highest-confidence match

### API routes
- `POST /api/email/backfill` — triggers 90-day backfill for the authed user's Google connection (fires async, returns 202 immediately)
- `POST /api/email/pubsub` — Gmail Pub/Sub push handler; uses `for await` to iterate `fetchDelta` generator, runs `processFullMessage` per message, ACKs unconditionally

### Encryption consolidation
- `lib/email/encryption.ts` — primary implementation (Node.js `crypto`, AES-256-GCM, synchronous key ops)
- `lib/email/token-store.ts` — compatibility shim re-exporting `encrypt`/`decrypt` with dev-mode passthrough when `EMAIL_TOKEN_ENCRYPTION_KEY` is not set

## Required env vars

```
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
EMAIL_TOKEN_ENCRYPTION_KEY=       # 32-byte base64: openssl rand -base64 32
NEXT_PUBLIC_APP_URL=
EMAIL_SYNC_ENABLED=true
EMAIL_BACKFILL_DAYS=90            # optional, default 90

# For Pub/Sub push (Stage 8 realtime):
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

## Google Pub/Sub setup (for delta sync)

1. Create a Pub/Sub topic in your GCP project
2. Create a push subscription pointing to `{NEXT_PUBLIC_APP_URL}/api/email/pubsub`
3. After a user connects Gmail, call `gmailAdapter.renewSubscription(conn, sub)` (or trigger via the `POST /api/email/refresh-subscriptions` cron) to register the watch
4. Set `GOOGLE_PUBSUB_PROJECT_ID` and `GOOGLE_PUBSUB_TOPIC_NAME`

## Candidate matching notes

- Addresses are normalised before DB lookup — "First.Last+tag@gmail.com" matches "firstlast@googlemail.com"
- Matching is non-destructive: existing `candidate_email_links` rows are never deleted, only added
- `match_status = 'active'` on insert; reviewers can set to `pending_review` or `rejected` in the future (Stage 6.1)
- Thread-ID matching (Strategy 3) and fuzzy matching (Strategy 4) are defined in the README spec but not yet implemented — they land in Stage 6.1

## Testing

1. Connect Gmail via Settings → Integrations
2. POST `/api/email/backfill` — check `email_threads`, `email_messages`, `candidate_email_links` tables
3. Verify `sync_events` rows written (type: `backfill_page`, then `backfill_complete`)
4. Send a test email to/from a candidate's stored address — Pub/Sub push should create a `delta_sync` event and link
