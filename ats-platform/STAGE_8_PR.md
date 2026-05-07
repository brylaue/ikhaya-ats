# Stage 8: Realtime Push — Gmail Pub/Sub + Graph Webhooks

## Summary

Implements near-realtime email sync via Google Pub/Sub watch and Microsoft Graph webhook subscriptions. New emails matching candidates appear on timelines within ~60 seconds of delivery.

This stage was the most integration-heavy of the 10. To keep quality high, some items were deferred to Stage 8b (see "Deferred" below).

---

## Files Added

### `lib/email/sync/subscription.ts` (NEW)
Subscription orchestrator — single entry point `subscribeFor(connectionId)`:
- Loads the connection, picks the correct adapter (Gmail / Graph)
- Calls `adapter.subscribeRealtime()` with proper params
- For Microsoft: builds HMAC `clientState` for webhook verification
- Stores subscription handle (`realtime_subscription_id` + `realtime_expires_at`) on the connection row
- For Google: also stores `historyId` as `delta_cursor`

### `app/api/email/pubsub/route.ts` (REWRITTEN)
Gmail Pub/Sub push handler:
- **JWT verification**: Validates Google-signed Bearer token from `Authorization` header using Google's OIDC public keys (cached 1 hour). Checks `aud` matches `GOOGLE_PUBSUB_AUDIENCE`.
- Base64-decodes `{emailAddress, historyId}` from Pub/Sub envelope
- Looks up `provider_connections` by email
- Calls `fetchDelta()` → processes through `processFullMessage` pipeline
- Returns 204 on success (per Pub/Sub best practice)
- Always ACKs (returns 2xx) to prevent retry storms on permanent errors

### `app/api/email/graph-webhook/route.ts` (EXISTING — unchanged)
Microsoft Graph webhook handler:
- GET: echoes `validationToken` as `text/plain` (Graph handshake)
- POST: verifies HMAC `clientState`, calls `fetchDelta()`, returns 202
- All messages routed through `processFullMessage` for idempotent upsert

### `app/api/cron/email-refresh-subscriptions/route.ts` (NEW)
Cron endpoint for subscription renewal (every 6h via Vercel Cron):
- Accepts both Vercel cron header and Bearer token auth
- Delegates to `refreshExpiredSubscriptions()`
- Supports GET (Vercel default) and POST

### `app/api/cron/email-fallback-poll/route.ts` (NEW)
Fallback poller cron (every 5 min):
- Queries connections where `realtime_expires_at IS NULL OR < now()`
- For each, calls `fetchDelta` → `processFullMessage` pipeline
- Ensures no mail is missed when push subscriptions are down or expired
- Logs `fallback_poll` sync events for observability

### `vercel.json` (NEW)
Cron schedule:
- `/api/cron/email-refresh-subscriptions` — every 6 hours (`0 */6 * * *`)
- `/api/cron/email-fallback-poll` — every 5 minutes (`*/5 * * * *`)

---

## Files Modified

### `lib/email/gmail-adapter.ts`
- **`subscribeRealtime()`**: Implemented. Calls `users.watch` with `topicName = projects/<GOOGLE_PUBSUB_PROJECT_ID>/topics/<GOOGLE_PUBSUB_TOPIC>`, `labelIds=['INBOX','SENT']`. Returns `{id: historyId, expiresAt, metadata: {historyId}}`.
- **`renewSubscription()`**: Simplified to delegate to `subscribeRealtime()` (Gmail watch is idempotent — re-calling renews).

