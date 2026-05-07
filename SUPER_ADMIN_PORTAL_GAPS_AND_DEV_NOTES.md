# Super Admin Portal — Gaps & Dev Notes

**Date:** 2026-04-22
**Author:** Claude (dev role)
**Purpose:** Coordinate with the PM agent who just landed **EP-28 Super Admin Portal** (US-455–US-462, 66pts) so nothing is duplicated, while flagging gaps I see against Bryan's asks and providing dev-side implementation notes.

---

## What the PM agent already shipped

8 stories, covering:
- **US-455** Super-admin foundation + overview dashboard (protected route, platform stats)
- **US-456** Tenant list w/ usage stats (searchable, sortable, filterable by tier)
- **US-457** Per-tenant drill-down (org, users, usage breakdown, integrations list, compliance, audit tail)
- **US-458** Tenant impersonation (support login with JWT + banner + audit)
- **US-459** Per-tenant feature flag management
- **US-460** Usage metrics & quota monitoring (charts, alerts, CSV export)
- **US-461** Cross-org audit log viewer
- **US-462** Tenant provisioning tools (create org, reset password, plan change, archive)

Mapping against Bryan's asks (2026-04-22):

| Bryan's ask | Covered by |
|---|---|
| Admin visibility of their instance | US-455, US-457 |
| Triage | US-458, US-461 |
| Review settings | US-457, US-459 |
| Log what they are integrating with | US-457 (list only — see Gap 2 below) |
| Usage | US-460, US-457 |
| How expansive their DB | US-457 storage MB, US-460 storage vs limit |
| Cost monitoring of their instance | **GAP** — see Gap 1 |

---

## Gaps I see (suggested supplemental stories — for PM to accept/reject)

### Gap 1 — Cost Attribution / Per-Tenant Margin (proposed US-463)

**What's missing:** US-460 shows what each tenant *uses* (storage MB, API calls, AI credits, emails sent). It does NOT show what they *cost us* (compute time, egress GB, AI tokens at provider rates, Supabase row-reads, storage-tier delta). Without this we can't compute per-tenant margin, identify unprofitable accounts, or price tiers defensibly.

**Proposed story:**
- **Title:** Per-Tenant Cost Attribution & Margin Reporting
- **As:** Ikhaya Owner
- **Summary:** Attribute infra spend (compute, DB, storage, egress, AI provider tokens, email delivery, SMS delivery) to each org so we can compute monthly cost vs. MRR and margin per tenant.
- **AC:** Nightly job aggregates cost lines per `org_id`: Supabase CPU+DB+storage+egress (pulled from Supabase billing API or static allocation), email delivery @ $/1k, SMS @ $/msg, AI token spend (when not BYO per US-441), Netlify bandwidth attribution; per-org monthly cost surfaced on tenant drill-down (US-457); margin = MRR − cost; low-margin alert.
- **P/Size:** P1 / L (13pts)
- **Deps:** US-457, US-460, US-441 (for AI cost bypass when BYO)
- **Why P1 not P0:** We can ship the portal without this, but it's the single most important CS/ops signal for an early-stage SaaS. BYO AI via US-441 will shift this significantly for Pro-tier orgs.

### Gap 2 — Integration Inventory & Connection Health (proposed US-464)

**What's missing:** US-457 drill-down shows "active integrations" as a list. Missing: which provider, OAuth scope granted, last successful sync, current error state, per-integration volume (events/day), ability to rotate/revoke from super-admin side during support calls.

**Proposed story:**
- **Title:** Per-Tenant Integration Inventory & Health Panel
- **As:** Ikhaya Support
- **Summary:** For each tenant, enumerate every OAuth-connected or API-keyed integration, its current state, its volume, and give support controls to rotate/revoke on the tenant's behalf.
- **AC:** Per connection: provider (Gmail, Outlook, Gong, Otter, Fireflies, Zoom, Teams, Meet, DocuSign, Adobe Sign, Broadbean, Idibu, etc.), granted scopes, last-success-ts, last-error-ts, error message, 7-day volume, connection owner (user within tenant), support actions (force-refresh, revoke, mark stale); surfaces events from US-083 (webhook log) and US-135 (meeting integration); read-only unless support action taken.
- **P/Size:** P1 / M (8pts)
- **Deps:** US-457, US-081 service accounts (US-401), US-135 meeting platform, US-174 e-sig

