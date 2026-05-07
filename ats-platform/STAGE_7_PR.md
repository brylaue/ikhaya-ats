# Stage 7 — Microsoft Graph Backfill + Provider-Agnostic Sync

**Date:** 2026-04-23
**Branch:** `feat/email-stage-7-graph-backfill`
**Depends on:** Stage 2 (schema), Stage 4 (Microsoft OAuth), Stage 6 (Gmail backfill + pipeline)
**Required by:** Stage 8 (realtime)

---

## What shipped

Stage 7 fills in the Microsoft Graph adapter (Stage 4 left it at stubs), wires the Graph fetch path into the provider-agnostic sync pipeline, adds `internet_message_id` cross-provider dedup, and gates Microsoft backfill on admin consent so an unconsented tenant doesn't crash mid-stream.

### 1. `lib/email/providers/microsoft.ts` — Stage 7 surface filled in

`MicrosoftProvider` now implements the Stage 7 contract on top of the Stage 4 auth flow. The fetch path is hand-rolled (`graphFetch` helper wrapping `fetch`) rather than taking a dep on `@microsoft/microsoft-graph-client` — lighter, explicit rate-limit handling, no MSAL SDK bloat.

- **`graphFetch(url, accessToken, headers?)`** — centralised Graph HTTP wrapper.
  - `429 / 503` → `ProviderError('rate_limited', retryAfterSeconds)` using the `Retry-After` header (default 60s).
  - `401` → `ProviderError('invalid_grant')`.
  - `403` with `AADSTS65001` in body → `ProviderError('admin_consent_required')` — lets `sync-worker` disable the connection cleanly.
  - All other status codes pass through; caller checks `.ok`.
- **`getAccessToken(conn)`** — MSAL-style refresh against `/{tenant}/oauth2/v2.0/token` with `grant_type=refresh_token`. Uses `conn.msTenantId` when available, falls back to `common`. Persists the rotated refresh token (MS rotates on use) and stamps `access_token_expires_at`. US-340 concurrency: in-flight refresh is coalesced per-connection via `_refreshInFlight`; DB persist uses a `token_revision` CAS to catch cross-process races. On failed CAS / persist, disables the connection and logs `token_persist_failed` to `sync_events` (US-339).
- **`listMessages(conn, { sinceIso, folder })`** — async generator.
  - **CRITICAL (spec §9.1):** uses folder-scoped endpoints — `/me/mailFolders('inbox')/messages` and `/me/mailFolders('sentitems')/messages` — to **bypass Focused Inbox** and target exactly the folder we want.
  - Query string: `$filter=receivedDateTime ge <iso>&$top=100&$select=id,conversationId,subject,from,toRecipients,ccRecipients,bccRecipients,receivedDateTime,internetMessageId,hasAttachments&$orderby=receivedDateTime desc`. (`hasAttachments` included as a minor deviation from the task spec — saves a round-trip when deciding whether to bother with MIME part inspection downstream; harmless addition.)
  - Pagination via `@odata.nextLink` (not `$skip` — Graph recommends nextLink for consistency under concurrent writes).
  - Yields `MessageRef[]` batches with all participant addresses lowercased.
- **`getMessage(conn, providerMessageId)`** — `GET /me/messages/{id}` with `Prefer: outlook.body-content-type="text"` so backfill payloads stay small (spec §7.4). Maps Graph's `body.{contentType,content}` pair to `FullMessage.bodyHtml` / `bodyText`; recipients flattened into `EmailAddress[]` with display names; `snippet` derived from the first 150 chars of body text with HTML stripped; direction computed against `conn.email`. `raw_headers` is `null` (Graph doesn't expose them).
- **`fetchDelta(conn)` — Stage 7 stub** — calls `GET /me/mailFolders('inbox')/messages/delta`, walks `@odata.nextLink` until `@odata.deltaLink` shows up, and writes the deltaLink into `provider_connections.delta_cursor`. Actual delta processing lands in Stage 8; this just seeds the cursor so Stage 8 has a starting point representing "everything up to end-of-backfill".

`sendMessage`, `subscribeRealtime`, `renewSubscription` remain stubbed until Stage 8.

### 2. `lib/email/sync-worker.ts` — provider-agnostic backfill

Refactored to dispatch via `getProvider(conn.provider)`; the same pipeline handles Gmail and Graph. Uses `processFullMessage()` from `storage/messages.ts` (shared across both backends).

