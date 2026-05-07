# Backlog Research v7 — Proposal for Add / Edit / Change / Remove

**Date:** 2026-04-22
**Inputs:** 3 parallel research threads (2025-26 competitor scan, enterprise procurement checklist, 5 new persona blind-spot passes)
**Current backlog:** 151 stories · 24 epics (EP-24 Tech Health added since PM pass)
**Status:** Adjudicated by Bryan 2026-04-22. v7 pass applied to xlsx.

## Bryan's adjudication (2026-04-22)

- **SAML 2.0 + SCIM (US-400):** PUNTED. Keep Google/MS OAuth only for now.
- **MFA:** SIMPLIFIED to email verification for sensitive actions (not TOTP/WebAuthn).
- **Contract staffing epic (EP-28):** SHELVED for now — not in current ICP/GTM. Concept preserved in this doc but no stories added.
- **Client-tool integration stance:** CONFIRMED as a cross-cutting principle. We integrate with what clients already use (e-sig, meetings, job boards, assessments, BG checks) — we don't build our own.
- **MCP + BYO-AI:** NEW DIRECTION. Expose our platform as an MCP server so users can leverage Claude, OpenAI, or other AI clients against our data. Added as new **EP-29 AI Platform & MCP**.

See final "Executed" section at the bottom for what actually shipped into v7.

---

## TL;DR

- **Adds:** 22 new stories across 4 new epics (Trust/Security, DEI/Compliance, Contract Staffing, Distribution). These are mostly *enterprise-procurement gates* and *regulatory* — the stuff that stalls mid-market deals in legal review.
- **Edits:** 12 existing stories need rescope or AC extension (most were written before the market moved).
- **Removes:** 0 recommended cuts. 3 candidates to *reconsider priority* (below).
- **Deferred:** 6 items competitors shipped that conflict with Bryan's "clients bring their tools" positioning — flagged but not recommended.

---

## ADDS (22 new stories, grouped by epic)

### New EP-25: Trust & Enterprise Security *(7 stories — most are mid-market deal-gates)*

Rationale: We have RBAC + Google/MS OAuth. That's Starter tier. To sell beyond ~25 seats agencies expect SAML/SCIM, MFA, tamper-evident audit, and a status page as table stakes.

| ID | Title | P | Size | Notes |
|----|-------|---|------|-------|
| US-400 | SAML 2.0 SSO + SCIM 2.0 Provisioning | P0 | L (21) | Okta/Entra/JumpCloud. Kills mid-market deals if missing. |
| US-401 | MFA / 2FA (TOTP + WebAuthn) | P0 | M (8) | Org-wide enforcement, recovery codes, audit. |
| US-402 | Service Accounts + Scoped API Keys | P1 | M (8) | Extends US-081. Rotation, revocation, per-scope audit. |
| US-403 | Session Controls (idle timeout, concurrent caps, force-logout) | P1 | M (5) | Extends US-001. |
| US-404 | Admin Impersonation / Login-As | P1 | S (3) | With explicit consent + audit trail. |
| US-405 | IP Allowlist + Geo Restrictions | P2 | M (8) | Org-level CIDR + country block. |
| US-406 | Public Status Page + Uptime SLA | P1 | S (3) | status.{domain}, historical uptime, 99.5% commitment. |

### New EP-26: Data Governance & Compliance *(6 stories — GDPR/CCPA + AI Act prep)*

Rationale: RTBF, retention, consent, candidate SAR. Zero coverage today. GDPR alone is a deal-killer in EU and increasingly in the US.

| ID | Title | P | Size | Notes |
|----|-------|---|------|-------|
| US-410 | Right to be Forgotten (cascade delete) | P0 | L (13) | Cascades through activity, notes, emails, attachments, reports. |
| US-411 | Configurable Data Retention Policies | P1 | M (8) | Soft-delete candidates inactive Nyr; exempt legal holds. |
| US-412 | Consent Management (per channel, revocable, provable) | P1 | M (8) | Feeds US-050 email, US-051 SMS, US-054 calls. Foundation. |
| US-413 | Candidate Data Portal (SAR self-serve) | P1 | M (8) | Candidate logs in → export my data (JSON+PDF) → delete. |
| US-414 | Legal Hold / Compliance Hold | P2 | S (3) | Suspend auto-delete on named candidates/reqs. |
| US-415 | Data Residency / Region Pinning | P2 | L (13) | EU/US/AU deployments. Only if chasing EU enterprise. |

