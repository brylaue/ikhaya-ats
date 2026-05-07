# Ikhaya ATS Platform — Complete Project Context

> Single-source context for any agent working on this codebase. Updated 2026-04-20.

---

## 1. What This Is

Agency-focused ATS/CRM for staffing and executive search firms. Built by Bryan Laue (founder, Ikhaya). Market gap: legacy tools (Bullhorn, PCRecruiter) have agency features but terrible UX; modern tools (Loxo, Crelate) have better design but aren't agency-first. Ikhaya aims to nail both.

Design north star: **Ashby** (ashbyhq.com) — but translated for agency model where clients are external companies, not internal hiring teams.

---

## 2. Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 15 (App Router), React 19, TypeScript |
| UI | Tailwind CSS, shadcn/ui, TanStack Table v8 |
| DnD | @dnd-kit/core + @dnd-kit/sortable |
| DB | PostgreSQL 16+ (Supabase), pgvector, pg_trgm, citext |
| Auth | Supabase Auth (`@supabase/ssr`) — NOT Clerk |
| Search | pgvector semantic (1536-dim, OpenAI text-embedding-3-small) + keyword fallback |
| Storage | S3/Cloudflare R2 (planned for resumes/email bodies) |
| Queue | Redis + BullMQ (planned; current async = setTimeout) |
| Package mgr | pnpm workspaces |
| Hosting | Netlify/Vercel (vercel.json + netlify.toml both exist) |

**Supabase project:** `jjxkzmxugguietyfqqai` (us-east-1). Seed agency ID: `a0000000-0000-0000-0000-000000000001`.

---

## 3. Repo Structure

```
ATS + Products/
├── ats-platform/                  # Main monorepo
│   ├── apps/
│   │   ├── web/                   # Next.js app (primary)
│   │   │   ├── app/
│   │   │   │   ├── (auth)/        # Login, register
│   │   │   │   ├── (dashboard)/   # All protected routes
│   │   │   │   ├── api/           # Route handlers
│   │   │   │   └── portal/        # Client-facing portal
│   │   │   ├── components/        # React components
│   │   │   ├── lib/               # Business logic, DB, email
│   │   │   ├── hooks/             # Custom hooks
│   │   │   └── types/             # TypeScript interfaces
│   │   └── api/                   # Express API (secondary, has Dockerfile)
│   └── packages/
│       └── db/
│           ├── schema/            # Drizzle schema
│           └── migrations/        # 9 SQL migrations (001–009)
├── ats-chrome-extension/          # LinkedIn/GitHub scraper (MV3, zero deps)
├── marketing-site.jsx             # SaaS marketing page (React)
├── checkout-page.jsx              # 3-step checkout flow (React)
└── [docx/xlsx deliverables]       # Specs, briefs, backlog
```

---

## 4. Database Schema (10 migrations)

**Core tables (001):** orgs, users, clients, contacts, skills, tags, candidates, candidate_tags, candidate_skills, resumes, work_history, pipelines, pipeline_stages, jobs, applications, activities, tasks, placements, audit_log

**Search (002):** HNSW vector indexes, `search_all()` function

**Email (003):** provider_connections, ikhaya_tenant_ms_tenants, email_threads, email_messages, candidate_email_links, sync_events — all with RLS via `current_agency_id()`

**Additional (004–009):** scheduled_interviews, per_job_pipeline_stages, job_interview_plans, outreach_sequences, sequence_enrollments, email_sync_preferences, notifications

**Key enums:** candidate_status (5), job_status (5), job_type (4), application_status (9), client_decision (3), user_role (6), activity_type (10), stage_type (8), email_provider (2), match_strategy (4)

---

## 5. Pages Built

| Route | Status | Description |
|---|---|---|
| `/login`, `/register` | Done | Mock auth (any creds work) |
| `/dashboard` | Done | KPI cards, recent activity |
| `/candidates` | Done | List + boolean search + saved alerts + import CSV |
| `/candidates/[id]` | Done | Two-col profile: sidebar + activity timeline + tasks + email |
| `/candidates/new` | Done | Create candidate form |
| `/clients` | Done | Client directory with health scores |
| `/clients/[id]` | Done | Overview/Jobs/Contacts/Tasks tabs |
| `/jobs` | Done | Card grid with filters; Add Job modal (4-step wizard) |
| `/jobs/[id]` | Done | Pipeline (Kanban) / Funnel / Tasks tabs |
| `/jobs/[id]/settings` | Done | Per-job pipeline stage editor |
| `/pipeline` | Done | Agency-wide group-by view (recruiter/client/priority) |
| `/placements` | Done | Placements list |
| `/placements/[id]` | Done | Placement detail |
| `/analytics` | Done | 4-tab: Overview/Recruiters/Clients/Revenue |
| `/reports` | Done | Report page (no custom builder yet) |
| `/outreach` | Done | Sequences + Inbox tabs; compose modal |
| `/outreach/sequences/[id]` | Done | Sequence detail/editor |
| `/sourcing` | Done | Sourcing page |
| `/interviews` | Done | Interviews page |
| `/settings` | Done | 6-section: Org/Team/Pipeline/Notifications/Integrations/Billing |
| `/settings/integrations` | Done | Email provider cards (Gmail + Outlook) |
| `/help` | Done | Articles/Shortcuts/FAQ/Contact tabs |
| `/onboarding` | Done | 5-step onboarding modal |
| `/portal/[slug]` | Done | Client feedback portal (advance/hold/pass) |
| `/portal/[slug]/compare` | Done | Side-by-side candidate comparison |
| `/portal/[slug]/candidate/[id]` | Done | Individual candidate portal view |

