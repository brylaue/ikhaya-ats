# Stage 7 — Microsoft Graph Sync Engine

## Summary

Implements the Microsoft Graph message sync pipeline, mirroring the Gmail engine from Stage 6. Uses the delta query pattern (`$deltaLink`) rather than Gmail's `historyId`.

## What shipped

### Graph adapter (`lib/email/graph-adapter.ts`) — already existed
- `getAccessToken(conn)` — exchanges refresh token for a new access token via MSAL token endpoint; updates `access_token_expires_at` in DB
- `listMessages(conn, opts)` — paginates `GET /me/messages?$filter=receivedDateTime ge {from}` with `$skip`, yields `MessageRef[]`
- `getMessage(conn, id)` — fetches `GET /me/messages/{id}` with full body, normalises to `FullMessage`
- `fetchDelta(conn)` — uses `$deltaLink` cursor stored in `delta_cursor`; if no cursor, seeds from a 7-day lookback
- `subscribeRealtime(conn, { webhookUrl })` — creates a Graph subscription on `me/messages` with HMAC clientState
- `renewSubscription(conn, sub)` — PATCHes the Graph subscription's `expirationDateTime`

### Graph webhook handler (`app/api/email/graph-webhook/route.ts`)
- `GET` — validation challenge handler (echoes `validationToken` as plain text, required for Graph subscription creation)
- `POST` — processes change notification batches; verifies HMAC clientState, loads connection, iterates `fetchDelta` async generator, runs `processFullMessage` per message, ACKs unconditionally with 202

### Subscription refresher (`lib/email/subscription-refresher.ts`)
- Queries `provider_connections` where `realtime_expires_at < now + 48h`
- Calls `adapter.renewSubscription(conn, sub)` (works for both Google and Microsoft)
- Updates `realtime_subscription_id` + `realtime_expires_at` on success
- Returns `{ renewed, errors }` for the cron route to log

### Cron route (`app/api/email/refresh-subscriptions/route.ts`)
- `POST` secured with `Authorization: Bearer $CRON_SECRET`
- Returns `{ status, renewed, errors }`

## Required env vars

```
MS_OAUTH_CLIENT_ID=
MS_OAUTH_CLIENT_SECRET=
MS_OAUTH_AUTHORITY=https://login.microsoftonline.com/common
NEXT_PUBLIC_APP_URL=
EMAIL_SYNC_ENABLED=true

# For Graph webhooks:
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
MS_GRAPH_WEBHOOK_CLIENT_STATE_SECRET=   # random secret for HMAC: openssl rand -hex 32

# For subscription renewal cron:
CRON_SECRET=
```

## Microsoft Graph subscription setup

1. After OAuth connect, call `POST /api/email/backfill` (or add MS backfill support in Stage 7.1)
2. Create a Graph subscription via `graphAdapter.subscribeRealtime(conn, { webhookUrl, clientStateHmac })`
   - `webhookUrl` = `{NEXT_PUBLIC_APP_URL}/api/email/graph-webhook`
   - `clientStateHmac` = HMAC of connectionId using `MS_GRAPH_WEBHOOK_CLIENT_STATE_SECRET`
3. Graph sends a validation `GET` — the route echoes the token automatically
4. Schedule `POST /api/email/refresh-subscriptions` every 24h (Graph mail subscriptions expire in ~3 days)

## HMAC clientState format

```
base64( connectionId + ":" + hmac-sha256(connectionId, MS_GRAPH_WEBHOOK_CLIENT_STATE_SECRET) )
```

The webhook handler verifies this before processing any notification.

## Delta cursor

Graph's `$deltaLink` is stored in `provider_connections.delta_cursor`.  It expires after 30 days of inactivity — if the adapter receives a `410 Gone`, it resets by seeding from a 7-day lookback and writes `event_type: delta_expired` to `sync_events`.
