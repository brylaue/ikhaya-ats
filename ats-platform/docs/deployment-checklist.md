# Deployment Checklist

## Environment Variables

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Project API URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Service-role key (server-only, never expose to browser) |
| `SUPER_ADMIN_EMAILS` | ✅ | Comma-separated list of Ikhaya super-admin emails |
| `CRON_SECRET` | ✅ | Min 32 chars; used to authenticate cron job invocations |
| `GOOGLE_CLIENT_ID` | ✅ for Gmail | OAuth 2.0 client ID |
| `GOOGLE_CLIENT_SECRET` | ✅ for Gmail | OAuth 2.0 client secret |
| `MICROSOFT_CLIENT_ID` | ✅ for Outlook | Azure AD app registration client ID |
| `MICROSOFT_CLIENT_SECRET` | ✅ for Outlook | Azure AD app registration client secret |
| `GRAPH_WEBHOOK_SECRET` | ✅ for Outlook webhooks | Min 32 chars; HMAC validation key |
| `PUBSUB_AUDIENCE` | ✅ for Gmail push | Expected JWT audience from Google Pub/Sub |

---

## Supabase Project Configuration

### JWT Expiry (US-356) — REQUIRED BEFORE LAUNCH

**Change:** Shorten the JWT access token expiry from the default 1 hour to **15 minutes**.

> **Why:** A stolen JWT can be used for up to 1 hour with default settings. Middleware
> auto-refreshes on every authenticated request at no UX cost, so 15 minutes is free.
> Reduces stolen-token exploitation window by 75%.

**How to apply:**

1. Open the Supabase Dashboard for this project
2. Navigate to **Authentication → Settings**
3. Under **JWT Settings**, set **JWT expiry** to `900` (seconds)
4. Click **Save**

**Verify:** After changing, check that:
- The `ats_role` cookie `maxAge` in `middleware.ts` is already `15 * 60` ✅
- No UX regression (auto-refresh in Supabase SSR handles it transparently)

---

## Security Headers (US-364)

CSP headers are configured in `next.config.ts`. Before launching:

1. Deploy to staging and open Chrome DevTools → Console
2. Confirm **no CSP violation warnings** appear during normal app usage
3. Check Vercel function logs for any `[CSP violation]` entries from `/api/csp-report`
4. Validate the CSP at [Google CSP Evaluator](https://csp-evaluator.withgoogle.com/)

---

## Post-Deployment Smoke Tests

- [ ] Login with Google + Microsoft OAuth
- [ ] Send a test email from Gmail and Outlook integrations  
- [ ] Trigger a webhook and verify HMAC validation passes
- [ ] Access `/super-admin` — confirm 404 for non-admin emails
- [ ] Access `/super-admin` — confirm stats load for `SUPER_ADMIN_EMAILS` users
- [ ] Verify session idle timeout works (wait 30 min or mock timestamp)
- [ ] Verify CSP report endpoint returns 204
