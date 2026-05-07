# Stage 3 — Google OAuth + Token Encryption

**Date:** 2026-04-19
**Branch:** `feat/email-stage-3-google-oauth`
**Depends on:** Stage 2 (schema — `provider_connections`, `sync_events` tables)
**Required by:** Stage 4 (Microsoft OAuth), Stage 5 (opt-in UI), Stage 6 (Gmail backfill)

---

## What changed

### 1. `apps/web/lib/email/encryption.ts` (new)

AES-256-GCM envelope encryption for refresh tokens using `EMAIL_TOKEN_ENCRYPTION_KEY` (base64-encoded 32-byte key). Exports `encryptToken(plaintext)` → base64 string of `iv || authTag || ciphertext`, and `decryptToken(wrapped)` → plaintext. Uses Node.js `crypto` module — no external dependencies.

### 2. `apps/web/lib/email/token-store.ts` (updated)

Upgraded from identity passthrough to delegation to `encryption.ts`. Falls back to plaintext (with console warning) when `EMAIL_TOKEN_ENCRYPTION_KEY` is not set, so local dev works without generating a key. In production the env var must be present.

### 3. `apps/web/lib/email/__tests__/encryption.test.ts` (new)

Unit tests for encryption round-trip: simple string, empty string, unicode, random IV uniqueness, tamper detection, truncation rejection. 6 tests, all passing. Uses `node:test` runner — no extra test deps required.

### 4. `apps/web/lib/email/storage/connections.ts` (updated)

Added three new exports:

- `disableConnection(id)` — soft-disable (sets `sync_enabled = false`)
- `insertConnection(input)` — thin wrapper around `upsertConnection` for spec surface
- `recordSyncEvent(input)` — appends to `sync_events` table for observability; logs but doesn't throw on failure to avoid crashing the OAuth flow

### 5. `apps/web/app/api/auth/google/start/route.ts` (updated)

- Gated on `EMAIL_GOOGLE_ENABLED=true` feature flag (returns 404 if disabled)
- Now uses `googleProvider.buildAuthUrl()` from the adapter instead of inlining URL construction
- Passes `loginHint` from the Supabase session email for smoother consent UX
- CSRF state stored in httpOnly cookie with 10-minute TTL

### 6. `apps/web/app/api/auth/google/callback/route.ts` (updated)

- Gated on `EMAIL_GOOGLE_ENABLED=true` feature flag
- Uses `googleProvider.handleCallback()` adapter for code exchange + user info fetch
- Encrypts refresh token via `upsertConnection()` (which delegates to `token-store.ts` → `encryption.ts`)
- Records a `sync_events` row with `event_type='connected'` including email, providerSub, and scope count
- Redirects to `/settings/integrations?connected=google` on success
- Handles consent denial gracefully (redirects with provider error in query string)

### 7. Pre-existing files (no changes)

- `apps/web/lib/email/providers/google.ts` — Stage 1 scaffold already had `buildAuthUrl` and `handleCallback` fully implemented
- `apps/web/lib/email/providers/index.ts` — Stage 1 scaffold already had `getProvider` factory
- `apps/web/lib/email/providers/microsoft.ts` — untouched (Stage 4)

---

## Files changed

```
apps/web/lib/email/encryption.ts                              | + (new)
apps/web/lib/email/__tests__/encryption.test.ts               | + (new)
apps/web/lib/email/token-store.ts                             | ~ (rewritten)
apps/web/lib/email/storage/connections.ts                     | ~ (3 functions added)
apps/web/app/api/auth/google/start/route.ts                   | ~ (rewritten)
apps/web/app/api/auth/google/callback/route.ts                | ~ (rewritten)
ats-platform/STAGE_3_PR.md                                    | + (new)
```

---

## Env vars required

| Variable | Purpose | How to generate |
|----------|---------|-----------------|
| `EMAIL_GOOGLE_ENABLED` | Feature flag — set to `"true"` to enable Google OAuth routes | Manual |
| `GOOGLE_OAUTH_CLIENT_ID` | Google Cloud OAuth 2.0 Client ID | Google Cloud Console |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google Cloud OAuth 2.0 Client Secret | Google Cloud Console |
| `NEXT_PUBLIC_APP_URL` | App base URL for redirect URI | e.g. `https://app.ikhaya.io` |
| `EMAIL_TOKEN_ENCRYPTION_KEY` | 32-byte base64 key for AES-256-GCM token encryption | `openssl rand -base64 32` |

All should already exist in `.env.example` from Stage 1. Copy values to `.env.local`.

---

## Manual test steps

### Encryption unit test
```bash
cd ats-platform
node --experimental-strip-types --test apps/web/lib/email/__tests__/encryption.test.ts
# Expect: 6/6 pass
```

### OAuth flow (requires real Google credentials in .env.local)

1. Set `EMAIL_GOOGLE_ENABLED=true` in `.env.local`
2. Start the dev server: `pnpm dev`
3. Sign in to the app
4. Navigate to `/api/auth/google/start`
5. Google consent screen should appear with Gmail scopes
6. Grant access → should redirect to `/settings/integrations?connected=google`
7. Check Supabase Table Editor:
   - `provider_connections` should have a row for the user with `provider='google'`, `sync_enabled=true`, and an encrypted `refresh_token_secret_ref`
   - `sync_events` should have a row with `event_type='connected'` and the correct `connection_id`

### Feature flag disabled

1. Set `EMAIL_GOOGLE_ENABLED=false` (or remove it)
2. Navigate to `/api/auth/google/start` → should return 404
3. Navigate to `/api/auth/google/callback` → should return 404

### Consent denial

1. With `EMAIL_GOOGLE_ENABLED=true`, navigate to `/api/auth/google/start`
2. At the Google consent screen, click "Cancel" or deny
3. Should redirect to `/settings/integrations?error=access_denied`

---

## Risks and edge cases

| Risk | Mitigation |
|------|-----------|
| User declines at Google consent screen | Callback handles `error` query param from Google and redirects with informative error |
| No refresh token returned (user previously consented without `prompt=consent`) | `handleCallback` throws `insufficient_scope` ProviderError; callback catches and redirects with error. `prompt: "consent"` is forced in `buildAuthUrl` to prevent this. |
| `EMAIL_TOKEN_ENCRYPTION_KEY` not set in production | `token-store.ts` falls back to plaintext with a console warning; `encryption.ts` throws hard if called directly. Production deployment checklist must include this key. |
| Key rotation | Not yet supported — requires a migration to re-encrypt all stored tokens. Logged as future work for Stage 10 hardening. |
| State cookie expires (user takes >10min on consent screen) | Callback rejects with `state_mismatch` error and redirects. User can retry. |
| Concurrent connections from same user | `upsert` on `(user_id, provider)` is idempotent — last write wins. |

---

## Next

Stage 4 (Apr 20) — Microsoft OAuth: MSAL + MS OAuth routes, `/adminconsent` tenant-wide flow, `ms_tenant_id` capture.
