# ATS Platform — Agency Recruiting

A production-grade applicant tracking system built for recruiting agencies. Full candidate pipeline management, client portal, email integration (Gmail + Outlook), AI-powered search and copilot, GDPR compliance, and multi-tenant super-admin.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS v4, shadcn/ui tokens |
| Auth | Supabase Auth (JWT, email/password, OAuth) |
| Database | PostgreSQL 16 + pgvector via Supabase |
| ORM | Drizzle (schema in `packages/db`) |
| AI | OpenAI `text-embedding-3-small` + Claude (`claude-sonnet-4-6`) |
| Email | Gmail API (Pub/Sub push) + Microsoft Graph (webhooks) |
| Edge Functions | Supabase Edge Functions (Deno) |
| Package manager | pnpm workspaces |

---

## Quick Start

### 1. Install

```bash
pnpm install
```

### 2. Environment

```bash
cp apps/web/.env.example apps/web/.env.local
# Fill in at minimum: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
```

See [Environment Variables](#environment-variables) for the full reference.

### 3. Database

Run all migrations in order against your Supabase (or any PostgreSQL 16+) database:

```bash
for f in packages/db/migrations/*.sql; do
  psql "$DATABASE_URL" -f "$f"
done
```

Or apply individually — migrations are numbered `001`–`046` and are safe to re-run (all use `CREATE IF NOT EXISTS` / `ON CONFLICT DO NOTHING` patterns).

### 4. Run

```bash
cd apps/web
pnpm dev
# → http://localhost:3000
```

---

## Environment Variables

All variables live in `apps/web/.env.local`. Copy from `.env.example`.

### Required

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (public) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server-only, never exposed to browser) |
| `NEXT_PUBLIC_APP_URL` | Full URL of the app (e.g. `https://app.ikhaya.io`) |

### AI Features (optional but recommended)

| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | Enables semantic vector search and embedding generation |
| `ANTHROPIC_API_KEY` | Enables AI Copilot (outreach drafts, interview questions, summaries, resume parsing, skill normalisation) |

Without these, the app falls back to keyword search and the AI Copilot is disabled.

### Email Integration — Google (Gmail)

| Variable | Description |
|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` | Google Cloud OAuth 2.0 client ID |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google Cloud OAuth 2.0 client secret |
| `GOOGLE_OAUTH_REDIRECT_URI` | Must match Google Cloud Console (e.g. `https://app.ikhaya.io/api/auth/google/callback`) |
| `GOOGLE_PUBSUB_PROJECT_ID` | GCP project ID for Pub/Sub push notifications |
| `GOOGLE_PUBSUB_TOPIC` | Pub/Sub topic name (e.g. `gmail-push`) |
| `GOOGLE_PUBSUB_AUDIENCE` | JWT audience for Pub/Sub verification (your app URL) |
| `EMAIL_SYNC_ENABLED` | Master kill-switch — set `false` to disable all email sync |
| `EMAIL_GOOGLE_ENABLED` | Per-provider kill-switch |
| `EMAIL_BACKFILL_DAYS` | Days of history to backfill on first connect (default: `90`) |

### Email Integration — Microsoft (Outlook / Graph)

| Variable | Description |
|---|---|
| `MS_OAUTH_CLIENT_ID` | Azure AD app registration client ID |
| `MS_OAUTH_CLIENT_SECRET` | Azure AD client secret |
| `MS_OAUTH_REDIRECT_URI` | Must match Azure app registration |
| `MS_OAUTH_AUTHORITY` | `https://login.microsoftonline.com/common` (multi-tenant) or single tenant ID |
| `MS_GRAPH_WEBHOOK_URL` | Public URL for Graph webhook delivery |
| `MS_GRAPH_WEBHOOK_CLIENT_STATE_SECRET` | HMAC secret for webhook validation (`openssl rand -hex 32`) |
| `EMAIL_MICROSOFT_ENABLED` | Per-provider kill-switch |

### Security & Infrastructure

