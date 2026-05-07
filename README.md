# Ikhaya ATS + Products

Monorepo for **Ikhaya** — an applicant tracking system and recruiting CRM purpose-built for staffing agencies. Includes the main web app, a Chrome extension for LinkedIn candidate capture, the design system, and the full product backlog and specs.

## Repository layout

| Path | What it is |
|---|---|
| [`ats-platform/`](./ats-platform) | **Main app.** Next.js 15 + Supabase + Drizzle monorepo with the recruiting CRM, client portal, email integration (Gmail + Microsoft Graph), AI copilot, and super-admin. See [`ats-platform/README.md`](./ats-platform/README.md) for stack details and setup. |
| [`ats-chrome-extension/`](./ats-chrome-extension) | Chrome extension that scrapes LinkedIn profiles and pushes candidates into the ATS. See [`ats-chrome-extension/SETUP.md`](./ats-chrome-extension/SETUP.md). |
| [`apps/web/`](./apps/web) | Standalone web app (separate from the main `ats-platform` workspace). |
| [`templates/`](./templates) | Reusable design and feature spec templates — design system reference, component spec, dev spec, feature brief. |
| [`Design/`](./Design) | Design files and visual references. |

## Product docs at the root

The non-code files at the repo root are the product context behind the build — kept in-repo so they're versioned alongside the code:

- `PROJECT_CONTEXT.md` — top-level project overview
- `BACKLOG_HANDOFF_PM.md`, `BACKLOG_RESEARCH_v7_PROPOSALS.md` — backlog state and research
- `ATS_Prioritized_Backlog.xlsx` — the live prioritized backlog
- `ATS_*.docx` — strategy briefs, design research, build/design agent briefs, email integration spec, tech stack recommendation, user stories
- `ATS_Prototype.html`, `ATS_ClientPortal.html` — interactive prototypes
- `Ikhaya ATS Codebase Audit — May 2026.docx` — most recent codebase audit
- `SUPER_ADMIN_PORTAL_GAPS_AND_DEV_NOTES.md` — open work on super-admin

## Quick start (main app)

```bash
cd ats-platform
pnpm install
cp apps/web/.env.example apps/web/.env.local   # fill in Supabase keys
cd apps/web && pnpm dev                         # → http://localhost:3000
```

Full setup, env reference, and deployment notes live in [`ats-platform/README.md`](./ats-platform/README.md).

## Status

Ikhaya is in active solo development. Backlog snapshot as of 2026-05-06: 253 stories shipped, 0 open backlog items, all 10 email-integration stages live. Stack: Next.js 15, React 19, Supabase (Postgres 16 + pgvector), Drizzle, Tailwind v4, shadcn/ui, Claude + OpenAI for AI features.

## License

No license file yet — all rights reserved by default. If you'd like to use any of this code, open an issue.