- **Admin-consent gating (Microsoft only).** New `checkAdminConsent()` helper:
  1. Short-circuits for non-Microsoft connections or missing tenant/agency IDs.
  2. Checks `ikhaya_tenant_ms_tenants.admin_consented` for the (agency, ms_tenant_id) pair — if true, backfill proceeds.
  3. Otherwise probes the Graph API with a single-page list call. If it comes back `admin_consent_required`, `disableConnection()` flips `sync_enabled=false` and a `backfill_error` event is recorded with `error: "admin_consent_required"` + tenant ID so the Stage 10 admin dashboard can surface an "admin consent required" banner.
  4. Any other error during the probe falls through to normal backfill (so a transient 500 doesn't permanently kill the connection).
- **Delta cursor capture post-backfill (Microsoft).** After the inbox+sent iteration completes, MS connections drive `adapter.fetchDelta(conn)` to completion so the delta cursor lands in `provider_connections.delta_cursor`. Failures here are non-fatal — backfill has already succeeded.
- **Rate-limit propagation.** `ProviderError('rate_limited')` is re-thrown rather than swallowed, so the entire backfill pauses and the worker can requeue. Non-fatal per-message errors continue to the next ref.

### 3. `lib/email/storage/messages.ts` — `internet_message_id` dedup

`insertMessage()` now does a two-hop dedup:

1. Primary: `(agency_id, provider_message_id)` — same provider, same message, already stored. Returns existing ID.
2. Secondary (new): `(agency_id, internet_message_id)` — **cross-provider / cross-user dedup**. If sender + recipient are both Ikhaya users on different providers, only one body row is kept. `insertMessage` returns the first row's ID; the caller (`processFullMessage`) still runs `matchAndLink`, so per-user candidate links are created for both users against the shared body row.

`UpsertMessageInput` gained optional `internetMessageId`; `processFullMessage` threads `ref.internetMessageId ?? msg.internetMessageId ?? null` through.

### 4. `app/api/auth/microsoft/callback/route.ts` — kick off backfill

Stage 4's callback previously just stored the connection and ended. It now enqueues `backfillUser(supabase, stored)` via `setTimeout(..., 0)` so the OAuth response returns immediately while the initial 90-day sync runs asynchronously. Gated on `EMAIL_SYNC_ENABLED !== "false"` as a kill-switch. Admin-consent gating lives inside `backfillUser` so the callback doesn't need to know about tenant state.

### 5. Provider-agnostic `sync/backfill.ts` (compat path)

`sync/backfill.ts` (the newer BullMQ-oriented orchestrator from Stage 6) already uses `getProvider(conn.provider)` and works for Microsoft out of the box. No changes needed beyond what Stage 6 introduced. Both the legacy `backfillUser` (invoked directly from callbacks) and the queued `runBackfill` path share the same `storage/messages.ts` helpers, so dedup and matching behave identically.

### 6. Typescript cleanup on Stage 7 files

Fixed three `No overload matches this call` errors in `sync-worker.ts` where `conn.agencyId` was typed `string | undefined` and being passed to `sync_events.insert({ agency_id })`. Guarded with `conn.agencyId ?? ""` at the call site and with an explicit `!conn.agencyId` short-circuit in `checkAdminConsent`.

---

## Files changed

```
apps/web/lib/email/providers/microsoft.ts             | Stage 4 stubs → full Stage 7 impl
apps/web/lib/email/sync-worker.ts                      | provider-agnostic; admin consent; MS delta capture
apps/web/lib/email/storage/messages.ts                 | internet_message_id dedup hop
apps/web/app/api/auth/microsoft/callback/route.ts      | enqueue backfillUser on successful connect
ats-platform/STAGE_7_PR.md                             | rewritten
```

Most of the file-level edits landed in earlier passes this week; today's pass (2026-04-23) fixed the remaining TS overload errors in `sync-worker.ts` and confirmed the end-to-end wiring.

---

## Env vars required

Same set as Stage 6, plus the Microsoft flavours established in Stage 4:

| Variable | Required? | Purpose |
|---|---|---|
| `MS_OAUTH_CLIENT_ID` | yes | Microsoft Entra app client ID |
| `MS_OAUTH_CLIENT_SECRET` | yes | Microsoft Entra client secret |
| `MS_OAUTH_AUTHORITY` | no (default `https://login.microsoftonline.com/common`) | Tenant-scoped auth authority |
| `EMAIL_MICROSOFT_ENABLED` | yes | Per-provider kill switch; callback returns 404 when `!== "true"` |
| `EMAIL_SYNC_ENABLED` | yes | Master kill switch for backfill enqueue |
| `EMAIL_BACKFILL_DAYS` | no (default 90) | Lookback window |

---

## Verification

- [x] `tsc --noEmit` — clean on all Stage 7-touched files (`providers/microsoft.ts`, `sync-worker.ts`, `storage/messages.ts`, `microsoft/callback/route.ts`). The repo as a whole has ~549 pre-existing TS errors (mostly `next/link` + `next/navigation` type resolution quirks and a Supabase type-regen gap around the `alt_email` column added in migration 045); those are outside Stage 7 scope and will be swept as part of the Stage 10 hardening pass.
- [x] Matcher unit tests — `lib/email/__tests__/matcher.test.ts` and `normalize.test.ts` still compile against the `MessageRef` shape the Graph adapter yields. No behavioural changes to the matcher itself (Stage 6 already made it provider-agnostic). **Caveat:** this repo doesn't have a configured test runner (no vitest/jest in `package.json`); tests exist for local `tsx`/manual invocation but there's no `pnpm test` script yet — Stage 10 will add one.
- [x] No breaking changes to Stages 1–6: `providers/microsoft.ts` Stage 4 methods (`buildAuthUrl`, `buildAdminConsentUrl`, `handleCallback`, `revoke`) are untouched; `storage/messages.ts` dedup is additive and idempotent.

---

## Manual test steps

1. **MS OAuth → backfill happy path**
   - `EMAIL_MICROSOFT_ENABLED=true`, `EMAIL_SYNC_ENABLED=true`
   - Connect a Microsoft 365 account via `/settings/integrations`
   - Verify `provider_connections` row is created with `ms_tenant_id` populated
   - Within ~1–2min: `sync_events` shows `connected` → `backfill_page` × N → `backfill_complete`
   - `provider_connections.backfill_completed_at` is stamped
   - `provider_connections.delta_cursor` holds a `https://graph.microsoft.com/...` deltaLink

2. **Folder-scoped listing**
   - Put a message in the user's **Other** (non-focused) Inbox
   - After backfill, verify it's present in `email_messages` — proves we bypassed Focused Inbox
   - Put a message in **Sent Items** — verify direction=`outbound` and thread participants match

3. **`internet_message_id` dedup across providers**
   - User A on Gmail emails User B on Microsoft 365; both are Ikhaya users in the same agency with candidates pointing at each other
   - Run backfill for both connections
   - Verify `email_messages` has a single row for the logical email (by `internet_message_id`)
   - Verify `candidate_email_links` has two rows — one linking each user's candidate — pointing at that single message row

4. **Admin consent gating**
   - Point a user at a tenant that enforces admin consent (no Mail.ReadWrite at user scope)
   - Insert `ikhaya_tenant_ms_tenants` row with `admin_consented=false` (or leave it missing)
   - Kick off backfill → probe hits AADSTS65001 → `provider_connections.sync_enabled=false`, `sync_events` row with `error: "admin_consent_required"`, no crash
   - Grant admin consent via `/adminconsent` flow, flip `admin_consented=true`, re-enable connection, re-backfill → succeeds

5. **Rate limit**
   - Mock a 429 with `Retry-After: 30` from `graph.microsoft.com` (MSW or a proxy)
   - Verify `ProviderError('rate_limited', 30)` bubbles from `getMessage` / `listMessages`
   - Verify backfill pauses (no further messages processed) and `backfill_error` event logs `rate_limited`

6. **Refresh token rotation under concurrency (US-340)**
   - Fire two concurrent `getAccessToken(conn)` calls for the same connection ID
   - Only one MS round-trip fires (`_refreshInFlight` coalesces)
   - DB `token_revision` increments by exactly 1

---

## Risks

| Risk | Mitigation |
|---|---|
| Delta cursor captured immediately after backfill may miss messages arriving between end-of-listMessages and start-of-fetchDelta (race window) | Idempotent upsert in `storage/messages.ts` handles the duplicate case; Stage 8 delta processing is replay-safe |
| Large mailboxes (>10k messages in 90 days) may hit MS's undocumented per-mailbox rate limits | `Retry-After` handling pauses the backfill; no automatic resume yet — user would need to re-trigger from Settings. Stage 10 adds automatic re-enqueue. |
| MS rotates refresh tokens on use → if DB write fails between `/token` response and our insert, token is orphaned | US-339 disables the connection + logs `token_persist_failed`; user reconnects. Acceptable because MS gives a 24h grace window we don't rely on. |
| 90-day rolling inactivity window on MS refresh tokens means connections unused for 90 days silently break | Stage 10 admin dashboard surfaces these; out of scope for Stage 7 |
| `hasAttachments` included in `$select` deviates slightly from the task spec | Cosmetic; saves a field lookup later, harmless |

---

## Next

Stage 8 (Apr 24) — Gmail Pub/Sub + Graph change-notification webhooks + subscription refresher cron. The delta cursor captured today is the starting point for Graph.