---

## 6. Key Components

- **kanban-board.tsx** — dnd-kit with DragOverlay + optimistic updates
- **funnel-chart.tsx** — conversion funnel visualization
- **activity-timeline.tsx** — note composer, date groups, filter chips
- **import-modal.tsx** — 3-step CSV import: upload → map → preview
- **submit-to-client-modal.tsx** — job select → cover note → review → submit
- **add-job-modal.tsx** — 4-step wizard: Role/Comp/Team/Pipeline
- **email-compose-modal.tsx** — Gmail-style compose with templates
- **task-panel.tsx** — add/complete/delete, overdue highlighting
- **global-search.tsx** — Cmd+K, arrow nav, router.push
- **notifications-panel.tsx** — bell dropdown, all/unread tabs
- **onboarding-modal.tsx** — 5-step with progress bar
- **EmailIntegrationCard.tsx** — provider connection status
- **CandidateEmailTimeline.tsx** — email thread display
- **FuzzyReviewInbox.tsx** — unclaimed email match review
- **AdminEmailSection.tsx** — admin stats + purge/export

---

## 7. Email Integration (10-stage feature, Apr 17–26)

**Architecture:** Provider-agnostic `EmailProvider` interface → Gmail adapter + Graph adapter → matcher (exact/alt/thread/fuzzy) → sync worker → candidate_email_links

**Stages completed (all 10):**
1. Foundation + types + OAuth docs
2. DB migrations (003_email_integration.sql)
3. Google OAuth + token encryption (AES-GCM)
4. Microsoft OAuth + admin-consent tenant flow
5. Opt-in UI + Settings integration
6. Gmail backfill + matcher v1 (90-day window)
7. Graph backfill + cross-provider threading
8. Realtime: Pub/Sub + Graph webhooks + subscription refresher
9. Timeline UI + fuzzy review inbox
10. Admin dashboard + purge + export + runbook

**Feature flags:** `EMAIL_SYNC_ENABLED`, `EMAIL_GOOGLE_ENABLED`, `EMAIL_MICROSOFT_ENABLED`

**Known gaps:** No message body compression (S3 not implemented), no dedup across syncs, backfill is fire-and-forget (no retries), no rate limiting per user.

---

## 8. Chrome Extension

MV3 manifest, zero npm dependencies, 7 files (~50KB). Scrapes LinkedIn profiles/companies/jobs and GitHub profiles/orgs. Features: duplicate detection (email+name), merge/update existing records, work history auto-insert. Auth via Supabase session cookie or pasted token.

---

## 9. Marketing Site + Checkout

**marketing-site.jsx:** Sticky nav, hero, 12 feature cards with tier badges, pricing (monthly/annual toggle), 7 FAQs, CTA, full footer. Plans route to checkout via `?plan=` param.

**checkout-page.jsx:** 3-step flow (Plan → Account → Payment). Payment methods tier-gated: card for all, ACH + Net 30 for Pro only. Stripe shells ready to connect.

**Needs:** `PRODUCT_NAME`, `CHECKOUT_URL`/`MARKETING_URL` vars, Stripe API keys, footer links.

---

## 10. Data Layer

**Supabase hooks** (`lib/supabase/hooks.ts`): `useCandidates`, `useJobs`, `useCompanies`, `useCandidate(id)`, `useJob(id)`, `useDashboardStats`, `usePortalData(portalSlug)`.

**Mock data migration: COMPLETE.** Zero `@/lib/mock-data` imports remain. All pages use Supabase.

---

## 11. Backlog Status (43 stories, 398 pts)

### Done (20 stories)
US-010 Candidate Profile, US-011 Search, US-013 Activity Timeline, US-016 Bulk Import, US-020 Job Requisitions, US-021 Client Stage Config, US-022 Stage Mapping, US-030 Kanban Pipeline, US-033 Tasks, US-040 Client Portal, US-041 Submit to Portal, US-042 Client Feedback, US-050 Email Sequences, US-052 Email Integration, US-060 Funnel Viz, US-061 Recruiter Dashboard, US-064 Revenue Forecasting, US-070 Global Search

