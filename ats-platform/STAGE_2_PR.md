# Stage 2 — Email Integration Schema

**Date:** 2026-04-18
**Branch:** `feat/email-stage-2-schema`
**Supabase migration name:** `email_integration_schema`
**Depends on:** Stage 1 (provider.ts types)
**Required by:** Stage 3 (Google OAuth — creates a `provider_connections` row on callback)

---

## What changed

### Migration `003_email_integration.sql`

Applied to Supabase project `jjxkzmxugguietyfqqai` (ats-platform, us-east-1).

**Extension added:** `citext` — case-insensitive text, used for all email address columns so comparisons never break on capitalisation differences between providers.

**4 ENUMs created:**

| Type | Values |
|------|--------|
| `email_provider` | `google`, `microsoft` |
| `email_direction` | `inbound`, `outbound` |
| `match_strategy` | `exact`, `alt`, `thread`, `fuzzy` |
| `match_status` | `active`, `pending_review`, `rejected` |

**6 tables created:**

| Table | PK | Purpose |
|-------|----|---------|
| `provider_connections` | uuid | One row per (user × provider). Holds token metadata; refresh token stays in Vault (secret ref only). |
| `ikhaya_tenant_ms_tenants` | composite (ikhaya_agency_id, ms_tenant_id) | MS admin-consent tracking. Created during the /adminconsent callback (Stage 4). |
| `email_threads` | uuid | Provider thread aggregates (participant count, first/last msg timestamps). Enables timeline rendering without loading all messages. |
| `email_messages` | uuid | One row per message. Body HTML/text stored in S3/R2; only metadata + snippet here. CITEXT addresses. |
| `candidate_email_links` | uuid | Matched message → candidate. Includes match strategy, confidence score, and review status. |
| `sync_events` | bigserial | Append-only observability log. Written after every backfill page, delta poll, and webhook delivery. |

**Indexes:**

- `provider_connections`: user_id, agency_id
- `email_threads`: user_id, agency_id, last_msg_at DESC
- `email_messages`: user_id, agency_id, thread_id, sent_at DESC, internet_message_id (partial, WHERE NOT NULL)
- `email_messages`: GIN trigram on `(subject || ' ' || snippet)` — powers in-app message search
- `candidate_email_links`: candidate_id, message_id, status
- `sync_events`: (user_id, occurred_at DESC), agency_id

**Trigger:** `trg_provider_connections_updated_at` — fires `update_updated_at()` on every UPDATE to `provider_connections`, matching the pattern used across all existing tables.

**RLS policies:** All six tables have RLS enabled. Isolation uses `current_agency_id()` — the same function used by every existing policy in this database. Full CRUD policies on all tables except `sync_events`, which is append-only (SELECT + INSERT only, no UPDATE or DELETE).

`candidate_email_links` has no direct `agency_id` column. Its RLS policies join through `email_messages` using an EXISTS subquery on the indexed `message_id` FK — efficient and correct.

### `apps/web/types/supabase.ts` (new)

Generated from live Supabase schema via `generate_typescript_types`. Contains all 17 tables (11 pre-existing + 6 new email tables) with full Row/Insert/Update types, relationship metadata, function signatures, and the 4 new Enums. The `Constants` block exports typed enum arrays for runtime validation.

---

## Schema adaptation note

The live Supabase database uses `agencies` (not `orgs`) and `agency_id` (not `tenant_id`/`org_id`) throughout — a divergence from the local `001_initial_schema.sql` and `002_vector_search.sql` files which were never applied to this project. All Stage 2 tables follow the live convention:

- FK column: `agency_id` → `agencies(id)`
- `ikhaya_tenant_ms_tenants` uses `ikhaya_agency_id` rather than `ikhaya_tenant_id`
- RLS: `current_agency_id()` not raw JWT access

The local migration files were updated to match. **Bryan:** the local 001/002 files should be reconciled with the live schema before Stage 3 if you plan to use them for local dev with Supabase CLI (`supabase db reset`).

---

## TypeScript check

`tsc --noEmit` (run with TypeScript 5.7.2 against the project's tsconfig) produces errors only in pre-existing files unrelated to Stage 2 — primarily `Cannot find module` errors for `next`, `lucide-react`, and similar packages whose pnpm-linked node_modules are not resolvable from a standalone tsc invocation in this environment, plus a handful of pre-existing type mismatches in `lib/supabase/hooks.ts` and portal pages.

**Zero errors** originate from any file introduced or modified by Stage 2:
- `packages/db/migrations/003_email_integration.sql` — SQL, not checked by tsc
- `apps/web/types/supabase.ts` — zero errors
- `apps/web/types/email/provider.ts` — zero errors (unchanged from Stage 1)

---

## Rollback SQL

The migration is forward-only. If you need to back out:

```sql
-- Drop tables (order matters: dependents first)
DROP TABLE IF EXISTS candidate_email_links;
DROP TABLE IF EXISTS sync_events;
DROP TABLE IF EXISTS email_messages;
DROP TABLE IF EXISTS email_threads;
DROP TABLE IF EXISTS ikhaya_tenant_ms_tenants;
DROP TABLE IF EXISTS provider_connections;

-- Drop enums
DROP TYPE IF EXISTS match_status;
DROP TYPE IF EXISTS match_strategy;
DROP TYPE IF EXISTS email_direction;
DROP TYPE IF EXISTS email_provider;

-- Drop extension (only if nothing else uses it)
-- DROP EXTENSION IF EXISTS citext;
```

Rollback is safe — no existing tables reference the new tables. Stage 3+ code will fail if these tables are absent, but no existing feature is affected.

---

## Manual test steps

1. **Verify tables exist in Supabase:**
   Dashboard → Table Editor → confirm `provider_connections`, `email_threads`, `email_messages`, `candidate_email_links`, `ikhaya_tenant_ms_tenants`, `sync_events` all appear.

2. **Verify RLS is on:**
   Authentication → Policies → confirm 6 tables each show their policies, and that `sync_events` has no UPDATE/DELETE policies.

3. **Verify ENUMs in types:**
   Open `apps/web/types/supabase.ts` and confirm the `Enums` block contains `email_provider`, `email_direction`, `match_strategy`, `match_status` with correct values.

4. **Smoke test insert (Supabase SQL editor, as service role):**
   ```sql
   -- Should succeed with service role (bypasses RLS)
   INSERT INTO provider_connections (
     user_id, agency_id, provider, provider_sub, email,
     refresh_token_secret_ref, access_token_expires_at
   ) VALUES (
     '00000000-0000-0000-0000-000000000001',
     (SELECT id FROM agencies LIMIT 1),
     'google', 'sub_test', 'test@example.com',
     'vault/test-ref', NOW() + INTERVAL '1 hour'
   ) RETURNING id;
   -- Clean up:
   DELETE FROM provider_connections WHERE provider_sub = 'sub_test';
   ```

5. **Smoke test RLS (Supabase SQL editor, as anon/authenticated):**
   Select from `provider_connections` — should return 0 rows (no JWT → `current_agency_id()` returns NULL, no rows match).

---

## Diff summary

```
 ats-platform/STAGE_2_PR.md                                  | + (new)
 ats-platform/packages/db/migrations/003_email_integration.sql | + (new)
 ats-platform/apps/web/types/supabase.ts                     | + (new)
```

---

## Next

Stage 3 (Apr 19) — Google OAuth start/callback routes, token storage in Supabase Vault, `provider_connections` row creation. Requires `GOOGLE_OAUTH_CLIENT_ID` + `GOOGLE_OAUTH_CLIENT_SECRET` in `.env.local` (see Bryan's Stage 1 homework).
