# Stage 4 — Microsoft OAuth + Admin Consent + Tenant Tracking

**Date:** 2026-04-20
**Branch:** `feat/email-stage-4-microsoft-oauth`
**Depends on:** Stage 2 (schema — `provider_connections`, `ikhaya_tenant_ms_tenants` tables), Stage 3 (Google adapter pattern, encryption, connections storage)
**Required by:** Stage 5 (opt-in UI), Stage 7 (Graph backfill)

---

## What changed

### 1. `apps/web/lib/email/providers/microsoft.ts` (updated)

Updated `buildAdminConsentUrl` signature to accept `{ state, msTenantId }` and generate the tenant-scoped admin consent URL pointing to `/api/auth/microsoft/adminconsent-callback`. The adapter's `buildAuthUrl`, `handleCallback`, and `revoke` methods were already scaffolded in Stage 1 and remain unchanged — they use direct OAuth2/fetch calls (no MSAL runtime dependency) matching the Google adapter pattern.

Key adapter behaviours:
- `buildAuthUrl` — constructs MS authorize URL with scopes: openid, profile, email, offline_access, User.Read, Mail.ReadWrite, Mail.Send
- `handleCallback` — exchanges code for tokens, decodes `id_token` JWT to extract `tid` (MS tenant ID) and `oid`/`sub` (provider subject), fetches Graph `/me` for email, returns `ProviderConnection` with `msTenantId` populated
- `revoke` — placeholder (Microsoft has no direct token revoke endpoint)
- Authority sourced from `MS_OAUTH_AUTHORITY` env var, defaults to `https://login.microsoftonline.com/common`

### 2. `apps/web/app/api/auth/microsoft/start/route.ts` (rewritten)

- Gated on `EMAIL_MICROSOFT_ENABLED=true` feature flag (returns 404 if disabled)
- Uses `microsoftProvider.buildAuthUrl()` from the adapter instead of inlining URL construction
- Passes `loginHint` from the Supabase session email for smoother consent UX
- CSRF state stored in httpOnly cookie with 10-minute TTL

### 3. `apps/web/app/api/auth/microsoft/callback/route.ts` (rewritten)

- Gated on `EMAIL_MICROSOFT_ENABLED=true` feature flag
- Uses `microsoftProvider.handleCallback()` adapter for code exchange + user info fetch
- **Cross-tenant conflict detection:** before upserting, queries `provider_connections` for existing rows with the same `provider_sub` but a different `agency_id`. If found, redirects to `/integrations/error?reason=already-bound` (302) to prevent one MS account being bound to multiple Ikhaya tenants.
- Encrypts refresh token via `upsertConnection()` (which delegates to `token-store.ts` → `encryption.ts`)
- **MS tenant tracking:** if the returned `msTenantId` is not yet recorded in `ikhaya_tenant_ms_tenants` for this agency, inserts a row with `admin_consented=false`
- Records a `sync_events` row with `event_type='connected'` including email, providerSub, msTenantId, and scope count
- Redirects to `/settings/integrations?connected=microsoft` on success
- Handles consent denial gracefully (redirects with provider error in query string)

### 4. `apps/web/app/api/auth/microsoft/adminconsent/route.ts` (rewritten)

Formerly the admin consent *callback*; now the admin consent *start* route. GET handler that:
- Requires `?ms_tenant_id=xxx` query parameter
- Generates CSRF state, stores in `microsoft_adminconsent_state` httpOnly cookie
- Redirects the tenant admin to `{authority}/{ms_tenant_id}/adminconsent` with scopes and redirect_uri pointing to `/api/auth/microsoft/adminconsent-callback`

### 5. `apps/web/app/api/auth/microsoft/adminconsent-callback/route.ts` (new)

GET handler that receives Microsoft's redirect after admin consent:
- Validates CSRF state cookie
- Reads `admin_consent=True` and `tenant` query parameters
- Upserts `ikhaya_tenant_ms_tenants` setting `admin_consented=true`, `admin_consented_at=now()`, `admin_consented_by_email=<session email>`
- Redirects to `/settings/integrations?admin_consented=<tenant>`
- Handles denial/error from Microsoft gracefully

### 6. `apps/web/app/integrations/error/page.tsx` (new)

Minimal error page for connection conflicts. Reads `?reason=` from URL and renders a human-readable explanation. Currently supports `already-bound` reason (cross-tenant conflict). Includes a link back to `/settings/integrations`.

### 7. `apps/web/package.json` (updated)

Added `"@azure/msal-node": "^2.16.0"` dependency. Currently unused at runtime (adapter uses direct OAuth2 fetch), but available for future stages that may need `ConfidentialClientApplication` for silent token refresh.

### 8. Pre-existing files (no changes)

- `apps/web/lib/email/providers/index.ts` — Stage 1 scaffold already registers `microsoftProvider`
- `apps/web/lib/email/storage/connections.ts` — Stage 3, reused by callback via `upsertConnection` + `recordSyncEvent`
- `apps/web/lib/email/encryption.ts` — Stage 3, reused for token encryption
- `apps/web/app/api/auth/microsoft/disconnect/route.ts` — bonus route from prior implementation, unchanged

---

## Files changed

