# Email Integration — Feature Complete

**Feature:** Google Workspace / Gmail + Microsoft 365 / Outlook email sync to candidate timelines  
**Completed:** 2026-04-26 (10 stages, 2026-04-17 → 2026-04-26)  
**Spec:** `ATS_Email_Integration_Spec.docx`

---

## What Shipped

### Stage 1 — Foundation (2026-04-17)
- EmailProvider TypeScript interface and shared types
- OAuth registration documentation (Google + Microsoft)
- `.env.example` with all required variables
- Feature flag infrastructure (`EMAIL_GOOGLE_ENABLED`, `EMAIL_MICROSOFT_ENABLED`, `EMAIL_SYNC_ENABLED`)

### Stage 2 — Schema (2026-04-18)
- Database migrations: `provider_connections`, `ikhaya_tenant_ms_tenants`, `email_threads`, `email_messages`, `candidate_email_links`, `sync_events`
- Generated TypeScript types from schema
- RLS policies: users can only read their own connections; sync_events is append-only

### Stage 3 — Google OAuth (2026-04-19)
- Google OAuth start/callback routes
- AES-256-GCM token encryption (Supabase Vault integration)
- Connection row creation with encrypted refresh token
- Token revocation on disconnect

### Stage 4 — Microsoft OAuth (2026-04-20)
- MSAL-based OAuth flow with PKCE
- `/adminconsent` tenant-wide consent flow
- `ms_tenant_id` capture and `ikhaya_tenant_ms_tenants` tracking
- Multi-tenant app support

### Stage 5 — Opt-in UI (2026-04-21)
- Post-signup opt-in modal with provider detection
- Settings > Integrations page with provider cards
- Sync toggle (enable/disable per provider)
- Disconnect flow with confirmation dialog
- Sync preference persistence (decline, reminder cooldown)

### Stage 6 — Gmail Backfill (2026-04-22)
- Gmail adapter: `listMessages`, `getMessage` with pagination
- Candidate matcher v1: exact email + alt email (domain alias normalization)
- Message storage pipeline: upsert thread → insert message → match & link
- Cross-provider dedup via `internet_message_id`

### Stage 7 — Graph Backfill (2026-04-23)
- Graph adapter: folder-scoped backfill (Inbox + SentItems)
- Delta link capture for incremental sync
- Cross-provider threading via RFC 822 Message-ID
- Exponential backoff with jitter for 429 handling

### Stage 8 — Realtime Sync (2026-04-24)
- Gmail: `watch()` + Pub/Sub push receiver at `/api/email/pubsub`
- Graph: subscription creation + webhook at `/api/email/graph-webhook` (validationToken handshake)
- Subscription refresher cron (every 12h)
- Fallback poll cron for Pub/Sub outage resilience

### Stage 9 — Timeline & Fuzzy Match (2026-04-25)
- `CandidateEmailTimeline` component on candidate detail page
- Thread collapsing (threads with >2 messages collapsed by default)
- `FuzzyReviewInbox` component: confirm/reject pending_review matches
- `useEmailTimeline` data hook

### Stage 10 — Admin & Hardening (2026-04-26)
- Admin dashboard: KPI strip, user connection table, filter chips, force-disconnect
- MS tenant admin-consent panel
- `purgeUserData()` — full data purge on disconnect
- `purgeCandidateEmailData()` — RTBF cascade on candidate deletion
- GDPR data export (ZIP download)
- `EmailSyncErrorBanner` — persistent error banners with per-error copy
- `metrics_email_sync` table + analytics dashboard card
- Load test script (50 concurrent backfills)
- Operational runbook (Pub/Sub outage, Graph throttling, token revocation, delta cursor expiry, webhook URL change)

---

## Known Limitations

1. **No S3 body storage** — Email bodies stored inline in `body_html`/`body_text` columns. Adequate for v1 volumes. S3 offload needed when average agency exceeds ~50k messages.

2. **Synchronous purge** — Purge runs in the request handler. Fine for <10k messages per user. Will need background job queue for larger datasets.

3. **No attachment indexing** — `has_attachments` flag is stored but attachments are not downloaded or searchable.

4. **ZIP export is uncompressed** — The built-in ZIP builder stores entries without compression. Keeps the implementation dependency-free but produces larger files.

