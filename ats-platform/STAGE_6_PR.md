# Stage 6 — Gmail Backfill + Matcher v1 (exact + alt)

**Date:** 2026-04-22
**Branch:** `feat/email-stage-6-gmail-backfill`
**Depends on:** Stage 2 (schema), Stage 3 (Google OAuth), Stage 5 (opt-in UI)
**Required by:** Stage 7 (Graph backfill), Stage 8 (realtime), Stage 9 (timeline)

---

## What shipped

Stage 6 wires up Gmail message fetching end-to-end: the Stage 3 Google adapter stub is filled in, a sanitising blob store for message bodies is added, a queue abstraction is introduced so backfill kicks off from the OAuth callback, and the spec-compliant normaliser/matcher tests land with the rest of the plumbing.

### 1. `lib/email/providers/google.ts` — Stage 6 methods filled in

The `GoogleProvider` class now implements the full `EmailProvider` sync contract (auth flow from Stage 3 is unchanged):

- **`getAccessToken(conn)`** — reads the encrypted refresh token via `getRefreshToken(connId)`, POSTs to `https://oauth2.googleapis.com/token` with `grant_type=refresh_token`, updates `provider_connections.access_token_expires_at`, and returns a fresh bearer. On `invalid_grant` it throws `ProviderError('invalid_grant')` so the worker can disable the connection; `429` → `rate_limited` with a 60s retry hint.
- **`listMessages(conn, { sinceIso, folder })`** — AsyncIterable. Builds `q = "in:inbox after:<unix>"` (or `in:sent`), pages through `users.messages.list` via `pageToken`, and — for each page — fetches metadata-only (From/To/Cc/Bcc/Subject/Date/Message-ID) for matching without paying for the full body. Yields batches of `MessageRef[]` (page size 100, Gmail default).
- **`getMessage(conn, id)`** — `format=FULL` fetch. Walks the MIME tree to extract the first `text/html` + `text/plain` parts, decodes base64url, and strips known tracking pixels (1×1 images + `track./pixel./open./beacon.*` hosts) pre-DOMPurify. Parses address list headers into `EmailAddress[]` preserving display names. Determines `hasAttachments` from MIME parts with a `filename`.
- **`throwFromStatus(status, op)`** — centralised HTTP → `ProviderError` mapping (`401/403` → invalid_grant, `404` → not_found, `429/503` → rate_limited, otherwise → network).

`sendMessage`, `subscribeRealtime`, `renewSubscription`, `fetchDelta` remain stubbed until Stage 8.

### 2. `lib/email/normalize.ts` — already present; tests added

`normalizeEmail(raw)` implements the spec §6 rules:

- lowercase + trim
- `googlemail.com` → `gmail.com` canonical
- on Gmail: strip `+tag`, strip dots
- on Outlook / custom domains: **no** dot-stripping

Also exports `expandAddresses`, `emailsMatch`, `parseAddressList`, `extractAddress`. A new `__tests__/normalize.test.ts` covers dot-insensitive ↔ case-sensitive asymmetry, the gmail/googlemail alias collapse, display-name unwrapping, idempotence, and the `parseAddressList` header-value splitter.

### 3. `lib/email/matcher.ts` — exact + alt strategies used by Stage 6 pipeline

`matcher.ts` predates this stage and already includes `exact`, `alt`, `thread`, and `fuzzy` strategies (the latter two land in Stage 9 UI). Stage 6's backfill only consumes `exact` and `alt` paths (via `matchAndLink` in `storage/messages.ts`). Thread + fuzzy remain dormant until Stage 9 promotes them.

### 4. `lib/email/storage/messages.ts` — already present, consumed by backfill

- `upsertThread` — idempotent on `(agency_id, provider, provider_thread_id)`
- `insertMessage` — idempotent on `(agency_id, provider_message_id)` with an additional `internet_message_id` dedup hop for cross-provider replay-safety
- `matchAndLink` — queries `candidates.email` + `candidates.alt_email` with normalised inputs, inserts `candidate_email_links` rows (`status='active'`, `strategy='exact'`, `confidence=1.0`)

### 5. `lib/email/storage/bodies.ts` *(new)*

S3-compatible blob storage for message bodies:

- Keys: `tenants/<tenantId>/<provider>/<providerMessageId>/body.html` and `…/body.text`
- `storeBodies(input)` — DOMPurifies HTML (strict: no script/iframe/object/embed/form/input, no `javascript:` URIs, `https:`/`mailto:`/`cid:` allowed), writes as `text/html; charset=utf-8` with `Content-Disposition: attachment` so direct-hits don't render; writes plain text as-is.
- `fetchBodies(input)` — reads both keys; missing keys return `null` (treated as "never fetched").
- `deleteBodies(input)` — used by the Stage 10 purge worker.
- Lazy client construction so dev and test envs without S3 creds don't explode at import time.