| Variable | Description |
|---|---|
| `EMAIL_TOKEN_ENCRYPTION_KEY` | AES-256-GCM key for OAuth token encryption at rest (`openssl rand -base64 32`) |
| `CRON_SECRET` | Bearer token protecting cron endpoints (`openssl rand -hex 32`) |
| `REDIS_URL` | Redis connection string for BullMQ job queue (optional — falls back to in-process stub) |

---

## Project Structure

```
ats-platform/
├── apps/
│   └── web/                          # Next.js 15 app
│       ├── app/
│       │   ├── (auth)/               # Login, register, agency onboarding
│       │   ├── (dashboard)/          # Protected recruiter UI
│       │   │   ├── candidates/       # Candidate list + detail
│       │   │   ├── jobs/             # Job listings + kanban pipeline
│       │   │   ├── clients/          # Client CRM
│       │   │   ├── pipeline/         # Agency-wide pipeline view
│       │   │   ├── analytics/        # KPI dashboard + reports
│       │   │   ├── outreach/         # Email sequences
│       │   │   ├── settings/         # Tags, custom fields, compliance, team
│       │   │   ├── placements/       # Placement & revenue tracking
│       │   │   ├── interviews/       # Scheduled interviews calendar
│       │   │   └── audit/            # Global audit trail
│       │   ├── portal/               # White-label client portal
│       │   ├── super-admin/          # Multi-tenant admin dashboard
│       │   └── api/
│       │       ├── search/           # Hybrid vector + keyword search
│       │       ├── candidates/[id]/  # Candidate CRUD, AI, resume, skills
│       │       ├── email/            # Email sync, matching, review queue
│       │       ├── auth/             # Google + Microsoft OAuth callbacks
│       │       ├── integrations/     # Email provider connect/disconnect
│       │       ├── cron/             # Background jobs (embed, email, webhooks)
│       │       ├── admin/            # Agency admin actions
│       │       ├── super-admin/      # Multi-tenant admin actions
│       │       ├── keys/             # API key management
│       │       └── portal/           # Portal scorecard, feedback
│       ├── components/
│       │   ├── ai/                   # AI Copilot panel
│       │   ├── candidates/           # Candidate cards, timeline, resume viewer
│       │   ├── email/                # Email timeline, thread viewer, review UI
│       │   ├── pipeline/             # Kanban board, stage editor
│       │   ├── jobs/, clients/       # Job and client components
│       │   ├── outreach/             # Sequence builder, email compose
│       │   ├── compliance/           # Consent panel, DSAR queue
│       │   ├── tasks/, layout/, ui/  # Shared UI primitives
│       │   └── onboarding/           # Agency setup flow
│       └── lib/
│           ├── ai/client.ts          # Claude API wrapper
│           ├── email/                # Gmail + Graph adapters, sync, matching
│           ├── supabase/             # Client variants, hooks, agency cache
│           ├── embeddings.ts         # OpenAI embed + keyword fallback
│           ├── csrf.ts               # CSRF protection helpers
│           ├── rate-limit.ts         # Request rate limiting
│           ├── permissions.ts        # Role-based access control
│           ├── api-key-auth.ts       # API key validation
│           ├── feature-flags.ts      # Feature gate infrastructure
│           └── webhooks/             # Outbound webhook delivery
│
├── packages/
│   └── db/
│       ├── schema/                   # Drizzle schema definitions
│       └── migrations/               # 46 SQL migrations (001–046)
│
└── supabase/
    └── functions/
        └── generate-embeddings/      # Edge Function: OpenAI embedding generation
```

---

## Database Migrations

46 migrations, numbered sequentially. Apply in order:

| Range | Area |
|---|---|
| 001–002 | Core schema + pgvector setup |
| 003–008 | Email integration, interviews, outreach |
| 009–015 | Email sync prefs, notifications, compliance, search, audit, email stages 9–10 |
| 016–019 | Team invitations, candidate merge fields, custom fields |
| 020–024 | Scorecards, offers, fee models, job recruiters, portal |
| 025–029 | Feature flags, off-limits lists, BD pipeline, AI embeddings, team pods |
| 030–033 | Alerts, commission splits, placement guarantees, submission checklist |
| 034–035 | Search milestones, target accounts + MSA |
| 036–038 | Token revision, user sessions (device tracking), candidate consent + erasure |
| 039–040 | Outbound webhooks, super-admin |
| 041–043 | Email verification tokens, impersonation, API keys |
| 044–046 | RLS audit fix, search_all() rewrite, embedding backfill |