```
apps/web/lib/email/providers/microsoft.ts                                  | ~ (buildAdminConsentUrl updated)
apps/web/app/api/auth/microsoft/start/route.ts                             | ~ (rewritten)
apps/web/app/api/auth/microsoft/callback/route.ts                          | ~ (rewritten)
apps/web/app/api/auth/microsoft/adminconsent/route.ts                      | ~ (rewritten: callback → start)
apps/web/app/api/auth/microsoft/adminconsent-callback/route.ts             | + (new)
apps/web/app/integrations/error/page.tsx                                   | + (new)
apps/web/package.json                                                      | ~ (@azure/msal-node added)
ats-platform/STAGE_4_PR.md                                                 | ~ (rewritten)
```

---

## Env vars required

| Variable | Purpose | How to generate |
|----------|---------|-----------------|
| `EMAIL_MICROSOFT_ENABLED` | Feature flag — set to `"true"` to enable MS OAuth routes | Manual |
| `MS_OAUTH_CLIENT_ID` | Microsoft Entra app registration client ID | Azure Portal |
| `MS_OAUTH_CLIENT_SECRET` | Microsoft Entra app registration client secret | Azure Portal |
| `MS_OAUTH_AUTHORITY` | OAuth authority (default: `https://login.microsoftonline.com/common`) | Manual (optional) |
| `NEXT_PUBLIC_APP_URL` | App base URL for redirect URIs | e.g. `https://app.ikhaya.io` |
| `EMAIL_TOKEN_ENCRYPTION_KEY` | 32-byte base64 key for AES-256-GCM token encryption | `openssl rand -base64 32` |

All should already exist in `.env.example` from Stage 1. Copy values to `.env.local`.

---

## Manual test steps

### OAuth flow (requires real MS credentials in .env.local)

1. Set `EMAIL_MICROSOFT_ENABLED=true` in `.env.local`
2. Start the dev server: `pnpm dev`
3. Sign in to the app
4. Navigate to `/api/auth/microsoft/start`
5. Microsoft consent screen should appear with Mail scopes
6. Grant access → should redirect to `/settings/integrations?connected=microsoft`
7. Check Supabase Table Editor:
   - `provider_connections` should have a row with `provider='microsoft'`, `sync_enabled=true`, encrypted `refresh_token_secret_ref`, and populated `ms_tenant_id`
   - `ikhaya_tenant_ms_tenants` should have a row for this agency with `admin_consented=false`
   - `sync_events` should have a row with `event_type='connected'`

### Admin consent flow (requires tenant admin account)

1. Note the `ms_tenant_id` from the step above
2. Navigate to `/api/auth/microsoft/adminconsent?ms_tenant_id=<tid>`
3. Should redirect to Microsoft admin consent screen
4. Grant admin consent → should redirect to `/settings/integrations?admin_consented=<tid>`
5. Check `ikhaya_tenant_ms_tenants`:
   - `admin_consented` should be `true`
   - `admin_consented_at` should be populated
   - `admin_consented_by_email` should match the admin's email

### Cross-tenant conflict

1. Connect an MS account to Agency A
2. Create a second user in Agency B
3. Try connecting the *same* MS account to Agency B
4. Should redirect to `/integrations/error?reason=already-bound`
5. Page should display "Account already connected" with explanation

### Feature flag disabled

1. Set `EMAIL_MICROSOFT_ENABLED=false` (or remove it)
2. Navigate to `/api/auth/microsoft/start` → should return 404
3. Navigate to `/api/auth/microsoft/callback` → should return 404
4. Navigate to `/api/auth/microsoft/adminconsent` → should return 404

### Consent denial

1. With `EMAIL_MICROSOFT_ENABLED=true`, navigate to `/api/auth/microsoft/start`
2. At the Microsoft consent screen, click "Cancel" or deny
3. Should redirect to `/settings/integrations?error=access_denied`

---

## Risks and edge cases

| Risk | Mitigation |
|------|-----------|
| User declines at consent screen | Callback handles `error` query param and redirects with informative error |
| No refresh token returned | `handleCallback` throws `insufficient_scope` ProviderError; callback catches and redirects |
| Admin consent required by tenant policy | `handleCallback` detects `admin_consent_required` error and throws descriptive ProviderError |
| Cross-tenant account binding | Conflict check queries existing connections for same `provider_sub` in different agency; blocks with 302 to error page |
| `ikhaya_tenant_ms_tenants` insert failure | Logged but doesn't crash the callback — tenant tracking is secondary to connection creation |
| State cookie expires (>10min on consent screen) | Callback rejects with `state_mismatch` error and redirects. User can retry. |
| Concurrent connections from same user | `upsert` on `(user_id, provider)` is idempotent — last write wins |
| `@azure/msal-node` unused at runtime | Added per spec for future token refresh needs; no runtime impact until imported |

---

## Decisions & notes

- **No MSAL at runtime:** The adapter uses direct OAuth2 fetch calls matching the Google adapter pattern. MSAL is added as a dependency for future stages (e.g., silent token refresh via `ConfidentialClientApplication`) but is not imported anywhere yet.
- **Feature flag renamed:** Changed from `EMAIL_SYNC_ENABLED` to `EMAIL_MICROSOFT_ENABLED` to match the per-provider flag convention established in Stage 3 (`EMAIL_GOOGLE_ENABLED`).
- **Admin consent split:** The previous single `/adminconsent` route has been split into a start route (redirect to MS) and a callback route (receive MS response), matching the pattern of the regular OAuth flow.
- **`tsc`/`lint` not verified in sandbox:** Node modules are not installed in the automated environment. Code follows identical patterns to Stage 3's verified Google routes. Verify locally with `pnpm install && pnpm tsc --noEmit && pnpm lint`.

---

## Next

Stage 5 (Apr 21) — Opt-in UI: post-signup opt-in modal, Settings → Integrations card for both providers, disconnect button.