### `lib/email/graph-adapter.ts`
- **`subscribeRealtime()`**: Implemented. Creates TWO Graph subscriptions — one for `/me/mailFolders('inbox')/messages` and one for `/me/mailFolders('sentitems')/messages`. Uses HMAC `clientState`, 70h expiry (under Graph's 72h max). Subscription IDs stored as JSON array.
- **`renewSubscription()`**: Rewritten. PATCHes each existing subscription with new `expirationDateTime`. If no existing sub, creates fresh. Returns `{id: JSON.stringify([...ids]), expiresAt}`.
- **`fetchDelta()`**: Added 410 Gone handling — clears `delta_cursor` and throws `ProviderError("delta_expired")` to trigger re-backfill.

### `lib/email/subscription-refresher.ts`
- Renewal window changed from 48h to 12h per spec (`realtime_expires_at < now() + 12h`).

---

## Env Vars (Stage 8 additions)

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_PUBSUB_PROJECT_ID` | Yes (Gmail push) | GCP project ID for Pub/Sub |
| `GOOGLE_PUBSUB_TOPIC` | Yes (Gmail push) | Pub/Sub topic name (e.g., `gmail-push`) |
| `GOOGLE_PUBSUB_AUDIENCE` | Recommended | Expected JWT `aud` for verifying Pub/Sub pushes |
| `MS_GRAPH_WEBHOOK_URL` | Yes (Graph push) | Public URL for Graph webhook endpoint |
| `MS_GRAPH_WEBHOOK_CLIENT_STATE_SECRET` | Yes (Graph push) | HMAC secret for verifying Graph `clientState` |
| `CRON_SECRET` | Yes | Bearer token for cron endpoints |

---

## Database Changes

None in this stage. The existing `provider_connections` columns (`realtime_subscription_id`, `realtime_expires_at`, `delta_cursor`) are sufficient. Microsoft's dual subscription IDs are stored as a JSON-stringified array in `realtime_subscription_id`.

**Note**: If we need to query individual subscription IDs (e.g., for targeted deletion), a migration 005 adding a `realtime_subscription_ids jsonb` column would be cleaner. Deferred to Stage 8b.

---

## Idempotency

All writes flow through `processFullMessage` → `insertMessage` (from Stage 6), which checks for existing rows by `(agency_id, provider_message_id)` and returns null on duplicates. The `23505` unique violation is also caught as a fallback. This means:
- Pub/Sub replays (Google retries on non-2xx) produce no duplicates
- Graph notification retries produce no duplicates
- Overlapping cron + push processing is safe

---

## Manual Testing

### Gmail Pub/Sub
1. Set up ngrok: `ngrok http 3000`
2. Configure `GOOGLE_PUBSUB_AUDIENCE` and Pub/Sub push subscription URL to ngrok
3. Connect a real Gmail account via OAuth
4. Call `subscribeFor(connectionId)` (or hit a test endpoint)
5. Send yourself a test email matching a candidate
6. Verify it appears in `candidate_email_links` within ~60s
7. Check `sync_events` for `delta_sync` entry

### Graph Webhooks
1. Set up ngrok: `ngrok http 3000`
2. Set `MS_GRAPH_WEBHOOK_URL` to ngrok URL + `/api/email/graph-webhook`
3. Connect a Microsoft 365 account via OAuth
4. Call `subscribeFor(connectionId)` — verify validationToken echo succeeds
5. Send test email; verify delta fetch runs
6. Check both inbox AND sent subscriptions were created (check logs)

### Subscription Refresh
1. Manually POST to `/api/cron/email-refresh-subscriptions` with `Authorization: Bearer $CRON_SECRET`
2. Verify `realtime_expires_at` advances for both providers
3. Check logs for renewal confirmation

### Fallback Poller
1. Set a connection's `realtime_expires_at` to the past
2. POST to `/api/cron/email-fallback-poll` with cron secret
3. Verify `fetchDelta` runs and messages are processed
4. Check `sync_events` for `fallback_poll` entry

---

## Deferred to Stage 8b

1. **Migration 005** for `realtime_subscription_ids jsonb` column — currently using JSON string in existing text column
2. **Comprehensive idempotency test** with mock Pub/Sub replay + Graph retry scenarios
3. **`providers/google.ts` and `providers/microsoft.ts`** Stage 8 method implementations — currently the "clean" provider stubs still throw `NotImplementedError`; the working adapters are in `gmail-adapter.ts` / `graph-adapter.ts`
4. **Rate limiting** on webhook endpoints (defense against replay attacks)
5. **Vercel Cron alternative docs** for non-Vercel deployments (e.g., Supabase scheduled functions, GitHub Actions)

---

## Risks

- **Clock skew**: JWT verification uses `exp` claim — if server clock is significantly off, valid pushes may be rejected. Mitigation: Google OIDC tokens have generous validity windows.
- **Graph subscription limit**: Microsoft limits subscriptions per app. With dual subscriptions per connection (inbox + sent), we use 2x connections count. At scale, consider consolidating to `/me/messages` resource (loses folder granularity).
- **Fallback poller load**: Every 5 minutes across all connections without active subscriptions could be heavy. The poller should be monitored and potentially rate-limited in Stage 10.