### In Progress (10 stories)
US-001 Registration, US-004 SSO/OAuth, US-012 Tagging Taxonomy, US-031 List Pipeline View, US-034 SLA Alerts, US-045 Portal Notifications, US-062 Client Analytics, US-063 Custom Reports, US-071 Saved Search Alerts, US-080 Chrome Extension, US-091 Audit Trail, US-092 Data Export

### Backlog — Not Started (13 stories)
US-002 Team Invitations, US-003 RBAC, US-014 Relationship Graph, US-015 Duplicate Detection, US-023 Job Board Publishing, US-032 Workflow Automation, US-043 Side-by-Side Comparison, US-044 Interview Scheduling Portal, US-046 Portal Audit Trail, US-051 SMS Outreach, US-081 REST API + Webhooks, US-082 Calendar Integration, US-090 Custom Fields

---

## 12. Active Sessions (as of 2026-04-20)

| Session | Status | Work |
|---|---|---|
| Build engineered solution from designs | Running (2113+ turns) | Main build agent — implementing from design specs |
| ATS email stage 5 opt-in UI | Running | Email UI components |
| ATS email stage 8 realtime | Idle (complete) | Pub/Sub + Graph webhooks |
| ATS email stage 7 graph backfill | Running | Graph adapter + cross-provider matcher |
| Design SaaS pricing website | Idle (complete) | marketing-site.jsx + checkout-page.jsx |
| ATS email stage 6 gmail backfill | Idle (complete) | Gmail adapter + matcher v1 |
| ATS email stage 4 microsoft oauth | Idle (complete) | MS OAuth + admin consent |
| ATS email stage 3 google oauth | Idle (complete) | Google OAuth + encryption |
| ATS email stage 2 schema (×3) | Idle (complete) | 003_email_integration.sql |
| Build Chrome extension | Idle (complete) | ats-chrome-extension/ |
| Find hiring contacts on LinkedIn | Idle (complete) | Lead research via browser |

---

## 13. Design Principles

From Ashby research, translated for agency model:

1. **Color-coded health** — red (stale), amber (pending), green (moving) on candidates + client relationships
2. **Medium density** — power-user friendly, not cramped or airy
3. **Two-panel candidate detail** — profile left, activity/timeline right
4. **Kanban as primary pipeline** — scrollable columns, drag-and-drop
5. **Filter chips + saved searches** — tag-based, multi-select
6. **Agency-specific features** Ashby doesn't have: submission workflow, client portal, fee/revenue tracking, placement closure, guarantee periods

---

## 14. Key Conventions

- **Keyboard shortcuts:** ⌘K (search), ? (help), G+C/J/P/A/O/L/S/H (navigate)
- **Git flow:** Feature branch per stage/feature, PR per stage, `STAGE_N_PR.md` at repo root
- **Git limitation:** `.git/config.lock` in Cowork mount; git ops must happen on Bryan's local machine
- **Auth:** Supabase Auth, not Clerk (corrected from earlier memory)
- **RLS:** All tables agency-isolated via `current_agency_id()` function
- **Feature flags:** Environment variables (`EMAIL_SYNC_ENABLED`, etc.)
- **Sandbox note:** npm blocked (403), pnpm/tsc unavailable; pre-installed packages at `/usr/local/lib/node_modules_global/`

---

## 15. Deliverable Docs in Workspace

| File | Purpose |
|---|---|
| `ATS_Build_Agent_Brief.docx` | Engineering agent instructions |
| `ATS_Design_Agent_Brief.docx` | Design agent instructions |
| `ATS_Competitive_Strategy_Brief.docx` | Market positioning |
| `ATS_Design_Research.docx` | UX research findings |
| `ATS_Email_Integration_Spec.docx` | Email feature spec (Gmail + Graph) |
| `ATS_Gmail_Integration_Spec.docx` | Gmail-specific spec |
| `ATS_User_Stories_and_Workflows.docx` | User stories + workflow diagrams |
| `ATS_Tech_Stack_Recommendation.docx` | Stack rationale |
| `ATS_Prioritized_Backlog.xlsx` | 43 stories, 10 epics, 6 sprints, DoD |
| `ATS_Prototype.html` | Interactive HTML prototype |
| `ATS_ClientPortal.html` | Client portal prototype |

---

## 16. What's Next (Priority Order)

1. **Finish auth foundation** — RBAC (US-003), team invitations (US-002)
2. **Duplicate detection & merge** (US-015) — data quality foundation
3. **Workflow automation builder** (US-032) — key differentiator, high complexity
4. **Custom fields** (US-090) — extensibility for agencies
5. **Side-by-side comparison in portal** (US-043) — high-impact UX
6. **List/table pipeline view** (US-031) — complete the pipeline UX
7. **REST API + webhooks** (US-081) — platform extensibility
8. **Calendar integration** (US-082) — scheduling completeness
9. **SMS outreach** (US-051) — channel completeness
10. **Job board publishing** (US-023) — distribution

**Email integration post-ship improvements:** Queue-based sync (replace setTimeout), S3 body storage, duplicate detection, full-text email search, attachment handling.
