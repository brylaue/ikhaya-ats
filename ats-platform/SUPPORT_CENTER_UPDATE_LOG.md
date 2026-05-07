# Support Center Update Log

---

## Run: 2026-04-21 (Manual — initial catch-up)

### Sources scanned
- `FEATURE_COMPLETE.md`
- `IMPLEMENTATION_SUMMARY.md`
- `STAGE_1_PR.md` through `STAGE_10_PR.md`
- `apps/web/app/(dashboard)/` — all route directories
- `apps/web/components/` — all component directories

### New articles added

| ID | Title | Category |
|----|-------|----------|
| db1 | Reading your daily dashboard | Getting Started |
| iv1 | Scheduling interviews and tracking them | Interviews |
| iv2 | Interview formats and what each means | Interviews |
| pl1 | The Placements page — tracking confirmed revenue | Placements |
| pl2 | Logging payments and managing invoice status | Placements |
| src1 | Using Sourcing to find passive candidates | Sourcing |
| src2 | Saving Sourcing searches for repeat use | Sourcing |
| rep1 | Generating and sharing reports | Reports |
| ai1 | Using the AI Copilot on a candidate profile | AI Copilot |
| st3 | Custom fields — extending candidate and job records | Settings |
| st4 | Tag taxonomy — organising records with tags | Settings |
| st5 | Audit Trail — tracking all admin actions | Settings |
| st6 | Data & Privacy settings | Settings |

### New workflows added

| ID | Title |
|----|-------|
| wf5 | Scheduling and closing out an interview |
| wf6 | Closing a placement and collecting payment |

### New FAQs added (6)
- "Can I schedule interviews directly from Ikhaya, or just log them?" (Interviews & Placements)
- "What's the difference between the Placements page and the Revenue tab in Analytics?" (Interviews & Placements)
- "Can I log a partial payment and then the remainder later?" (Interviews & Placements)
- "Is the Placement Report safe to send directly to clients?" (Reports & AI)
- "How accurate is the AI Copilot job matching?" (Reports & AI)
- "Does the AI Copilot use my candidate data to train its models?" (Reports & AI)

### New categories added to the filter bar
- Interviews
- Placements
- Sourcing
- Reports
- AI Copilot

### New FAQ filter categories added
- Interviews & Placements
- Reports & AI

### Features flagged for human review (deferred / unclear)
- `/app/(dashboard)/integrations/` — separate integrations route exists alongside settings integrations; unclear if it's a distinct page or redirect. Not documented until confirmed.
- `components/email/connect-email-modal.tsx` — appears to be an alternate OAuth entry point; may overlap with Settings → Integrations flow. Verify with engineering before documenting as a separate flow.
- `STAGE_10_PR.md` mentions a metrics daily cron (`computeAgencyMetrics`) that is not yet wired. Not documented as it requires infra setup.

---

*Next scheduled run: Monday 2026-04-27 at 09:05 AM local*

---

## Run: 2026-04-21 (Manual — gap audit)

### Trigger
Manual audit and verification pass following initial catch-up run. Agent scanned all route files and component trees for undocumented features missed in the first pass.

### Bug fix
- **em4** (`Reviewing unmatched emails`) — corrected navigation path from "Outreach → Fuzzy Review Inbox" to the actual route `/integrations/email/review`. Also added documentation for the **Reassign** action (not just Confirm/Reject) which lets users re-link an email to a different candidate than the one Ikhaya suggested.

### New articles added

| ID | Title | Category |
|----|-------|----------|
| por2 | The client candidate comparison view | Client Portal |
| c5 | Viewing a candidate's resume | Candidates |
| c6 | SMS conversations with candidates | Candidates |
| c7 | Interview scorecards | Candidates |
| c8 | Offer letters — generating and sending | Candidates |
| j3 | Using the Match tab to find candidates for a job | Jobs |
| an3 | Analytics: Clients tab | Analytics |
| an4 | Analytics: Email Sync tab | Analytics |

### New FAQs added (3)
- "How do clients access the candidate comparison view?" (Portal)
- "Where do I find the resume view for a candidate?" (Candidates & Jobs)
- "How do I generate an offer letter?" (Candidates & Jobs)

### Features verified and confirmed documented
All 8 previously flagged gaps confirmed closed. No new undocumented routes or major components found in this pass.

### Total Support Center coverage after this run
- **Articles:** 35
- **Workflows:** 6
- **FAQs:** 23
- **Shortcut sections:** 4

---

## Run: 2026-04-21 (Manual — review pass + SMS removal)

### Changes

**Removed**
- `c6` SMS conversations article removed (SMS feature not in scope)

**New articles added**

| ID | Title | Category |
|----|-------|----------|
| c9 | Sending availability to a candidate | Candidates |
| p3 | Pipeline health scores and at-risk alerts | Pipeline |

**Articles deepened**
- `iv1` — Rewrote to cover the full 3-step scheduling wizard: format/time/duration presets, interviewer management (internal + external), and notify-candidate/notify-client toggles
- `c7` — Expanded scorecards to cover the 6 criteria (Communication, Technical Ability, Cultural Fit, Leadership Potential, Motivation & Drive, Role Alignment), 1–5 ratings, and Strong Yes/No recommendations
- `c8` — Expanded offer letters to cover the full lifecycle states (Draft → Extended → Verbal Accepted → Accepted/Declined/Countered), fee calculation, payment terms, and placement record creation

### Total Support Center coverage after this run
- **Articles:** 36
- **Workflows:** 6
- **FAQs:** 23
- **Shortcut sections:** 4