### Gap 3 — Tenant Health Score + Churn Risk (proposed US-465)

**What's missing:** Reactive CS only — we see a tenant is in trouble once they churn. A health score lets us intervene early.

**Proposed story:**
- **Title:** Tenant Health Score & Churn Risk Signals
- **As:** Ikhaya Owner
- **Summary:** Composite 0–100 health score per tenant with component breakdown and trend.
- **AC:** Components: 7-day active users ÷ seats purchased, WoW usage trend (jobs, candidates, emails), support ticket count, AR aging, last login recency, integration error rate, feature-flag adoption breadth; red/amber/green bucket; weekly digest to the owner email; surfaces on tenant list (US-456) as a column + sort.
- **P/Size:** P2 / M (8pts)
- **Deps:** US-456, US-460, US-461

### Gap 4 — Billing & Revenue Panel per Tenant (proposed US-466)

**What's missing:** US-462 lets us create an org and change plan, but there's no billing overview — MRR, payment history, dunning state, credits, refunds.

**Proposed story:**
- **Title:** Per-Tenant Billing & Revenue Panel
- **As:** Ikhaya Owner
- **Summary:** Billing overview inside the tenant drill-down showing current plan, MRR, payment history, upcoming invoice, credits applied, past refunds.
- **AC:** Reads from Stripe (when live) or manual billing table (pre-Stripe); shows MRR, LTV-to-date, last 12 invoices with status, dunning banner if overdue, apply credit action, issue refund action (both audited), link out to Stripe dashboard.
- **P/Size:** P2 / M (8pts)
- **Deps:** US-457, US-462, Stripe integration (future)

### Gap 5 — Support Ticket Linkage (proposed US-467 — nice-to-have)

**What's missing:** When a tenant calls support, we should be able to link the conversation (Intercom / Linear / Zendesk / email thread) to the tenant in the portal so history is one click away.

**Proposed story:**
- **Title:** Tenant ↔ Support Ticket Linkage
- **AC:** Attach ticket URL/ID to tenant; recent tickets shown on drill-down; webhook from support tool updates status; adds to tenant health score (US-465).
- **P/Size:** P2 / S (3pts)
- **Deps:** US-457, US-465, chosen support tool

**Sum of proposed supplements:** 5 stories, ~40pts (1 P1-L, 1 P1-M, 3 P2)

---

## Reconciliation — US-403 vs US-458 (NOT a duplicate)

Both stories are about impersonation but operate at different trust boundaries:

- **US-403 (EP-30 Trust & Security):** *Intra-tenant* impersonation — an agency admin within a customer org impersonating one of their own users (e.g., a senior recruiter seeing what a junior sees for coaching). Authorized by org-level policy and visible to org members.
- **US-458 (EP-28 Super Admin Portal):** *Cross-tenant* impersonation — Ikhaya platform staff logging into a tenant to troubleshoot, with short-lived JWT, banner, and audit. Never visible to tenant admins as an internal user.

Same technical primitive (impersonation JWT + audit row with impersonator_id), different authorization scope. Recommend a single underlying service that both call with different policy checks.

---

## Dev-side implementation notes (reference for whoever builds EP-28)

### Data model sketch

