# Backlog Handoff → PM Agent

**Status as of 2026-04-21:** Backlog is at a natural pause point after a multi-pass expansion. Ready for a PM cleanup / validation pass before committing to build.

---

## Current state

- **Master file:** `ATS_Prioritized_Backlog.xlsx` at the root of this folder
- **Scale:** 114 stories, 919 pts, 23 epics
- **Priority mix:** P0 = 12 stories / 95 pts · P1 = 51 / 449 · P2 = 51 / 375 · Superseded = 1
- **Review reference:** `ATS_Backlog_Review_v1.docx` — the multi-persona review that drove v5/v6 additions
- **Project context:** `PROJECT_CONTEXT.md` — tech stack, DB schema, pages shipped to date

The backlog xlsx has four sheets: Master Backlog, Sprint Plan, Epic Summary, DoD & Conventions.

## What has been done (v-pass history)

| Pass | What it did |
|------|-------------|
| v1 | Initial backlog — 43 stories / 398 pts / 10 epics |
| v3 | Competitive-gap pass: +22 stories (back-office, AI depth, client-ATS integration, BD pipeline, comms compliance, docs, mobile, intake); cut 3 out-of-scope (background check, consent, self-service); rewrote US-174 as multi-provider e-sig |
| v4 | Candidate Portal (Pro) epic: +5 stories (EP-22 candidate login/status/prep + EP-10 Pro tier gating) |
| v5 | Bryan feedback pass: simplified US-054 to manual call log, added US-027 submission-readiness checklist (per-client, in onboarding flow), US-094 playbooks, 6 sales stories (US-154-159), US-068 exec dashboard (permission-policy gated), new EP-23 Meeting Intelligence with multi-provider integration platform; rewrote US-113/114 as lightweight extractors on the new platform |
| v6 | Remaining review items: 14 new stories (senior-recruiter gaps, owner analytics, shared Alerts Engine US-095, US-107 gross profit, US-053 email rules); retired US-052; pulled US-022 to Sprint 3; extended US-042 / US-064 / US-172 / US-034; merged US-203 into EP-22; split US-063 into US-063 (chart kit) + US-069 (drag-drop builder) |

## Architectural foundations worth preserving

- **Multi-provider pattern** used three times — e-sig (US-174), meeting integration (US-135), plan-tier gating (US-244). Each has downstream stories that compose on the foundation rather than duplicating plumbing. If a PM sweep finds overlap, check whether those overlap stories should actually point at the shared foundation.
- **Shared Alerts & Escalations Engine (US-095)** underpins US-034, US-220, US-221, US-155, US-230, US-231, US-026. When reviewing ACs, strip alerting specifics from those stories if any survived.
- **Pro tier gating (US-244)** is an orthogonal axis to **role-based permissions (US-003)**. US-068 exec dashboard uses both — Pro-tier gated AND permission-policy gated. Preserve that distinction.

## What is NOT validated

1. **Story points are inferred, not engineering-estimated.** Expect +20-30% on most estimates after a real sizing pass with the engineer agent.
2. **Sprint assignments are suggested sequencing**, not a committed capacity plan. Treat them as dependency ordering, not commitments.
3. **Acceptance criteria depth varies.** Some are product-spec ready (US-174, US-240, US-095). Others are one-liners (scattered P2s). Needs a consistency pass.
4. **No user-validation signal yet.** Everything is reasoned inference from competitive research + persona lenses, not usage data.

## Recommended PM cleanup tasks

1. **Redundancy sweep.** At 114 stories there may be another layer of overlap I didn't catch. Flag candidates and propose merges/splits.
2. **AC depth pass.** Bring all P0 + P1 stories up to the spec depth of US-174 / US-240 / US-095. Mark P2s with `needs-refinement` where still one-liner.
3. **Sizing validation.** T-shirt size all P0+P1 stories with the engineer agent; reconcile Fibonacci point values.
4. **MVP cut line.** The current 919 pts is a multi-year roadmap. Propose MVP v1 (aim: ~150-200 pts), v2 (expansion), v-later buckets. Use existing Sprint column as starting heuristic but challenge it.
5. **Dependency graph verification.** Re-check the Dependencies column on every story. Some were inferred by pattern; a PM pass should sanity-check.
6. **Open decisions to close** (see below).

## Open decisions for Bryan / PM

| Decision | Context |
|----------|---------|
| Plan tier mapping | US-244 introduces Starter / Pro / Enterprise. Which features go in which tier? Needs a pricing page exercise. Candidate Portal (EP-22), Meeting Intelligence (EP-23), Exec Dashboard (US-068) are already tagged Pro. Most other features are implicitly Starter+. |
| Team-size target for MVP | Solo recruiter, 5-person pod, 20-person agency? Affects whether US-005 team hierarchy, US-025 multi-recruiter reqs, US-093 BofB transfer make MVP. |
| US-063 / US-069 timing | Saved views + chart kit in MVP, drag-drop canvas deferred? Or both later? |
| US-068 exec dashboard access model | "Dedicated permission policy, independent of role" — needs UX design on how admins assign it. |
| Meeting integration priority order | US-135 foundation is P1. Which providers in phase 1? Suggested: Gong + Otter (coverage); phase 2 Fireflies + Grain; phase 3 Zoom/Teams/Meet native. |

## Files of interest

- `ATS_Prioritized_Backlog.xlsx` — master
- `ATS_Backlog_Review_v1.docx` — multi-persona review that drove v5/v6
- `PROJECT_CONTEXT.md` — tech stack, schema, pages shipped, engineer context
- `ATS_Competitive_Strategy_Brief.docx` — market positioning
- `ATS_Email_Integration_Spec.docx` — separate in-flight project (email integration rollout, Stages 1-4 done, 5-10 scheduled Apr 21-26)
- `STAGE_N_PR.md` files at repo root — per-stage PR descriptions for the email integration rollout

---

*Handed off by Claude (Product Designer role) to PM agent on 2026-04-21.*
