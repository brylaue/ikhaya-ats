# Email Sync Operational Runbook

This document provides operational guidance for managing the email sync system in production.

## System Overview

The email sync system integrates Gmail and Microsoft 365 mailboxes with candidate profiles. Emails are automatically matched to candidates based on:
1. **Exact matches** - email address exactly matches candidate record
2. **Domain aliases** - gmail.com ↔ googlemail.com normalization
3. **Cross-provider threading** - internet-message-id matching across providers
4. **Fuzzy matches** - user-reviewed potential matches (pending_review status)

## Common Tasks

### Force Backfill for a User

Backfill retroactively syncs historical emails (default: 90 days).

**Via API:**
```bash
curl -X POST https://your-app.com/api/email/backfill \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json"
```

**Process:**
1. Validates user authentication
2. Queries 90-day email window from Gmail/Graph API
3. Matches emails to candidates
4. Sets `backfill_completed_at` timestamp
5. Returns 202 (accepted) immediately

### Refresh Subscriptions

Realtime subscriptions (Pub/Sub, Graph webhooks) expire and must be renewed.

**Setup cron job:**
```bash
# Every 12 hours
0 */12 * * * curl -X POST https://your-app.com/api/email/refresh-subscriptions \
  -H "Authorization: Bearer $CRON_SECRET"
```

**Process:**
1. Queries connections with `realtime_expires_at < NOW() + 2 days`
2. Calls `renewSubscription()` on each adapter
3. Updates `realtime_expires_at` in database
4. Logs errors to console

### Disconnect a User's Email

Force disconnect for a specific user (admin only).

**Via API:**
```bash
curl -X POST https://your-app.com/api/admin/email/disconnect \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-id-here",
    "provider": "google"
  }'
```

**Process:**
1. Validates caller is agency owner
2. Finds connection by user_id and provider
3. Revokes token with provider
4. Deletes provider_connections row
5. Skips sync until user reconnects

### Rotate Encryption Keys

To rotate token encryption keys:

1. Add new key to Web Crypto keystore
2. Create migration script that:
   - Queries all `provider_connections` rows
   - Decrypts with old key
   - Re-encrypts with new key
   - Updates `refresh_token` column
3. Run migration
4. Remove old key from keystore

**Example:**
```typescript
// Migration script
const oldKey = await importKey(oldKeyMaterial);
const newKey = await importKey(newKeyMaterial);

const connections = await supabase
  .from('provider_connections')
  .select('id, refresh_token')
  .not('refresh_token', 'is', null);

for (const conn of connections) {
  const decrypted = decrypt(conn.refresh_token, oldKey);
  const reencrypted = encrypt(decrypted, newKey);
  
  await supabase
    .from('provider_connections')
    .update({ refresh_token: reencrypted })
    .eq('id', conn.id);
}
```

### Purge Email Data

Delete all synced email for agency (destructive, no undo).

**Via API:**
```bash
curl -X POST https://your-app.com/api/admin/email/purge \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json"
```

**Deletes:**
- `email_messages` (all rows for agency)
- `email_threads` (all rows for agency)
- `candidate_email_links` (all rows for agency)
- `sync_events` (all rows for agency)

**Does NOT delete:**
- `provider_connections` (keep user's auth tokens)

### Export Email Data

Export connections and sync events for backup or audit.

**Via API:**
```bash
curl https://your-app.com/api/admin/email/export \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -o email-export.zip
```

**ZIP contains:**
- `connections.json` - provider_connections metadata (NO tokens)
- `sync_events.csv` - all sync event logs

## Sync Health Checks

### Check Last Sync Time

```sql
SELECT 
  pc.provider_email,
  pc.provider,
  se.event_type,
  se.created_at,
  se.messages_processed,
  se.matches_created
FROM provider_connections pc
LEFT JOIN sync_events se ON pc.id = se.provider_connection_id
ORDER BY se.created_at DESC
LIMIT 20;
```

### Check for Stuck Syncs

```sql
SELECT 
  pc.id,
  pc.provider_email,
  pc.provider,
  COUNT(se.id) as recent_events,
  MAX(se.created_at) as last_event
FROM provider_connections pc
LEFT JOIN sync_events se ON pc.id = se.provider_connection_id
  AND se.created_at > NOW() - INTERVAL '24 hours'
GROUP BY pc.id, pc.provider_email, pc.provider
HAVING MAX(se.created_at) IS NULL
ORDER BY pc.created_at DESC;
```

### Check for Token Errors

```sql
SELECT 
  agency_id,
  provider,
  error_code,
  COUNT(*) as error_count,
  MAX(created_at) as last_error
FROM sync_events
WHERE error_code IS NOT NULL
GROUP BY agency_id, provider, error_code
ORDER BY last_error DESC;
```

## Common Error Codes

| Code | Meaning | Fix |
|------|---------|-----|
| `invalid_grant` | Token expired or revoked | User must reconnect |
| `rate_limited` | API rate limit exceeded | Backoff and retry |
| `not_found` | Message ID not found | May indicate data deletion on provider |
| `api_error` | Generic API error | Check provider status |
| `invalid_config` | Missing env vars | Verify env configuration |

## Debugging

### Enable Verbose Logging

1. Add `console.error()` statements in adapters
2. Check Supabase logs for errors
3. Monitor `sync_events` table for `error_message`

### Test Pub/Sub Webhook

```bash
curl -X POST https://your-app.com/api/email/pubsub \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "data": "'$(echo -n '{"emailAddress":"user@gmail.com","historyId":"123"}' | base64)'"
    }
  }'
```

### Test Graph Webhook Validation

```bash
curl "https://your-app.com/api/email/graph-webhook?validationToken=test-token"
# Should return: test-token
# With Content-Type: text/plain
```

## Monitoring

### Metrics to Track

- **Backfill completion rate** - % of users with `backfill_completed_at` set
- **Match rate** - `matches_created / messages_processed`
- **Error rate** - `count(error_code) / total_sync_events`
- **Realtime latency** - Time between email received and sync completed
- **Subscription renewal success** - % of subscriptions renewed before expiration

### Alerts to Set Up

- Sync errors exceed 5% in last 24 hours
- Subscription renewal fails for >1 user
- Backfill takes >30 minutes
- Fuzzy review queue exceeds 100 items

## Disaster Recovery

### Restore from Backup

1. Restore `provider_connections` table (keeps user auth)
2. Restore `sync_events` table (audit trail)
3. Clear `email_messages`, `email_threads`, `candidate_email_links` (will be rebuilt)
4. Trigger backfill for affected users

### Revoke All Tokens

If security breach suspected:

```sql
DELETE FROM provider_connections WHERE provider = 'google';
DELETE FROM provider_connections WHERE provider = 'microsoft';
```

Then users must reconnect, and backfill will be re-triggered.

## Performance Tuning

### Backfill Too Slow

- Reduce `EMAIL_BACKFILL_DAYS` env var
- Batch process users (queue + worker pattern)
- Paginate API calls (already done, but verify)

### Matcher Too Slow

- Add index on `candidates.email`, `candidates.alt_email`
- Increase `EMAIL_BACKFILL_DAYS` window gradually
- Cache domain aliases in memory

### High Memory Usage

Backfill loads messages in memory. Mitigate:
- Process users sequentially (current design)
- Use streaming if > 10K messages/user
- Archive old `sync_events` to cold storage

## Related Documentation

- [Email Architecture](../IMPLEMENTATION_SUMMARY.md) - System design overview
- [OAuth Configuration](../STAGE_PLAN.md) - Provider setup guide
- [Type Definitions](../lib/types/email/provider.ts) - Interface reference
