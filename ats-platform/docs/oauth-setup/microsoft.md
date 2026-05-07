# Microsoft Entra / Graph OAuth setup — step by step

This walks through registering Ikhaya's multi-tenant app with Microsoft Entra ID (formerly Azure AD) and configuring Graph access. Complete before Stage 4.

## 1. Prerequisites

- A Microsoft account with access to a Microsoft Entra tenant. If you don't have one: https://entra.microsoft.com — the free tier is fine for development.
- For Publisher Verification later, you'll need a **Microsoft Cloud Partner Program (MCPP)** account. Not required to start coding.

## 2. Register the app

https://entra.microsoft.com → **Applications → App registrations → + New registration**

1. Name: `Ikhaya`
2. Supported account types: **Accounts in any organizational directory (any Microsoft Entra ID tenant – Multitenant) and personal Microsoft accounts (e.g., Skype, Xbox)**
3. Redirect URI: platform = **Web**, URI = `http://localhost:3000/api/auth/microsoft/callback`
4. Register.
5. On the overview page, copy **Application (client) ID** and **Directory (tenant) ID**.

## 3. Add production redirect URI

1. On the app → **Authentication** → Platform configurations → Web → **Add URI**:
    - `https://app.ikhaya.io/api/auth/microsoft/callback`
2. Under **Implicit grant and hybrid flows**: leave both checkboxes unticked (we use authorization code flow with PKCE).
3. Under **Advanced settings** → Allow public client flows: **No**.
4. Save.

## 4. Create a client secret

1. App → **Certificates & secrets** → **+ New client secret**
2. Description: `web-app-secret`
3. Expires: 24 months (set a calendar reminder to rotate)
4. Add. **Copy the Value immediately** — it's only shown once.

## 5. Configure API permissions

1. App → **API permissions** → **+ Add a permission** → **Microsoft Graph**
2. Choose **Delegated permissions** (not Application — we act on behalf of the user)
3. Select:
    - `openid`
    - `email`
    - `profile`
    - `offline_access` (required for refresh tokens)
    - `User.Read` (basic profile)
    - `Mail.ReadWrite` (read + organise mailbox)
    - `Mail.Send` (send on user's behalf)
4. **Add permissions**
5. Back on the permissions page: **Grant admin consent for <Your Tenant>** — this approves the app for your own tenant (you'll do the same on each customer tenant via the admin-consent flow).

## 6. Populate environment variables

Add to `apps/web/.env.local`:

```
MS_OAUTH_CLIENT_ID=<Application (client) ID from step 2>
MS_OAUTH_CLIENT_SECRET=<Value from step 4>
MS_OAUTH_REDIRECT_URI=http://localhost:3000/api/auth/microsoft/callback
MS_OAUTH_AUTHORITY=https://login.microsoftonline.com/common
MS_GRAPH_WEBHOOK_URL=https://app.ikhaya.io/api/webhooks/graph
MS_GRAPH_WEBHOOK_CLIENT_STATE_SECRET=<random 32-byte hex — used as HMAC key for clientState>
```

Generate the clientState secret:
```bash
openssl rand -hex 32
```

## 7. Branding + publisher info (needed before admin-consent flow is trustworthy)

1. App → **Branding & properties**
2. Logo: upload 240×240 transparent PNG
3. Home page URL: `https://ikhaya.io`
4. Terms of service URL: `https://ikhaya.io/terms`
5. Privacy statement URL: `https://ikhaya.io/privacy`
6. Save.

## 8. Publisher verification (before go-live)

1. Create or link an MCPP account: https://partner.microsoft.com
2. Verify the domain `ikhaya.io` in the MCPP dashboard
3. On the Entra app → **Branding & properties** → **Verified publisher** → **Add verified publisher**
4. Paste your MPN ID. Microsoft validates. Takes ~1 week.
5. Once verified, Microsoft displays a blue "Verified" badge on the consent screen — materially reduces admin-consent friction.

## 9. Test the admin-consent URL

For any test customer tenant, the admin-consent URL is:

```
https://login.microsoftonline.com/{customer-tenant-id}/adminconsent
  ?client_id={MS_OAUTH_CLIENT_ID}
  &scope=openid offline_access User.Read Mail.ReadWrite Mail.Send
  &redirect_uri=https://app.ikhaya.io/api/auth/microsoft/adminconsent-callback
  &state={csrf-token}
```

Test against your own tenant by replacing `{customer-tenant-id}` with your tenant's directory ID.

## 10. Webhook endpoint prep (needed for Stage 8)

Microsoft Graph delivers change notifications to a single HTTPS endpoint you specify per subscription. The endpoint must:

- Serve HTTPS with a valid cert (no self-signed).
- Respond to `POST /api/webhooks/graph?validationToken=xxx` with status 200 and the raw `validationToken` value as `text/plain` within **10 seconds** of subscription creation. Our stage-8 route will implement this.
- Accept subsequent `POST` bodies containing notifications (JSON).

During local dev, expose localhost via `ngrok http 3000` and set `MS_GRAPH_WEBHOOK_URL` to the ngrok URL.

## Verification checklist

- [ ] Multi-tenant app registered, client ID + tenant ID recorded
- [ ] Production + localhost redirect URIs added
- [ ] Client secret generated and stored (only visible at creation time)
- [ ] 7 delegated permissions added + admin-consented to own tenant
- [ ] `.env.local` populated with all MS_* vars
- [ ] Branding (logo, URLs) configured
- [ ] Publisher verification submitted (optional for dev, required pre-launch)
- [ ] Admin-consent URL format tested against own tenant