### New EP-27: DEI, Pay Transparency & AI Transparency *(4 stories)*

Rationale: EEO-1 capture, adverse-impact analysis, pay-transparency logging, and AI Act transparency labels. Competitor differentiator in procurement (Ashby+SeekOut now lead on this).

| ID | Title | P | Size | Notes |
|----|-------|---|------|-------|
| US-420 | EEO-1 Demographic Capture + Attestation | P1 | M (5) | Candidate opt-in, "declined" state, clean EEO-1 export. |
| US-421 | Adverse Impact Analysis | P1 | L (13) | Selection-rate by protected class, 80% rule flag. Needs US-420. |
| US-422 | AI Transparency Label + Decision Log | P2 | M (5) | When US-110/111/112 touches a record → log it, let candidate request model card. EU AI Act. |
| US-423 | Pay Transparency & Equity Report | P2 | M (5) | Monthly offer-vs-accept vs demographic export. |

### New EP-28: Contract / Temp Staffing Lifecycle *(5 stories — only if we target contract-doing agencies)*

Rationale: Current backlog assumes perm placements. Agencies doing both perm and contract need rate cards, timesheets, margin tracking, extensions. Two options: ship it (MVP v3-v4) or declare perm-only positioning.

| ID | Title | P | Size | Notes |
|----|-------|---|------|-------|
| US-430 | Contract Rate Card Library (bill + pay, versioned) | P1 | M (8) | Extends EP-11. Foundation for the rest. |
| US-431 | Timesheet Submission + Approval Workflow | P1 | L (13) | Weekly/bi-weekly, client approval loop, hold-for-billing. |
| US-432 | Bill-vs-Pay Margin Watch | P1 | M (5) | On timesheet close → calc margin, alert if below floor. Needs US-430+US-431. |
| US-433 | Contract Extension + Renewal Tracking | P2 | M (5) | Extends US-231 (anniversary alerts) for contract flavor. |
| US-434 | Contractor Onboarding to Client Site Handoff | P2 | M (5) | Docs, equipment, site-specific onboarding packet. |

### Extensions to EP-09 Integrations *(API hardening — split from EP-25 for clarity)*

| ID | Title | P | Size | Notes |
|----|-------|---|------|-------|
| US-083 | Webhook Signing + Replay Protection | P1 | M (5) | HMAC-SHA256, nonce/ts, secret rotation UI. Extends US-081. |
| US-084 | API Rate Limits + Fair-Use Policy | P1 | S (3) | Rate-limit headers, per-scope quotas, backoff. Extends US-081. |
| US-085 | Multi-Board Job Distribution (Broadbean/Idibu/Appcast) | P1 | L (21) | Bullhorn/JobDiva/JobAdder all ship this. Extends US-023. |

---

## EDITS (12 existing stories — rescope or AC extend)

| ID | Current | Recommended change |
|----|---------|-------------------|
| **US-023** | Job Board Publishing (single board) | Rescope to "Aggregator + Owned Boards." Multi-board posting via Broadbean/Idibu API fallback. New story US-085 may replace this. |
| **US-091** | Audit Trail | AC extension: tamper-evident storage, SIEM export (Splunk HEC, Datadog), filters. |
| **US-092** | Data Export & Portability | Split: keep admin-level org export here; move candidate-facing SAR to US-413. |
| **US-081** | REST API & Webhooks | AC extension: signing, rate limits, scoped keys (covered by US-083, US-084, US-402 — close this as "meta" story). |
| **US-044** | Interview Scheduling via Portal | AC extension: AI auto-scheduling with panel coordination + calendar sync. Becomes the Ashby/GoodTime equivalent. |
| **US-190** | Structured Job Intake Template | AC extension: AI auto-generates scoring rubric from JD + intake meeting. Feeds US-110 match scoring. |
| **US-117** | Rediscovery Recommendations | AC deepen: tie to nurture sequences (US-050). Silver-medalist cohorts auto-created per closed req. |
| **US-116** | NL Talent Pool Query | Extend: applies to analytics and automation, not just candidate search. "Ashby AI-Assisted Report Builder" equivalent. |
| **US-110** | AI Match Scoring | AC extension: add autopilot mode (auto-advance ≥90 score on approved reqs only). Audited. |
| **US-004** | SSO (Google+MS365 OAuth) | Rename to "OAuth SSO (Google+MS365)" to disambiguate from US-400 SAML. No scope change. |
| **US-003** | RBAC | AC extension: field-level masking (SSN, salary, DOB) per role. |
| **US-172** | Reference Check Workflow | AC extension: multi-provider (Crosschq, Xref, HiPeople, SkillSurvey). Mirrors US-174 e-sig pattern. |

