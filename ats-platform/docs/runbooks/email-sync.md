# Email Sync Operational Runbook

Production operations guide for the Ikhaya email sync system (Gmail + Microsoft 365).

---

## 1. Pub/Sub Outage (Gmail Push Notifications)

### Detection

- Gmail push notifications stop arriving at `/api/email/pubsub`
- Check Google Cloud Console > Pub/Sub > Topic `gmail-push` > Metrics
- Look for: zero message throughput, elevated error rate
- In Supabase: no new `sync_events` with `event_type='webhook'` and `provider='google'` in the last hour

```sql
SELECT COUNT(*) AS recent_webhooks
FROM sync_events
WHERE provider = 'google'
  AND event_type = 'webhook'
  AND created_at > NOW() - INTERVAL '1 hour';
```

### Response: Force-Poll Fallback

The cron at `/api/cron/email-fallback-poll` already runs on a schedule. To trigger it manually:

```bash
curl -X POST https://app.ikhaya.io/api/cron/email-fallback-poll \
  -H "Authorization: Bearer $CRON_SECRET"
```

This will:
1. Query all `provider_connections` where `provider='google'` and `sync_enabled=true`
2. For each, call `fetchDelta()` using the stored `delta_cursor` (historyId)
3. Process any new messages through the matcher
4. Update the cursor

### Recovery

Once Pub/Sub is healthy again, webhooks will resume automatically. Verify by checking for new `webhook` events in `sync_events`. No re-subscription needed unless the subscription itself was deleted.

If the Pub/Sub subscription was deleted:
```bash
gcloud pubsub subscriptions create gmail-push-sub \
  --topic=gmail-push \
  --push-endpoint=https://app.ikhaya.io/api/email/pubsub
```

---

## 2. Graph Throttling Avalanche (Microsoft 365)

### Detection

- Multiple `ProviderError(code='rate_limited')` in logs
- `sync_events` show `event_type='sync_error'` with `detail.code='rate_limited'` for many users
- Graph API returns HTTP 429 with `Retry-After` header

```sql
SELECT user_id, COUNT(*) AS error_count, MAX(created_at) AS last_error
FROM sync_events
WHERE provider = 'microsoft'
  AND event_type LIKE '%error%'
  AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY user_id
ORDER BY error_count DESC
LIMIT 20;
```

### Response: Backoff Tuning

The Graph adapter uses exponential backoff with jitter. If throttling is severe:

1. **Pause non-critical syncs** — Set `EMAIL_MICROSOFT_ENABLED=false` in env to halt all Microsoft syncs temporarily.

2. **Reduce concurrency** — If running multiple backfills, reduce to sequential processing. The sync worker respects `Retry-After` headers, but too many concurrent workers can overwhelm the budget.

3. **Circuit breaker** — The adapter tracks consecutive 429s per connection. After 5 consecutive 429s, it marks the connection with `error_state='rate_limited'` and stops retrying for 15 minutes. Check:

```sql
SELECT id, email, error_state
FROM provider_connections
WHERE provider = 'microsoft'
  AND error_state = 'rate_limited';
```

4. **Clear circuit breaker** — Once throttling subsides, clear the error state:

```sql
UPDATE provider_connections
SET error_state = NULL
WHERE provider = 'microsoft'
  AND error_state = 'rate_limited';
```

### Prevention

