# Stage 4 — Microsoft OAuth + Admin Consent

## Summary

Implements the Microsoft OAuth 2.0 / MSAL flow and admin consent for Microsoft 365 / Outlook email sync.

## What shipped

### API routes
- `GET /api/auth/microsoft/start` — state cookie + redirect to Microsoft `/oauth2/v2.0/authorize`
- `GET /api/auth/microsoft/callback` — validates state, exchanges code for tokens, decodes ID token (tid + oid), fetches Graph `/me`, encrypts refresh token, upserts `provider_connections` with `ms_tenant_id`
- `GET /api/auth/microsoft/adminconsent` — validates state cookie, records admin consent in `ikhaya_tenant_ms_tenants` table (required for enterprise tenants with tenant-wide policies)
- `POST /api/auth/microsoft/disconnect` — deletes `provider_connections` row (no token revoke endpoint on Graph)

### Library layer
- `lib/email/providers/microsoft.ts` — `MicrosoftProvider` implementing `EmailProvider` contract: `buildAuthUrl`, `buildAdminConsentUrl`, `handleCallback`, `revoke`; sync/realtime methods stubbed until Stage 7

## Required env vars

```
MS_OAUTH_CLIENT_ID=
MS_OAUTH_CLIENT_SECRET=
MS_OAUTH_AUTHORITY=https://login.microsoftonline.com/common   # or specific tenant ID
NEXT_PUBLIC_APP_URL=
EMAIL_SYNC_ENABLED=true
```

## Azure App Registration setup

1. Authentication → Redirect URIs: `{NEXT_PUBLIC_APP_URL}/api/auth/microsoft/callback`
2. Admin consent redirect URI: `{NEXT_PUBLIC_APP_URL}/api/auth/microsoft/adminconsent`
3. API permissions (delegated): `openid profile email offline_access User.Read Mail.ReadWrite Mail.Send`
4. For multi-tenant: set Supported account types to "Any Azure AD directory + personal Microsoft accounts"
5. Certificates & secrets → New client secret

## Admin consent flow

Enterprise customers whose tenant has "Require admin approval" enabled must first navigate to:

```
GET /api/auth/microsoft/start?admin_consent=1
```

This redirects to the admin consent endpoint. After approval, the `ikhaya_tenant_ms_tenants` table row is created with `admin_consented = true`. Subsequent user OAuth flows will succeed without the `admin_consent_required` error.

## Testing

1. Navigate to Settings → Integrations
2. Click "Connect Outlook" — redirects to Microsoft consent
3. After consent: `provider_connections` row created with `provider = 'microsoft'` and `ms_tenant_id` set
4. Click "Disconnect" — row deleted
