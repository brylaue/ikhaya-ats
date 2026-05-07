# Stage 3 — Google OAuth + Token Storage

## Summary

Implements the Google OAuth 2.0 flow and secure token storage for Gmail email sync.

## What shipped

### Token encryption (`lib/email/token-store.ts`)
- AES-256-GCM encryption / decryption for refresh tokens
- 96-bit random IV per encrypt call — format `iv_b64:ciphertext_b64`
- Reads key from `EMAIL_TOKEN_ENCRYPTION_KEY` env var (must be 32-byte base64)

### API routes
- `GET /api/auth/google/start` — generates state UUID, stores in httpOnly cookie, redirects to Google consent screen
- `GET /api/auth/google/callback` — validates state, exchanges code for tokens, fetches user profile, encrypts refresh token, upserts `provider_connections` row
- `POST /api/auth/google/disconnect` — revokes refresh token at Google, deletes `provider_connections` row

### Library layer
- `lib/email/storage/connections.ts` — typed server-side CRUD for `provider_connections`: `upsertConnection`, `getConnection`, `getRefreshToken` (decrypts), `deleteConnection`, `updateDeltaCursor`, `markBackfillComplete`, `updateRealtimeSubscription`
- `lib/email/providers/google.ts` — `GoogleProvider` implementing `EmailProvider` contract: `buildAuthUrl`, `handleCallback`, `revoke`; sync/realtime methods stubbed with `NotImplementedError` until Stage 6
- `lib/email/providers/index.ts` — factory: `getProvider("google")` → `GoogleProvider` instance

## Required env vars

```
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
EMAIL_TOKEN_ENCRYPTION_KEY=   # 32-byte value, base64-encoded: openssl rand -base64 32
NEXT_PUBLIC_APP_URL=
EMAIL_SYNC_ENABLED=true       # set to "false" to disable OAuth routes
```

## Google Cloud Console setup

1. OAuth 2.0 Credentials → Authorised redirect URI: `{NEXT_PUBLIC_APP_URL}/api/auth/google/callback`
2. Scopes: `openid email profile https://www.googleapis.com/auth/gmail.modify`
3. Access type: `offline`, prompt: `consent` (ensures refresh token is always returned)

## Testing

1. Navigate to Settings → Integrations
2. Click "Connect Gmail" — redirects to Google consent
3. After consent: `provider_connections` row created with `provider = 'google'`
4. Click "Disconnect" — row deleted, token revoked at Google