- Stagger backfills across users (don't trigger 50 at once)
- Use delta queries instead of full re-backfills where possible
- Monitor Graph API throttling limits: 10,000 requests per 10 minutes per app per tenant

---

## 3. Mass Refresh-Token Revocation

### Detection

- Spike in `ProviderError(code='invalid_grant')` errors
- Many users suddenly showing error banners
- Common causes: user changed password, admin revoked app consent, app registration secrets rotated

```sql
SELECT provider, COUNT(*) AS revoked_count
FROM provider_connections
WHERE error_state = 'invalid_grant'
GROUP BY provider;
```

### Identification

Determine scope — is it one user, one MS tenant, or all users?

```sql
-- Per-tenant breakdown (Microsoft)
SELECT ms_tenant_id, COUNT(*) AS affected
FROM provider_connections
WHERE provider = 'microsoft'
  AND error_state = 'invalid_grant'
GROUP BY ms_tenant_id;
```

### Response

1. **Single user** — User must reconnect. The error banner in the UI prompts them automatically.

2. **Entire MS tenant** — The tenant admin likely revoked consent. Check:
   ```sql
   SELECT * FROM ikhaya_tenant_ms_tenants
   WHERE ms_tenant_id = '<affected_tenant>';
   ```
   If `admin_consented = false`, the admin revoked. Go to Admin Dashboard > MS Tenant Consent > "Request admin consent" to re-trigger.

3. **All Google users** — Check if the Google OAuth client secret was rotated. If so:
   - Update `GOOGLE_OAUTH_CLIENT_SECRET` in env
   - Existing refresh tokens remain valid if only the client secret changed
   - If the client ID changed, all users must reconnect

4. **Surface to users** — The `EmailSyncErrorBanner` component shows `invalid_grant` errors automatically. Users see "Reconnect Gmail" or "Reconnect Outlook" with a one-click fix.

---

## 4. Delta Cursor Expiry

### Detection

- Google: `historyId` expires after ~7 days of inactivity
- Microsoft: `deltaLink` expires after ~30 days of inactivity
- Error: `ProviderError(code='delta_expired')` or Google API returns `historyId is no longer valid`

```sql
SELECT id, provider, email, delta_cursor, updated_at
FROM provider_connections
WHERE error_state = 'delta_expired'
   OR (sync_enabled = true AND updated_at < NOW() - INTERVAL '25 days');
```

### Response: Re-Backfill

When a delta cursor expires, the connection needs a fresh backfill:

1. **Clear the cursor and error state:**
```sql
UPDATE provider_connections
SET delta_cursor = NULL,
    backfill_completed_at = NULL,
    error_state = NULL
WHERE id = '<connection_id>';
```

2. **Trigger a backfill:**
```bash
curl -X POST https://app.ikhaya.io/api/email/backfill \
  -H "Authorization: Bearer $USER_TOKEN"
```

3. **For bulk re-backfill** (many expired cursors):
```sql
-- Clear all expired cursors
UPDATE provider_connections
SET delta_cursor = NULL, backfill_completed_at = NULL, error_state = NULL
WHERE error_state = 'delta_expired';
```
Then let the fallback poll cron pick them up on the next run.

### Prevention

- The subscription refresher cron runs every 12 hours and triggers delta polls
- Users who don't log in for >25 days should have their cursors proactively refreshed
- Consider a weekly cron that delta-polls ALL connections, not just those with webhooks

---

## 5. Webhook URL Change

### When This Happens

- Domain change (e.g., `app.ikhaya.io` → `new.ikhaya.io`)
- Path change (e.g., restructuring API routes)
- SSL certificate change (rare, but Graph verifies the cert)

### Gmail (Pub/Sub)

Gmail push uses Pub/Sub, so the webhook URL is the Pub/Sub push endpoint, not a direct Gmail URL.

1. **Update the Pub/Sub subscription:**
```bash
gcloud pubsub subscriptions update gmail-push-sub \
  --push-endpoint=https://NEW-DOMAIN/api/email/pubsub
```

2. **No per-user changes needed** — Gmail watches point to the Pub/Sub topic, not to your endpoint directly.

### Microsoft Graph

Graph subscriptions contain the direct notification URL. Every existing subscription must be re-created.

1. **Delete all existing subscriptions:**
```sql
UPDATE provider_connections
SET realtime_subscription_id = NULL, realtime_expires_at = NULL
WHERE provider = 'microsoft';
```

2. **Update the webhook URL** in your env config:
```
MS_WEBHOOK_URL=https://NEW-DOMAIN/api/email/graph-webhook
```

3. **Trigger re-subscription** by calling the refresh cron:
```bash
curl -X POST https://NEW-DOMAIN/api/cron/email-refresh-subscriptions \
  -H "Authorization: Bearer $CRON_SECRET"
```

This will iterate all Microsoft connections and call `subscribeRealtime()` with the new URL.

4. **Verify:** Check that new `sync_events` with `event_type='subscription_renewed'` appear within minutes.

---

## Quick Reference: Environment Variables

| Variable | Purpose |
|----------|---------|
| `EMAIL_GOOGLE_ENABLED` | Feature flag for Gmail sync |
| `EMAIL_MICROSOFT_ENABLED` | Feature flag for Microsoft sync |
| `EMAIL_SYNC_ENABLED` | Global kill-switch |
| `EMAIL_TOKEN_ENCRYPTION_KEY` | AES-256-GCM key for token encryption |
| `GOOGLE_OAUTH_CLIENT_ID` | Google OAuth client |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google OAuth secret |
| `MS_OAUTH_CLIENT_ID` | Microsoft OAuth client |
| `MS_OAUTH_CLIENT_SECRET` | Microsoft OAuth secret |
| `MS_WEBHOOK_URL` | Graph webhook endpoint |
| `GOOGLE_PUBSUB_TOPIC` | Pub/Sub topic for Gmail push |
| `CRON_SECRET` | Auth token for cron endpoints |

## Quick Reference: Key Tables

| Table | Purpose |
|-------|---------|
| `provider_connections` | One row per user+provider; holds cursor, subscription, error state |
| `email_messages` | All synced messages (body inline for v1) |
| `email_threads` | Thread groupings |
| `candidate_email_links` | Message ↔ candidate matches |
| `sync_events` | Append-only audit/observability log |
| `ikhaya_tenant_ms_tenants` | MS tenant admin consent tracking |
| `metrics_email_sync` | Daily/per-sync metric snapshots |
