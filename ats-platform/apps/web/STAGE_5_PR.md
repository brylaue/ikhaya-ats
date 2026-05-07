# Stage 5 — Settings Live Connect/Disconnect + Opt-in Modal

## Summary

Wires the Settings Integrations tab to real OAuth flows and ships two new UI components for email connection management.

## What shipped

### Settings page (`app/(dashboard)/settings/page.tsx`)
- `IntegrationSettings` now imports `useEmailConnections` hook to read real `provider_connections` state
- Gmail and Outlook cards show live connected/disconnected status with the connected email address
- "Connect" buttons redirect to `/api/auth/google/start` and `/api/auth/microsoft/start`
- "Disconnect" buttons call POST to `/api/auth/google/disconnect` and `/api/auth/microsoft/disconnect`
- Other integrations (LinkedIn, Slack, DocuSign, Zapier, Greenhouse, Lever) remain in "coming soon" state

### `components/email/EmailIntegrationCard.tsx`
- Displays live connection state: connected email address + "Connected" badge, or a "Connect" CTA
- Respects `NEXT_PUBLIC_EMAIL_SYNC_ENABLED=false` feature flag — shows "Coming soon" when off
- Optimistic disconnect with loading state and error toast

### `components/email/EmailOptInModal.tsx`
- Post-signup opt-in modal shown to new users on first dashboard load
- Direct OAuth links to Google and Microsoft start routes
- "Skip for now" dismisses without connecting

### `components/email/connect-email-modal.tsx`
- Reusable inline modal for connecting email from the Outreach inbox empty state
- Shows Google and Microsoft provider cards with logos, redirects on click
- Used in Outreach page when no provider is connected

### Hooks
- `useEmailConnections()` in `lib/supabase/hooks.ts` — returns `{ google, microsoft, loading, refresh }` convenience wrapper over `provider_connections` query

## Connect flow (end-to-end)

```
User clicks "Connect Gmail"
  → window.location.href = /api/auth/google/start
  → State cookie set, redirect to Google consent
  → Callback: token exchange, encrypt, upsert provider_connections
  → Redirect to /settings?tab=integrations&connected=google
  → useEmailConnections() re-fetches, card shows connected state
```

## Feature flag

Set `NEXT_PUBLIC_EMAIL_SYNC_ENABLED=false` to hide email connect UI across all surfaces (Settings, Outreach inbox). Default: true.
