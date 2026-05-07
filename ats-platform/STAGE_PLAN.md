# Email Integration — 10-Stage Implementation Plan

**Feature:** Google Workspace / Gmail + Microsoft 365 / Outlook email sync to candidate timelines.
**Spec:** `../ATS_Email_Integration_Spec.docx`
**Start:** 2026-04-17 (Stage 1)
**Finish:** 2026-04-26 (Stage 10)
**Budget:** one stage per day, ≤ 20% of daily Claude capacity per stage.
**Git flow:** feature branch per stage, PR per stage.

---

## Stage map

| # | Date | Branch | Scope |
|---|------|--------|-------|
| 1 | 2026-04-17 Fri | `feat/email-stage-1-foundation` | Git init, OAuth registration docs, `.env.example`, `EmailProvider` TS interface, shared types |
| 2 | 2026-04-18 Sat | `feat/email-stage-2-schema` | DB migrations for `provider_connections`, `ikhaya_tenant_ms_tenants`, `email_threads`, `email_messages`, `candidate_email_links`, `sync_events`; generate TS types |
| 3 | 2026-04-19 Sun | `feat/email-stage-3-google-oauth` | Google OAuth start/callback routes, token storage (Supabase Vault), connection row creation |
| 4 | 2026-04-20 Mon | `feat/email-stage-4-microsoft-oauth` | MSAL + MS OAuth routes; `/adminconsent` tenant-wide flow; `ms_tenant_id` capture |
| 5 | 2026-04-21 Tue | `feat/email-stage-5-opt-in-ui` | Post-signup opt-in modal; Settings → Integrations card for both providers; disconnect button |
| 6 | 2026-04-22 Wed | `feat/email-stage-6-gmail-backfill` | Gmail adapter (`listMessages`, `getMessage`); matcher v1 (exact + alt only); write to DB |
| 7 | 2026-04-23 Thu | `feat/email-stage-7-graph-backfill` | Graph adapter (folder-scoped backfill, deltaLink capture); matcher cross-provider |
| 8 | 2026-04-24 Fri | `feat/email-stage-8-realtime` | Gmail `watch` + Pub/Sub receiver; Graph subscription + webhook (validationToken handshake); refresher cron |
| 9 | 2026-04-25 Sat | `feat/email-stage-9-timeline-fuzzy` | Candidate timeline email card; thread collapsing; fuzzy match + "Unclaimed matches" review inbox |
| 10 | 2026-04-26 Sun | `feat/email-stage-10-admin-hardening` | Admin dashboard, force-disconnect, data purge, data export ZIP, rate-limit tests, error UX |

---

## Principles

1. **One stage = one PR.** If a stage blows scope, split into `-part-2`; never bundle across days.
2. **Mocks at unit level, real creds at integration level.** Real OAuth creds live in `.env.local`; unit tests use fixtures.
3. **Idempotent writes.** All syncs upsert on `(user_id, provider, provider_message_id)`. Replay-safe.
4. **No dummy data in production path.** Tests use fixtures; prod code fails hard on missing config.
5. **Feature-flag everything.** Gmail and Microsoft each behind a flag (`EMAIL_GOOGLE_ENABLED`, `EMAIL_MICROSOFT_ENABLED`). Rollback = flip flag.
6. **Trace every sync event.** `sync_events` table is the single source of observability.

---

## Exit criteria per stage

Each stage PR must include:

- [ ] Code changes scoped to the stage's deliverables
- [ ] Unit tests for any new pure logic (matcher, token rotation, etc.)
- [ ] Updated `STAGE_N_PR.md` at repo root summarising what changed, risks, manual test steps
- [ ] No breaking changes to prior stages (migrations must be forward-only)
- [ ] All TypeScript compiles clean (`tsc --noEmit` from repo root)
- [ ] `pnpm lint` clean

---

## Prerequisites (Bryan, Stage 1 homework)

These must be provided before Stage 3 begins:

1. **Google Cloud project**: create at https://console.cloud.google.com, enable Gmail API, create OAuth 2.0 Client (Web). Redirect URI: `https://<your-domain>/api/auth/google/callback`. Add scopes: `openid`, `email`, `profile`, `gmail.modify`. Put client ID + secret into `.env.local` as `GOOGLE_OAUTH_CLIENT_ID` + `GOOGLE_OAUTH_CLIENT_SECRET`.
2. **Google Pub/Sub topic + subscription** for Gmail push (needed by Stage 8): `projects/<proj>/topics/gmail-push`; grant `gmail-api-push@system.gserviceaccount.com` publisher role.
3. **Microsoft Entra app registration** at https://entra.microsoft.com → Applications → App registrations → New. Multi-tenant + personal. Redirect URI: `https://<your-domain>/api/auth/microsoft/callback`. API permissions (delegated): `openid`, `profile`, `email`, `offline_access`, `User.Read`, `Mail.ReadWrite`, `Mail.Send`. Put Application (client) ID + client secret into `.env.local` as `MS_OAUTH_CLIENT_ID` + `MS_OAUTH_CLIENT_SECRET`.
4. **GitHub repo**: `git remote add origin <url>`; `gh auth login`. Enables PR creation per stage.

Full walkthroughs in `docs/oauth-setup/google.md` and `docs/oauth-setup/microsoft.md`.

---

## Rollback plan

- Stage 2 migrations are forward-only; rollback = ignore new tables (unused).
- Stages 3+ hide behind feature flags. Flip to `false` to disable.
- Full feature kill-switch: `EMAIL_SYNC_ENABLED=false` in env.

---

## Daily cadence

Each scheduled run (stages 2–10) will:

1. Check out `main`, pull latest.
2. Create the stage's feature branch.
3. Execute the stage's deliverables.
4. Write `STAGE_N_PR.md` with summary.
5. Commit.
6. Open PR via `gh pr create` (if remote configured).
7. Notify on completion.

If any stage fails or scope balloons, the task stops, writes a `STAGE_N_BLOCKED.md`, and alerts for human review before proceeding the next day.
