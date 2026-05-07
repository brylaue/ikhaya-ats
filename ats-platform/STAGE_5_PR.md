# Stage 5 — Opt-in UI + Settings → Integrations

**Date:** 2026-04-21
**Branch:** `feat/email-stage-5-opt-in-ui`
**Depends on:** Stage 2 (schema), Stage 3 (Google OAuth), Stage 4 (Microsoft OAuth)
**Required by:** Stage 6 (Gmail backfill), Stage 7 (Graph backfill), Stage 10 (admin hardening/purge)

---

## What changed

### 1. `components/email/sync-opt-in-modal.tsx` (new)

Full-screen modal shown post-login when the user has no active `provider_connection` and hasn't permanently dismissed the prompt. Key features:

- **Not dismissable on outside click** — only the two CTAs ("Allow sync" / "Not now") close it.
- **Provider auto-detection** from the user's email domain: `gmail.com`/`googlemail.com` → Google; `*.onmicrosoft.com`/`outlook.com`/`hotmail.com`/`live.com` → Microsoft. Custom domains show a two-button picker.
- **"Allow sync"** CTA (green, `autoFocus`) routes to `/api/auth/<provider>/start`.
- **"Not now"** ghost CTA records a decline in `user_email_sync_preferences`.
- **Expandable "What exactly does Ikhaya see?"** privacy section with six bullet points per spec §4.2.

### 2. `packages/db/migrations/009_email_sync_preferences.sql` (new)

New table `user_email_sync_preferences`:

| Column | Type | Purpose |
|--------|------|---------|
| `user_id` | UUID PK | FK → users |
| `decline_count` | INT (default 0) | How many times user clicked "Not now" |
| `last_declined_at` | TIMESTAMPTZ | When they last declined |
| `reminder_shown_at` | TIMESTAMPTZ | Null until the 7-day re-prompt fires; set once to prevent repeat |

RLS: user-scoped via `auth.uid()`. SELECT, INSERT, UPDATE only (no DELETE policy — row lifecycle is managed by the app).

### 3. `lib/supabase/hooks.ts` — added `useEmailSyncPreference()` hook

Returns `{ preference, loading, recordDecline, recordReminderShown, shouldShowOptIn }`.

**Re-prompt logic (`shouldShowOptIn`):**
- No preference row → `true` (first visit)
- 1 decline + no `reminder_shown_at` + ≥7 days since decline → `true`
- 2+ declines OR `reminder_shown_at` set → `false` (never auto-show again)

### 4. `app/(dashboard)/layout.tsx` (updated)

Dashboard root layout now:
- Imports `SyncOptInModal`, `useEmailConnections`, `useEmailSyncPreference`, and `createClient`.
- Fetches the user's email for provider auto-detection.
- Gates the modal on: no active `provider_connection` for either provider AND `shouldShowOptIn === true`.
- On "Allow" → redirects to the provider's OAuth start endpoint.
- On "Not now" → calls `recordDecline()` (and `recordReminderShown()` if this was the 7-day re-prompt).

### 5. `app/(dashboard)/settings/integrations/page.tsx` (new)

Dedicated integrations settings page at `/settings/integrations` with full provider management:

**Per-provider card (Google & Microsoft):**
- Provider logo (lucide `Mail` icon with brand color ring)
- Connection status badge: "Syncing" (green) / "Paused" (amber) / "Not connected"
- Connected email address
- Last sync timestamp (from `sync_events` latest success, or em-dash)
- Sync toggle switch → `PATCH /api/integrations/email/toggle?provider=...`
- "Connect" button (when disconnected) → `/api/auth/<provider>/start`
- **"Disconnect and purge data"** button (red) → opens a confirm dialog requiring the user to type `DISCONNECT` → `DELETE /api/integrations/email/disconnect?provider=...`

**Microsoft admin consent card** (bottom, visible only if user is owner/admin and MS is connected):
- Shows "Admin consent granted" with who/when if already consented
- Otherwise shows "Grant admin consent for your organisation" button → `/api/auth/microsoft/adminconsent?ms_tenant_id=...`

### 6. `app/api/integrations/email/toggle/route.ts` (new)

`PATCH /api/integrations/email/toggle?provider=google|microsoft`
- Auth-gated, toggles `provider_connections.sync_enabled`
- Returns `{ syncEnabled: boolean }`

### 7. `app/api/integrations/email/disconnect/route.ts` (new)

`DELETE /api/integrations/email/disconnect?provider=google|microsoft`
- Auth-gated
- Best-effort token revocation via provider adapter's `revoke()`
- Deletes the `provider_connections` row
- Records `sync_events` with `event_type='disconnected'`
- Enqueues a purge job stub (actual purge worker in Stage 10)

### 8. `app/(dashboard)/settings/page.tsx` (updated)

- Replaced inline email integration cards with a link to `/settings/integrations`
- Removed `useEmailConnections` and `EmailIntegrationCard` imports (no longer needed here)

