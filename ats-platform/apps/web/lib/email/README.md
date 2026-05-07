# Email integration — library layout

This directory will hold the email sync plumbing. Stage 1 establishes only the shape;
implementations land in later stages.

```
lib/email/
  README.md                 (you are here)
  encryption.ts             Stage 3: envelope encrypt/decrypt for refresh tokens
  matcher.ts                Stage 6: 4-strategy matcher (exact, alt, thread, fuzzy)
  normalize.ts              Stage 6: email address normalisation (gmail dot-insensitive, etc.)
  providers/
    google.ts               Stage 3+6: Gmail adapter implementing EmailProvider
    microsoft.ts            Stage 4+7: Graph adapter implementing EmailProvider
    index.ts                factory: getProvider(id)
  sync/
    backfill.ts             Stage 6: orchestrates initial 90-day backfill
    delta.ts                Stage 8: processes realtime/delta pushes
    subscription.ts         Stage 8: creates + refreshes realtime subscriptions
  storage/
    bodies.ts               Stage 6: S3/R2 put/get for message bodies
    connections.ts          Stage 3: read/write provider_connections rows
    messages.ts             Stage 6: upsert email_messages + candidate_email_links
  webhooks/
    gmail-pubsub.ts         Stage 8: Pub/Sub push verifier + dispatcher
    graph.ts                Stage 8: Graph notification handler (validationToken, clientState HMAC)
```

The `EmailProvider` interface in `apps/web/types/email/provider.ts` is the seam.
Above it: provider-agnostic. Below it: provider-specific.