---

## REMOVES / RECONSIDER *(0 hard cuts, 3 to re-evaluate)*

| ID | Title | Why reconsider |
|----|-------|----------------|
| US-014 | Relationship Graph | Nice-to-look-at, unclear daily value. Possible P2→Later. |
| US-180 | Mobile PWA | Competitors (JobDiva, JobAdder, Bullhorn) now ship native apps. PWA may under-deliver. Keep or upgrade path? |
| US-069 | Drag-Drop Custom Report Builder | 13pts and heavy UX surface. PM already moved to Later. Candidate for cut if NL query (US-116) covers same need. |

---

## DEFERRED / OUT OF SCOPE *(competitors ship these but they conflict with our positioning)*

1. **AI Video Screening (async, auto-scored)** — SeekOut, Bullhorn Amplify ship it. Conflicts with "clients bring their tools" — if agencies use HireVue/Wamly/Karat, we integrate, not build.
2. **Autonomous Sourcing Agents (own database)** — Loxo + SeekOut built 800M-1B profile databases at eight-figure cost. Partner path (Apollo, Clay, existing US-140 enrichment), not build.
3. **Labor Market Intelligence** — Bullhorn+SIA partnership territory. Requires massive data set + benchmarking. Later-stage differentiator, not MVP.
4. **Native iOS/Android apps** — Keep PWA (US-180) until mobile analytics prove usage > 30%. Revisit then.
5. **Background Check integration** — Previously cut. 2026 reconfirmation: still client-side (agencies rarely run BG themselves). Keep out.
6. **HIPAA/BAA** — Only if we pursue healthcare staffing niche. Skip.

---

## Open questions for Bryan

1. **Contract staffing:** In or out? EP-28 is 5 stories / ~36pts and a distinct positioning choice. If we're perm-only, say so and cut this epic.
2. **EU market:** US-415 data residency is 13pts on its own. Only worth it if EU deals are within 12 months.
3. **EEO-1 / adverse impact (US-420/421):** US-fed-contractor agencies need this *now*. Non-federal agencies: nice-to-have. Depends on ICP.
4. **SAML/SCIM/MFA:** Do we ship these in MVP v2 (sprint 5-6) or punt to post-MVP? My rec: ship with MVP v2 — otherwise we sell Starter only.
5. **US-014 / US-069 / US-180:** Any intuition on which to cut vs keep?

---

## EXECUTED v7 (2026-04-22)

**Final delta:**
- 19 net new stories shipped (24 added, 5 dropped in cleanup due to overlap with existing EP-25 Data Compliance work the PM agent had already landed)
- 12 existing stories edited (AC extensions, rescopes)
- 5 new PM Decisions rows
- Epic Summary rebuilt

**Final epics added:**
- **EP-27 DEI & AI Transparency** — 4 stories / 28pts (EEO-1, adverse impact, AI decision log, pay transparency)
- **EP-29 AI Platform & MCP** — 5 stories / 50pts (MCP server US-440, BYO model US-441, OAuth server US-442, connector marketplace US-443, external-AI audit US-444)
- **EP-30 Trust & Security** — 6 stories / 30pts (US-400 email verification, US-401 service accounts, US-402 session controls, US-403 impersonation, US-404 IP allowlist, US-405 status page)

**Merged into existing:**
- US-414 Legal Hold → joined EP-25 Data Compliance (was going to be its own story in proposed EP-26)

**Dropped as duplicates of existing EP-25 Data Compliance work:**
- US-410 RTBF (duplicates US-346)
- US-411 Retention (duplicates US-347)
- US-412 Consent (duplicates US-344)
- US-413 SAR Portal (duplicates US-345/353)
- US-415 Data Residency (covered by US-354 SCC)

**Also dropped per Bryan:**
- US-400 SAML 2.0 + SCIM — OAuth only for MVP
- EP-28 Contract Staffing (5 stories) — not current ICP/GTM

**Backlog now:** 194 stories · 1,305pts · 27 epics · P0 31/156 · P1 89/632 · P2 74/517

**Next up:** specs for US-440 (MCP server) and US-441 (BYO AI model) — these are the keystone pieces of the new EP-29 direction.