---

## Files changed

```
components/email/sync-opt-in-modal.tsx                              | + (new)
packages/db/migrations/009_email_sync_preferences.sql               | + (new)
app/(dashboard)/settings/integrations/page.tsx                      | + (new)
app/api/integrations/email/toggle/route.ts                          | + (new)
app/api/integrations/email/disconnect/route.ts                      | + (new)
lib/supabase/hooks.ts                                               | ~ (useEmailSyncPreference added)
app/(dashboard)/layout.tsx                                          | ~ (opt-in modal wired in)
app/(dashboard)/settings/page.tsx                                   | ~ (integrations section simplified)
ats-platform/STAGE_5_PR.md                                          | ~ (rewritten)
```

---

## Env vars required

No new env vars. Uses existing:

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_APP_URL` | Base URL for OAuth redirect URIs |
| `EMAIL_GOOGLE_ENABLED` / `EMAIL_MICROSOFT_ENABLED` | Feature flags (checked in OAuth start routes) |

---

## Manual test steps

### Opt-in modal (first login, no connections)

1. Sign in as a user with no `provider_connections` rows and no `user_email_sync_preferences` row
2. Dashboard loads → after ~800ms the full-screen opt-in modal appears
3. Clicking outside the modal does NOT dismiss it
4. Expand "What exactly does Ikhaya see?" → privacy bullets appear
5. Click "Allow sync" → redirected to the appropriate OAuth start route
6. Alternatively: click "Not now" → modal closes → `user_email_sync_preferences` row created with `decline_count=1`

### Re-prompt (7 days later)

1. Manually set `last_declined_at` to 8 days ago in the DB
2. Ensure `reminder_shown_at` is NULL and `decline_count` is 1
3. Sign in → modal should re-appear
4. Click "Not now" → `decline_count` becomes 2, `reminder_shown_at` is set
5. Refresh → modal should NOT appear

### Never re-prompt after second decline

1. Set `decline_count=2` in the DB
2. Sign in → modal should NOT appear, regardless of `last_declined_at`

### Settings → Integrations

1. Navigate to `/settings` → Integrations section → click "Email Integrations" link
2. Redirected to `/settings/integrations`
3. Two provider cards visible (Google + Microsoft), both in "Not connected" state
4. Click "Connect" on Google → redirected to `/api/auth/google/start`
5. After connecting: card shows email, "Syncing" badge, last sync "—", toggle is on
6. Toggle sync off → `PATCH` fires → badge changes to "Paused"
7. Click "Disconnect and purge data" → confirm dialog appears → type "DISCONNECT" → `DELETE` fires → card returns to "Not connected"

### Microsoft admin consent

1. Connect Microsoft as a user with `role='owner'` or `role='admin'`
2. Admin consent card appears at the bottom of the integrations page
3. If `admin_consented=false`: "Grant admin consent" button shown
4. If `admin_consented=true`: green badge with consenter email and date

### Feature flags disabled

1. Set `EMAIL_GOOGLE_ENABLED=false` and `EMAIL_MICROSOFT_ENABLED=false`
2. Connect buttons redirect to OAuth start routes → those routes return 404
3. No crash in the UI; user sees no consent screen

---

## Risks and edge cases

| Risk | Mitigation |
|------|-----------|
| `user_email_sync_preferences` table doesn't exist yet (migration not run) | Modal gate query catches the Supabase error gracefully; defaults to not showing |
| User's email domain doesn't match Google or Microsoft | Provider picker UI shown; user picks explicitly |
| Concurrent decline writes | Upsert on `user_id` PK — last write wins, harmless |
| Toggle called for non-existent connection | Returns 404, UI shows error toast |
| Disconnect called twice | Second call returns 404 (row already deleted), UI refreshes to disconnected state |
| Admin consent card shown to non-admin | Hook checks `role` from `users` table; only owner/admin see the card |

---

## Decisions & notes

- **Migration numbered 009** (not 004 as originally spec'd) because migrations 004–008 already exist for scheduled interviews, per-job pipelines, interview plans, outreach, and enrollments.
- **`useEmailSyncPreference` lives in hooks.ts** alongside `useEmailConnections` to keep all email-related client hooks co-located.
- **Existing `EmailOptInModal.tsx` and `EmailIntegrationCard.tsx` preserved** — they're still importable for other callers. The new `sync-opt-in-modal.tsx` is the spec-compliant modal shown from the dashboard layout; the old components remain for backwards compatibility.
- **Disconnect uses `DELETE` method** (not `POST`) matching REST conventions and spec.
- **Storybook check skipped** — no `.storybook` config found in the project.
- **`tsc`/`lint` not verified in sandbox** — Node modules not installed. Code follows identical patterns to Stages 3–4 verified routes.

---

## Next

Stage 6 (Apr 22) — Gmail adapter: `listMessages`, `getMessage`; matcher v1 (exact + alt only); write to DB.