```sql
-- Usage meter (per-tenant counters, written at event time)
CREATE TABLE usage_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES agencies,
  user_id     uuid REFERENCES users,
  metric      text NOT NULL,   -- 'api_call','ai_tokens','email_sent','sms_sent','storage_delta_bytes','egress_bytes'
  value       numeric NOT NULL,
  provider    text,            -- 'openai','anthropic','sendgrid','twilio','supabase'
  cost_usd    numeric,         -- at event time (null ok; computed nightly)
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata    jsonb
);
CREATE INDEX ON usage_events (org_id, metric, occurred_at DESC);

-- Daily rollup (read path; rebuilt by scheduled function)
CREATE TABLE usage_daily (
  org_id     uuid NOT NULL,
  day        date NOT NULL,
  metric     text NOT NULL,
  value_sum  numeric NOT NULL,
  cost_sum   numeric NOT NULL,
  PRIMARY KEY (org_id, day, metric)
);

-- Integration inventory
CREATE TABLE integrations (
  id             uuid PRIMARY KEY,
  org_id         uuid NOT NULL REFERENCES agencies,
  provider       text NOT NULL,
  owner_user_id  uuid REFERENCES users,
  scopes         text[] NOT NULL,
  status         text NOT NULL,  -- 'active','error','expired','revoked'
  last_success_at timestamptz,
  last_error_at   timestamptz,
  last_error_msg  text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Impersonation audit (underpins both US-403 and US-458)
CREATE TABLE impersonation_sessions (
  id              uuid PRIMARY KEY,
  impersonator_id uuid NOT NULL REFERENCES users,
  impersonated_id uuid NOT NULL REFERENCES users,
  scope           text NOT NULL,  -- 'intra_tenant' (US-403) | 'cross_tenant' (US-458)
  reason          text NOT NULL,
  issued_at       timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  ended_at        timestamptz
);
```

### Cost attribution pipeline (for US-463 if approved)

Nightly Supabase scheduled function:
1. Pull Supabase platform billing API → allocate compute/DB/storage to orgs proportional to row-read counts (or flat allocation if unmeasurable).
2. Sum `usage_events` by `org_id, day, metric`, multiply by provider rate card, write to `usage_daily`.
3. Sum `usage_daily` by `org_id, month` → `org_cost_monthly`.
4. Surface on US-457 drill-down alongside MRR from billing table → margin.

### Cross-org query pattern (service role boundary)

The super-admin routes must use the Supabase service-role key and must NEVER route through the client-side Supabase SDK. Every super-admin query should be in a server component or route handler with an explicit middleware guard (already implemented in US-455 per the AC: `SUPER_ADMIN_EMAILS` env check + 404 on miss — not 403, to avoid surface-level disclosure that a super-admin panel exists, consistent with the US-068 exec dashboard pattern).

### Feature flag storage (for US-459)

Recommend a simple `org_feature_flags` table over an external service like LaunchDarkly/GrowthBook for v1:

```sql
CREATE TABLE org_feature_flags (
  org_id    uuid NOT NULL REFERENCES agencies,
  flag_key  text NOT NULL,
  enabled   boolean NOT NULL,
  updated_by uuid NOT NULL REFERENCES users,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, flag_key)
);

CREATE TABLE feature_flag_history (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL,
  flag_key   text NOT NULL,
  old_value  boolean,
  new_value  boolean,
  changed_by uuid NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
```

Default-off convention per US-459 AC. Evaluation middleware reads from a per-request cached map to avoid N+1.

### Performance for 1000+ orgs (per US-456 note)

- Tenant list grid reads from `usage_daily` latest-day snapshot + `agencies` joined once; avoid per-row computed columns.
- Row-level real-time counts (users, jobs, candidates) come from `mv_tenant_summary` materialized view refreshed nightly + on tenant mutation.
- Index on `agencies(plan_tier, last_activity_at)` for common sort paths.

---

## Recommended next steps

1. **PM agent:** decide fate of proposed US-463–US-467. My recommendation: ship US-463 (cost attribution) at P1, US-464 (integration inventory health) at P1, defer US-465/466/467 until portal v1 ships.
2. **Dev (me):** Hold on architecture execution until PM closes loop on additions. If approved, I'll write a single "Super Admin Portal Implementation Reference" doc alongside the stories.
3. **Reconciliation:** Add a row to PM Decisions confirming US-403 ≠ US-458, so neither is retired as a duplicate.

---

## Coordination note

I'm not adding these proposed stories to the xlsx — that would step on the PM agent's active work. This doc is the handoff. PM agent: please pick up 1–5 proposed supplements and slot as appropriate, or write me back via Bryan with your call.

— Claude (dev role)
