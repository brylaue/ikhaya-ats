# Stage 1 — Foundation + OAuth setup docs

**Date:** 2026-04-17
**Proposed branch:** `feat/email-stage-1-foundation`
**Scope:** No runtime code. Documentation, env config, and the TS interface everything else builds on.

## What changed

- `STAGE_PLAN.md` — full 10-stage roadmap with exit criteria and prerequisites.
- `docs/oauth-setup/google.md` — step-by-step Google Cloud + OAuth + Pub/Sub walkthrough.
- `docs/oauth-setup/microsoft.md` — step-by-step Entra app registration + Graph permissions walkthrough.
- `apps/web/.env.example` — added 20 new env vars for both providers (flags, OAuth, webhook, encryption, sync tuning, queue, body storage). Existing Supabase/OpenAI vars untouched.
- `apps/web/types/email/provider.ts` — `EmailProvider` interface, `ProviderConnection`, `MessageRef`, `FullMessage`, `Subscription`, `SendMessageInput`, `ProviderError` taxonomy.
- `apps/web/types/email/index.ts` — barrel.
- `apps/web/lib/email/README.md` — directory layout for stages 3-8 implementation.

## Why this shape

The `EmailProvider` interface is the only thing both Gmail and Graph will share in code. Pinning it now means:

- Stage 3 (Google OAuth) and Stage 4 (MS OAuth) can be written independently without coupling.
- Stages 6 + 7 (backfill) both produce `MessageRef` / `FullMessage` — the matcher (Stage 9) and storage (Stage 6) never learn which provider an email came from.
- Stage 8 webhook receivers enqueue work through the same `fetchDelta()` path as the fallback poller.
- `ProviderError.code` enum is the union of error conditions we care about from either provider; adapters normalise to this.

## Bryan homework (blocks Stage 3 onward)

Stage 3 (Apr 19) needs real Google OAuth creds; Stage 4 (Apr 20) needs real Microsoft creds.

- [ ] Follow `docs/oauth-setup/google.md` steps 1–5. Populate `GOOGLE_OAUTH_*` in `.env.local`.
- [ ] Follow `docs/oauth-setup/microsoft.md` steps 1–6. Populate `MS_OAUTH_*` in `.env.local`.
- [ ] `git init` this repo on your machine, add GitHub remote, `gh auth login`. (Session couldn't git-init due to filesystem permissions on the Cowork mount.)

Everything else (Pub/Sub topic, publisher verification, admin consent flow testing) can land progressively.

## Risks

- None — no runtime code landed.
- If the `EmailProvider` interface proves wrong during Stages 3/4 adapter implementation, we revise it there; it's a TS-only change, no migration.

## Test plan

- [ ] `tsc --noEmit` clean in `apps/web`
- [ ] `pnpm lint` clean
- [ ] Read through `STAGE_PLAN.md` — confirm scope per day is achievable

## Diff summary

```
 STAGE_PLAN.md                                       | +  (new)
 STAGE_1_PR.md                                       | +  (new)
 docs/oauth-setup/google.md                          | +  (new)
 docs/oauth-setup/microsoft.md                       | +  (new)
 apps/web/.env.example                               | +40 -0
 apps/web/types/email/provider.ts                    | +  (new)
 apps/web/types/email/index.ts                       | +  (new)
 apps/web/lib/email/README.md                        | +  (new)
```

## Next

Stage 2 (Apr 18) — DB migrations for `provider_connections`, `email_threads`, `email_messages`, `candidate_email_links`, `sync_events`, `ikhaya_tenant_ms_tenants`; generate TS types via Supabase CLI.
