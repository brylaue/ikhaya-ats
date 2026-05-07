# Stage 10: Admin Dashboard, Data Purge, Export, Metrics & Hardening

## Summary

Final stage of the 10-day email integration rollout. Delivers admin controls, data lifecycle management (GDPR export + right-to-be-forgotten), operational tooling, and error UX polish.

## Files Added

### Admin Dashboard

- **`app/(dashboard)/settings/admin/email-integrations/page.tsx`** — Admin-only page with:
  - Aggregate KPI strip: total connections, messages (24h), avg freshness, error rate
  - User table: all agency users with Google/Microsoft connection state, last sync, messages synced (7d)
  - Filter chips: All, Google only, Microsoft only, Sync paused, Never connected
  - Force-disconnect buttons per user per provider
  - MS Tenant admin-consent panel showing all linked tenants, consent status, and "Request consent" button

- **`app/api/admin/email-integrations/route.ts`** — `GET` endpoint backing the admin dashboard. Returns users, KPIs, and MS tenant info. Admin-role gated.

- **`app/api/admin/email-integrations/force-disconnect/route.ts`** — `POST` endpoint. Admin force-disconnects a user: revokes token, purges all synced data via `purgeUserData()`.

### Data Purge

- **`lib/email/sync/purge.ts`** — Two purge functions:
  - `purgeUserData(userId, provider)` — Deletes candidate_email_links, email_messages, orphaned threads, provider_connections row, and records an audit event.
  - `purgeCandidateEmailData(candidateId)` — RTBF cascade: deletes links for a candidate, deletes orphaned messages, records audit event.

- Modified **`app/api/integrations/email/disconnect/route.ts`** — Replaced Stage 5 purge stub with real `purgeUserData()` call.

### Candidate Deletion Cascade (RTBF)

- **`app/api/candidates/[id]/delete-cascade/route.ts`** — `DELETE` endpoint that purges email data before deleting the candidate record.

### Data Export (GDPR Subject Access)

- **`app/api/integrations/email/export/route.ts`** — `POST` endpoint. Packages user's email messages, connections, and candidate links into a ZIP (JSON format). Returns the ZIP directly. v1.1 will enqueue to S3 with signed URL.

### Error UX Banner

- **`components/email/EmailSyncErrorBanner.tsx`** — Persistent banner component. Checks `error_state` on `provider_connections`:
  - `invalid_grant` → "Reconnect Gmail/Outlook"
  - `admin_consent_required` → "Ask your IT admin"
  - `rate_limited` → "Sync paused — will retry"
  - Dismissible per-session; reappears on next login if still in error

- Modified **`app/(dashboard)/layout.tsx`** — Added `EmailSyncErrorBanner` above page content.

### Metrics

- **`packages/db/migrations/012_email_stage10_metrics.sql`** — Creates `metrics_email_sync` table and adds `error_state` column to `provider_connections`.

- **`lib/email/sync/metrics.ts`** — `emitSyncMetrics()` and `computeAgencyMetrics()` functions for recording sync health snapshots.

- Modified **`app/(dashboard)/analytics/page.tsx`** — Added "email-sync" tab with KPI cards (connections, messages, match rate, freshness P50, activation rate, errors) and a sync activity chart using existing recharts components.

### Load Test

- **`scripts/load-test-email.ts`** — Ad-hoc script simulating 50 concurrent backfills. Reports success rate, latency percentiles, 429 counts. Fails if >50% rate-limited, >10% errors, or >5min wall time.

**How to run:**
```bash
APP_URL=http://localhost:3000 TEST_TOKEN=<jwt> npx tsx scripts/load-test-email.ts
```

### Runbook

- **`docs/runbooks/email-sync.md`** — Comprehensive operational runbook covering:
  1. Pub/Sub outage detection and force-poll fallback
  2. Graph throttling avalanche: backoff tuning, circuit breaker
  3. Mass refresh-token revocation: identification, surface to users
  4. Delta cursor expiry: detection, re-backfill trigger
  5. Webhook URL change: Pub/Sub update + Graph re-subscription

## Database Changes

- New table: `metrics_email_sync`
- New column: `provider_connections.error_state` (varchar(50), nullable)

## Manual Testing

1. **Admin dashboard:** Navigate to Settings > Admin > Email Integrations as owner. Verify KPI strip, user table, filter chips all render. Force-disconnect a test user — confirm data is purged.

2. **Data export:** POST to `/api/integrations/email/export` as an authenticated user. Download ZIP and verify it contains `manifest.json`, `connections.json`, `messages.json`.

3. **Candidate delete:** Delete a candidate via `/api/candidates/:id/delete-cascade`. Verify their email links and orphaned messages are removed.

4. **Error banner:** Set `error_state='invalid_grant'` on a test connection. Reload dashboard — verify banner appears with "Reconnect" button. Dismiss it, reload — verify it reappears.

5. **Metrics:** After a few syncs, check the "email-sync" tab on Analytics. Verify KPIs and chart render.

6. **Load test:** Run the script against local dev. Verify no crashes, no 429 avalanche.

## Risks

- **ZIP builder is minimal** — no compression, memory-bound. Fine for v1 volumes (<10k messages per user). Large agencies may need streaming in v1.1.
- **Purge is synchronous** — runs in the request handler. For very large datasets, consider enqueuing to a background job.
- **S3 body cleanup is a no-op** — bodies are inline in v1. When S3 storage is added, update `purgeUserData` to delete S3 objects.

## Rollback

- Remove admin page at `settings/admin/email-integrations/`
- Remove force-disconnect and export API routes
- Revert layout.tsx to remove `EmailSyncErrorBanner`
- Drop `metrics_email_sync` table and `error_state` column
- Revert analytics page to remove email-sync tab
