# Google OAuth setup — step by step

This walks through registering Ikhaya's OAuth 2.0 client with Google and preparing for Gmail push notifications. Complete before Stage 3.

## 1. Create / select Google Cloud project

1. Go to https://console.cloud.google.com
2. Top bar → project dropdown → **New Project**
3. Name: `ikhaya-prod` (or `ikhaya-dev` for a test environment — you'll likely want both)
4. Note the **Project ID** (auto-generated, e.g., `ikhaya-prod-412345`)

## 2. Enable required APIs

At https://console.cloud.google.com/apis/library in your project, enable:

- **Gmail API** (required)
- **Cloud Pub/Sub API** (required for Stage 8 realtime push)
- **People API** (optional, for contact enrichment later)

## 3. Configure OAuth consent screen

https://console.cloud.google.com/apis/credentials/consent

1. User type: **External** (even if only your team uses it initially — Internal is Workspace-only and restricts to your domain)
2. App name: `Ikhaya`
3. User support email: `bryan@ikhaya.io`
4. App logo: upload 120×120 PNG of the Ikhaya mark
5. App domain → Homepage: `https://ikhaya.io`
6. App domain → Privacy policy: `https://ikhaya.io/privacy`
7. App domain → Terms of service: `https://ikhaya.io/terms`
8. Authorized domains: `ikhaya.io`
9. Developer contact: `bryan@ikhaya.io`
10. Click **Save and Continue** → Scopes
11. Add scopes:
    - `openid`
    - `.../auth/userinfo.email`
    - `.../auth/userinfo.profile`
    - `.../auth/gmail.modify` ⚠️ **restricted scope — triggers verification**
12. Save and Continue
13. Test users: add `bryan@ikhaya.io` plus up to 100 colleagues for the testing period

## 4. Create OAuth 2.0 Client ID

https://console.cloud.google.com/apis/credentials

1. **+ CREATE CREDENTIALS** → OAuth client ID
2. Application type: **Web application**
3. Name: `Ikhaya Web`
4. Authorized JavaScript origins:
    - `http://localhost:3000` (dev)
    - `https://app.ikhaya.io` (prod)
5. Authorized redirect URIs:
    - `http://localhost:3000/api/auth/google/callback`
    - `https://app.ikhaya.io/api/auth/google/callback`
6. Click **Create**. Copy the **Client ID** and **Client secret**.

## 5. Populate environment variables

Add to `apps/web/.env.local`:

```
GOOGLE_OAUTH_CLIENT_ID=<the client id>
GOOGLE_OAUTH_CLIENT_SECRET=<the client secret>
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
GOOGLE_PUBSUB_PROJECT_ID=<project id, e.g., ikhaya-prod-412345>
GOOGLE_PUBSUB_TOPIC=gmail-push
```

## 6. Create Pub/Sub topic (needed for Stage 8)

https://console.cloud.google.com/cloudpubsub/topic

1. **Create Topic**
2. Topic ID: `gmail-push`
3. Uncheck "Add a default subscription" (we create it below)
4. Create
5. On the topic detail page → **Permissions** → **Add principal**
6. New principal: `gmail-api-push@system.gserviceaccount.com`
7. Role: **Pub/Sub Publisher**
8. Save. This authorises Gmail to publish notifications into this topic.

## 7. Create Pub/Sub subscription (push)

1. On topic `gmail-push` → **Create Subscription**
2. Subscription ID: `gmail-push-sub-web`
3. Delivery type: **Push**
4. Endpoint URL: `https://app.ikhaya.io/api/webhooks/gmail-pubsub`
5. Enable **authentication** → Service account: create one named `ikhaya-pubsub-invoker` with role `Pub/Sub Subscriber` on the topic. Audience: `https://app.ikhaya.io` (or leave blank — we verify the JWT ourselves)
6. Acknowledgment deadline: 60 seconds
7. Message retention: 1 day (notifications are trivially re-derivable from history API)
8. Create.

## 8. OAuth app verification

Because we use a restricted scope (`gmail.modify`), submit for verification:

1. Return to OAuth consent screen
2. Click **Publish app** (moves from Testing → In production)
3. Click **Prepare for verification**
4. Fill out:
    - Scope justification for `gmail.modify`: "Attach candidate emails to ATS timeline; enable send-from-ATS"
    - Demo video URL (record a 2–5 min Loom showing the consent flow and what is done with the data)
    - Privacy policy link
    - Links to in-app copy showing each scope's use
5. Google assigns a CASA Tier-2 assessor (independent security review). Budget **6–12 weeks** end to end.

**Until verified**, keep the app in Testing mode to avoid the 7-day refresh-token expiry that hits unverified apps in Production.

## Verification checklist

- [ ] Project created, Project ID recorded
- [ ] Gmail API + Pub/Sub API enabled
- [ ] Consent screen configured (External, 4 scopes, test users added)
- [ ] OAuth client created, credentials in `.env.local`
- [ ] Pub/Sub topic `gmail-push` created with Gmail publisher permission
- [ ] Pub/Sub push subscription pointing at `/api/webhooks/gmail-pubsub`
- [ ] Verification application submitted (can proceed on stages without this; needed before public launch)