---

## AI Features

### Semantic Search

Vector search runs at three levels depending on configuration:

| Mode | Requires | Notes |
|---|---|---|
| Semantic (vector) | `OPENAI_API_KEY` + Supabase | Understands meaning, not just keywords |
| Keyword RPC | Supabase + pg_trgm | Trigram similarity via `search_all_keyword()` |
| ilike fallback | Nothing | Always works, basic substring match |

The `/api/search` endpoint tries each layer in order and returns results from the first that has data.

### AI Copilot

Powered by Claude (`claude-sonnet-4-6`) via `lib/ai/client.ts`. Features per candidate:

- **Outreach drafts** — Personalised cold emails in professional / casual / direct tone
- **Interview questions** — 4 categories (technical, behavioural, role-specific, culture)
- **Executive summary** — Auto-generated profile summary + hire/pass verdict
- **Resume parsing** — PDF/DOCX upload → structured field extraction → auto-populates candidate record
- **Skill normalisation** — Deduplicates variants, expands abbreviations, groups by category, auto-applies role tags

All Copilot calls lazy-load on first tab open to avoid unnecessary API costs.

### Embedding Pipeline

1. **Generate**: Supabase Edge Function `generate-embeddings` calls OpenAI for 1536-dim vectors
2. **Store**: Written to both inline `embedding` columns (for search RPCs) and `*_embeddings` tables (for match scoring)
3. **Backfill**: `GET /api/cron/embed-backfill` (protected by `CRON_SECRET`) processes 20 jobs/run from the `embedding_jobs` queue
4. **Trigger**: Embedding refresh is queued automatically whenever a candidate's skills, summary, or resume changes

---

## Email Integration

10-stage Gmail + Microsoft Graph integration. Full architecture in `lib/email/README.md`.

### How it works

1. Recruiters connect Gmail or Outlook via OAuth (`/settings` → Integrations)
2. Historical emails are backfilled (default: 90 days)
3. New emails arrive in real-time via Gmail Pub/Sub or Graph webhooks
4. Emails are matched to candidates by: exact address → domain alias → thread continuity → fuzzy domain
5. Ambiguous matches surface in a review queue for manual confirmation
6. Matched emails appear in the candidate's Activity timeline

### Cron Jobs

All cron routes live under `/api/cron/` and require `Authorization: Bearer <CRON_SECRET>`.

| Endpoint | Purpose | Recommended frequency |
|---|---|---|
| `GET /api/cron/email-fallback-poll` | Poll Gmail for missed Pub/Sub messages | Every 5 min |
| `GET /api/cron/email-refresh-subscriptions` | Renew Graph webhook subscriptions | Daily |
| `GET /api/cron/embed-backfill` | Process embedding backfill queue | Every 10 min |
| `GET /api/cron/webhook-retry` | Retry failed outbound webhook deliveries | Every 5 min |