5. **Fuzzy matching is basic** — v1 fuzzy is domain-alias only. ML-based fuzzy matching (name + email pattern) deferred to v1.1.

6. **No send-from-ATS** — `sendMessage()` is defined in the provider interface but not wired to UI. Deferred to v1.1.

7. **Metrics table not auto-populated** — `metrics_email_sync` needs a daily cron calling `computeAgencyMetrics()`. Cron setup is an infra task.

8. **S3 export lifecycle** — The spec calls for 7-day auto-delete via S3 lifecycle rule. v1 serves the ZIP directly; S3 upload + signed URL is a v1.1 item.

---

## Deferred to v1.1

| Item | Reason |
|------|--------|
| S3 body storage | Requires S3 bucket provisioning + CDK/Terraform |
| ML fuzzy matching | Needs training data from real agency usage |
| Send from ATS | UX design not finalized |
| Attachment download & search | Storage cost and indexing complexity |
| Background job queue (purge, export) | Needs Bull/BullMQ or similar infra |
| S3 export with signed URL + email | Needs SES/SendGrid integration |
| Metrics daily cron | Infra task: Vercel cron or external scheduler |
| Advanced admin filters (date range, error type) | UX iteration |
| Bulk reconnect flow (mass token revocation) | Edge case; manual runbook sufficient for v1 |

---

## Launch Readiness Gate Checklist

### Google
- [ ] **CASA Tier 2 assessment** — Required for apps accessing Gmail API with restricted scopes. Assessment submitted; awaiting review. Blocker for production rollout beyond beta.
- [ ] **OAuth consent screen** — Verified with Ikhaya branding. Scopes: `gmail.modify`, `openid`, `email`, `profile`.
- [ ] **Pub/Sub topic + subscription** — Created and tested. Publisher role granted to `gmail-api-push@system.gserviceaccount.com`.

### Microsoft
- [ ] **Publisher verification** — Entra app registration verified with Ikhaya domain. Blue checkmark visible on consent screen.
- [ ] **Admin consent flow** — Tested with multi-tenant setup. `/adminconsent` endpoint functional.
- [ ] **Graph API permissions** — Delegated: `Mail.ReadWrite`, `Mail.Send`, `User.Read`, `offline_access`, `openid`, `profile`, `email`.

### Infrastructure
- [ ] **Environment variables** — All 11 env vars set in production. `EMAIL_TOKEN_ENCRYPTION_KEY` generated with 256-bit entropy.
- [ ] **Feature flags** — `EMAIL_GOOGLE_ENABLED=false`, `EMAIL_MICROSOFT_ENABLED=false` until gates pass. `EMAIL_SYNC_ENABLED=true`.
- [ ] **Database migrations** — All 12 migration files applied to production DB.
- [ ] **Cron jobs** — Subscription refresher (12h) and fallback poll (1h) scheduled.

### Beta
- [ ] **Beta tenant list** — Ikhaya internal agency + 2 early-access partners identified.
- [ ] **Monitoring** — `sync_events` table queryable. Error alerts configured (>5% error rate → Slack notification).
- [ ] **Runbook reviewed** — `docs/runbooks/email-sync.md` reviewed by engineering.

---

## Architecture Summary

```
User connects Gmail/Outlook
       │
       ▼
  OAuth Flow (Stage 3/4)
  ├─ Token encrypted → provider_connections
  └─ Backfill triggered
       │
       ▼
  Backfill (Stage 6/7)
  ├─ Gmail: listMessages → getMessage
  └─ Graph: folder-scoped → deltaLink
       │
       ▼
  Matcher (Stage 6/7/9)
  ├─ Exact email match
  ├─ Alt email / domain alias
  └─ Fuzzy (pending_review)
       │
       ▼
  Storage
  ├─ email_threads (upsert)
  ├─ email_messages (insert, dedup by internet_message_id)
  └─ candidate_email_links (match records)
       │
       ▼
  Realtime (Stage 8)
  ├─ Gmail: watch → Pub/Sub → /api/email/pubsub
  └─ Graph: subscription → /api/email/graph-webhook
       │
       ▼
  UI (Stage 5/9/10)
  ├─ Candidate timeline
  ├─ Fuzzy review inbox
  ├─ Settings > Integrations
  ├─ Admin dashboard
  └─ Error banners
```

---

*Feature complete. Ship it.*