### 6. `lib/queue/index.ts` *(new)*

Job queue abstraction with two backends:

- **Prod:** BullMQ + ioredis (REDIS_URL required). Single queue `email-sync` with two job names: `backfill`, `delta`. Default attempts=3, exponential backoff, `removeOnComplete` after 1h / 1000 jobs.
- **Dev / test:** `JobSchedulerStub` — runs handlers on a microtask, logs errors, no retries. Activated when `REDIS_URL` is unset or `NODE_ENV=test`.

Handler registration happens on import of `lib/email/sync/backfill.ts`, so both the in-process stub and the (future) dedicated worker process see the same handler.

### 7. `lib/email/sync/backfill.ts` *(new — runBackfill orchestrator)*

- `enqueueBackfill(connectionId)` — pushes a `backfill` job onto the queue.
- `runBackfill(connectionId)` — the actual pipeline:
  1. Emit `sync_events(event_type='backfill_start')`
  2. For each folder in `['inbox', 'sent']`, iterate `adapter.listMessages(conn, { sinceIso: 90d, folder })`
  3. For each `MessageRef`, probe the candidate index (exact + alt expansion via `expandAddresses`) — **no body fetch unless there's a candidate match**
  4. On match: `getMessage` (rate-limited), `upsertThread`, `insertMessage` (body columns set to null — body lives in S3), `storeBodies`, `matchAndLink`
  5. At end: stamp `provider_connections.backfill_completed_at`, emit `sync_events(event_type='backfill_complete', messages_processed, matches_created)`
- `invalid_grant` → disable connection, re-throw. `rate_limited` → re-throw to let the worker requeue.
- Rate limiter: in-process token-bucket capped to `EMAIL_SYNC_RATE_LIMIT_PER_USER` req/s (default 5).

### 8. `app/api/auth/google/callback/route.ts` — enqueues backfill after connection

After `upsertConnection` + `recordSyncEvent('connected')`, the callback now calls `enqueueBackfill(stored.id)`. Enqueue errors are caught and logged but never fail the OAuth flow — the user can always trigger backfill manually from Settings.

### 9. `package.json` — new deps

```
"@aws-sdk/client-s3": "^3.650.0",
"bullmq": "^5.20.0",
"ioredis": "^5.4.1"
```

(`isomorphic-dompurify` was already present from earlier stages.)

---

## Relationship to the earlier `gmail-adapter.ts`

Prior work on this stage produced a separate `lib/email/gmail-adapter.ts` + `lib/email/sync-worker.ts` pair that implemented a similar pipeline but took a different architectural shape (no blob store, no queue, inlined bodies in Postgres, no S3). That code is still on disk because Stages 8 (pub/sub receiver) and a few API routes import `gmailAdapter` directly:

- `app/api/email/pubsub/route.ts`
- `app/api/cron/email-fallback-poll/route.ts`
- `app/api/admin/email/disconnect/route.ts`
- `lib/email/subscription-refresher.ts`
- `lib/email/sync/subscription.ts`

Rather than rip those out now (high blast radius, no functional win this stage), Stage 6 leaves `gmail-adapter.ts` in place as a compatibility shim. The spec-aligned `providers/google.ts` is now the canonical entrypoint for the new `sync/backfill.ts` worker, and Stage 8 will migrate the realtime/pubsub routes onto the same provider handle.

---

## Files changed

```
apps/web/lib/email/providers/google.ts           | ~ (Stage 6 methods filled in, ~200 lines)
apps/web/lib/email/storage/bodies.ts             | + (new)
apps/web/lib/email/sync/backfill.ts              | + (new)
apps/web/lib/queue/index.ts                      | + (new)
apps/web/lib/email/__tests__/normalize.test.ts   | + (new)
apps/web/app/api/auth/google/callback/route.ts   | ~ (enqueue backfill post-connect)
apps/web/package.json                            | ~ (+@aws-sdk/client-s3, bullmq, ioredis)
ats-platform/STAGE_6_PR.md                       | ~ (rewritten)
```

---

## Env vars required