Example cron setup (Vercel Cron / GitHub Actions / Supabase pg_cron):

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://app.ikhaya.io/api/cron/embed-backfill
```

---

## Edge Functions

### `generate-embeddings`

Deploy to Supabase:

```bash
supabase functions deploy generate-embeddings --project-ref <your-ref>
```

Set secrets:

```bash
supabase secrets set OPENAI_API_KEY=sk-... --project-ref <your-ref>
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=... --project-ref <your-ref>
```

The function accepts a JSON body with `{ entity_type, entity_id }` and writes the resulting vector to both inline columns and dedicated embedding tables.

---

## Auth & Security

| Feature | Implementation |
|---|---|
| Authentication | Supabase Auth (JWT, 15-min expiry, refresh rotation) |
| Multi-tenancy | Every query scoped to `agency_id` via RLS + application layer |
| CSRF protection | `Content-Type: application/json` enforcement + Origin validation |
| Token encryption | AES-256-GCM for OAuth refresh tokens at rest |
| API keys | SHA-256 hashed, scoped (read/write/admin), expirable |
| Impersonation | Admin login-as with consent flow + full audit trail |
| Rate limiting | Per-IP + per-user limits on sensitive endpoints |
| GDPR | Candidate consent capture, right-to-erasure cascade, DSAR queue |
| Audit log | All state changes recorded in `audit_events` table |
| Device tracking | User sessions tracked by device fingerprint, cross-tab logout |
| PKCE | Google and Microsoft OAuth flows use PKCE |
| Webhook security | Pub/Sub JWT verification, Graph HMAC validation, outbound HMAC signing |

---

## Key Routes

### Recruiter Dashboard

| Route | Description |
|---|---|
| `/candidates` | Candidate list with semantic AI search toggle |
| `/candidates/[id]` | Full candidate profile — activity, resume, tasks, AI copilot |
| `/jobs` | Job listings |
| `/jobs/[id]` | Kanban pipeline for a specific job |
| `/jobs/[id]/settings` | Pipeline stages, interview plan, job intake |
| `/pipeline` | Agency-wide pipeline overview |
| `/clients` | Client CRM directory |
| `/clients/[id]` | Client detail + BD pipeline |
| `/analytics` | KPI dashboard, reports, client analytics |
| `/placements` | Placement & revenue tracking |
| `/interviews` | Scheduled interviews calendar |
| `/outreach` | Email sequence builder + inbox |
| `/settings` | Tags, custom fields, team, integrations, compliance |
| `/audit` | Global audit trail |

### Portal & Admin

| Route | Description |
|---|---|
| `/portal/[slug]` | White-label client portal (scorecards, candidate review) |
| `/super-admin` | Multi-tenant admin dashboard |
| `/super-admin/tenants/[id]` | Tenant drill-down |

### API

| Endpoint | Description |
|---|---|
| `GET /api/search?q=` | Unified hybrid search (candidates, jobs, clients) |
| `POST /api/candidates/search` | Candidate-only semantic search |
| `POST /api/candidates/[id]/parse-resume` | Resume upload → AI structured extraction |
| `POST /api/candidates/[id]/normalize-skills` | AI skill deduplication + tag suggestion |
| `POST /api/candidates/[id]/ai/summary` | Claude executive summary + verdict |
| `POST /api/candidates/[id]/ai/outreach` | Claude cold outreach draft |
| `POST /api/candidates/[id]/ai/interview` | Claude interview question generation |

---

## Roles & Permissions

| Role | Access |
|---|---|
| `owner` | Full agency control, billing, user management |
| `admin` | All features, team management |
| `recruiter` | Candidates, jobs, clients, email |
| `viewer` | Read-only |

Roles are enforced at the RLS level (Supabase row-level security) and at the application API layer.

---

## Development Notes

### TypeScript

Strict mode. All component props typed. No `any` in production paths.

### Supabase hooks

Data fetching uses custom hooks in `lib/supabase/hooks.ts`. React Query is used for high-frequency reads (jobs list, dashboard KPIs) to deduplicate queries and cache aggressively.

### Feature flags

Features can be gated via `lib/feature-flags.ts`. Flags are read from the `feature_flags` table (per-agency overrides) or environment variables.

### Email library

The email library (`lib/email/`) is provider-agnostic. Both Gmail and Graph adapters implement the same `EmailProvider` interface. Adding a new provider requires implementing `connect()`, `backfill()`, `syncDelta()`, `disconnect()`, and registering a webhook handler.

---

## v1.1 Backlog (deferred by design)

- Email send from ATS (`sendMessage()` interface defined, not wired to UI)
- S3/R2 offload for large email body storage (inline storage adequate for < 50k messages/agency)
- ML-based fuzzy candidate matching (domain-alias matching ships in v1)
- ZIP export compression (currently uncompressed for zero-dependency simplicity)
- Automated `metrics_email_sync` population cron (table exists, backfill is manual)
- Attachment indexing and download

---

## License

Proprietary — Ikhaya.io