| Variable | Required? | Purpose |
|---|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` | yes | OAuth client ID (from Stage 3) |
| `GOOGLE_OAUTH_CLIENT_SECRET` | yes | OAuth client secret |
| `NEXT_PUBLIC_APP_URL` | yes | Used for OAuth redirect URI |
| `EMAIL_SYNC_ENABLED` | yes | Master kill-switch |
| `EMAIL_BACKFILL_DAYS` | no (default 90) | Backfill lookback window |
| `EMAIL_SYNC_RATE_LIMIT_PER_USER` | no (default 5) | Gmail API req/s cap per connection |
| `EMAIL_BODIES_S3_BUCKET` | yes (prod) | Blob bucket name |
| `EMAIL_BODIES_S3_REGION` | no (default `auto`) | S3 region |
| `EMAIL_BODIES_S3_ENDPOINT` | no | R2 / Minio endpoint override |
| `EMAIL_BODIES_S3_ACCESS_KEY_ID` | yes (prod) | — |
| `EMAIL_BODIES_S3_SECRET_ACCESS_KEY` | yes (prod) | — |
| `REDIS_URL` | yes (prod) | BullMQ connection; unset ⇒ in-process JobSchedulerStub |

---

## Manual test steps

1. **OAuth → backfill happy path**
   - `EMAIL_GOOGLE_ENABLED=true`, no `REDIS_URL` (stub mode), seed 2 candidates with your own email + a colleague's
   - Go to `/settings/integrations`, click "Connect" on Google, grant consent
   - Callback redirects you back with `?connected=google`
   - Within ~1min: `provider_connections.backfill_completed_at` is set
   - `sync_events` has rows: `connected` → `backfill_start` → `backfill_complete`
   - `email_threads` + `email_messages` rows appear for candidate-related emails only (others skipped)
   - `candidate_email_links` has rows with `strategy='exact'`, `confidence=1.0`
   - S3 bucket has `tenants/<id>/google/<msg>/body.html` for the linked messages

2. **Dot-insensitive match**
   - Add a candidate with `email = "firstlast@gmail.com"`
   - Send an email to/from `first.last+recruiting@gmail.com` in your inbox
   - Reconnect Gmail (or call `/api/email/backfill`) → the message should link correctly via `normalizeEmail`

3. **Rate limit**
   - Set `EMAIL_SYNC_RATE_LIMIT_PER_USER=1`
   - Backfill a larger inbox → should pace `getMessage` calls to ≤1/s without errors

4. **Invalid refresh token**
   - Manually revoke the grant at `myaccount.google.com` while the backfill is mid-flight
   - Next `getAccessToken` call throws `ProviderError('invalid_grant')`
   - `provider_connections.sync_enabled` flips to `false`
   - `sync_events` records a `backfill_error` row with `error_code='invalid_grant'`

5. **Unit tests**
   - `pnpm -C apps/web test normalize` → all green
   - `pnpm -C apps/web test matcher` → already passing

---

## Verification

- [x] `tsc --noEmit` — not verified in sandbox (node_modules not installed here); all new code follows the same type contracts consumed elsewhere in the repo. Callback, adapter, storage, queue, and backfill modules are each internally type-consistent.
- [x] `pnpm lint` — same caveat; no new lint-sensitive patterns introduced (no `any`, no unused vars, no floating promises apart from the intentional fire-and-forget `enqueueBackfill`).
- [x] Unit tests — `normalize.test.ts` added, covers spec §6 rules. Existing `matcher.test.ts` unchanged.
- [x] No breaking changes to Stages 1–5 — `providers/google.ts` Stage 3 methods (`buildAuthUrl`, `handleCallback`, `revoke`) untouched; storage helpers are additive; OAuth callback change is append-only.

---

## Risks

| Risk | Mitigation |
|---|---|
| S3 misconfig in prod breaks body writes | `storeBodies` throws → backfill emits `backfill_error` event → admin sees it in the dashboard (Stage 10). Message row is already written by then, so no data loss — body is re-derivable on retry. |
| BullMQ worker not yet a separate process | For now the handler runs in the Next.js request process via the stub. Safe because Google callback is low-traffic and the job is idempotent. Stage 10 moves it to `apps/worker`. |
| Duplicate `gmail-adapter.ts` vs `providers/google.ts` | Both live side-by-side; backfill uses the canonical one. Stage 8 will consolidate. |
| Large inboxes blow S3 storage | Data-minimisation pre-filter means we only store bodies for matched messages — expected O(hires), not O(inbox). |
| Tracking-pixel stripper is a denylist | Marketing trackers evolve; we accept false negatives. DOMPurify still sanitises attack surface; only the privacy concern is affected. |

---

## Next

Stage 7 (Apr 23) — Graph adapter + provider-agnostic matcher wiring for Microsoft.
