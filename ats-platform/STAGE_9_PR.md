# Stage 9: Thread Linking, Fuzzy Matching, Timeline Cards & Review Inbox

## Summary

Stage 9 delivers the remaining email-to-candidate attribution strategies (thread linking and fuzzy matching), a rich timeline email card component, integration of email events into the activity timeline, a full-page review inbox for unclaimed matches, and conflict surfacing UI.

---

## Files Added

### `packages/db/migrations/012_email_stage9_fuzzy_threads.sql`
- `email_threads.has_conflict` boolean column (default false) — flags threads linked to >1 candidate
- `email_match_rejections` table — prevents fuzzy matcher from re-suggesting rejected (address, candidate) pairs
- RLS policies on the new table matching existing agency-isolation pattern
- Partial index `candidate_email_links_pending_review_idx` for fast review inbox queries

### `apps/web/components/candidates/timeline-email-card.tsx`
Rich email card for the activity timeline:
- Provider glyph (Mail icon with red ring = Gmail, blue ring = Outlook)
- Direction indicator: inbound ↓ / outbound ↑ (Lucide ArrowDown / ArrowUp)
- Subject (truncated), snippet (2 lines max)
- Participants row: From / To / Cc
- Match strategy chip: 'exact' / 'alt email' / 'fuzzy (87%)' / 'thread'
- Thread sibling badge: "N messages in thread" — clicking expands inline list
- Click card → expand full body (sanitised HTML in constrained container, fetched via `/api/email/message/[id]`)

### `apps/web/app/api/email/message/[id]/route.ts`
- `GET /api/email/message/:id` — streams email body from S3 on demand
- Returns `{ bodyHtml, bodyText }` with snippet as fallback
- Auth-gated via Supabase session; RLS handles agency isolation

### `apps/web/app/api/email/review/confirm/route.ts`
- `POST /api/email/review/confirm` body `{ linkId, alsoAddAsAltEmail?: boolean }`
- Sets link status to 'active', records reviewer + timestamp
- Optionally adds matched address as `alt_email` on candidate

### `apps/web/app/api/email/review/reject/route.ts`
- `POST /api/email/review/reject` body `{ linkId }`
- Sets link status to 'rejected'
- Inserts into `email_match_rejections` so fuzzy matcher never re-suggests

### `apps/web/app/api/email/review/reassign/route.ts`
- `POST /api/email/review/reassign` body `{ linkId, newCandidateId }`
- Updates link to point to different candidate, activates it

### `apps/web/app/(dashboard)/integrations/email/review/page.tsx`
Full-page "Unclaimed Matches" inbox:
- Lists all `candidate_email_links` where `status='pending_review'`
- For each: email preview + suggested candidate + confidence %
- Three actions: Confirm (with optional alt-email add), Reject, "It's actually..." with candidate search picker
- Empty state: "You're all caught up 🎉"

### `apps/web/lib/email/__tests__/matcher.test.ts`
Unit tests for:
- `tokenSetSimilarity` — pure function: identical, order-insensitive, dot-separated, case-insensitive, partial overlap, empty inputs
- `matchThread` — empty threadId, no links, single candidate, multi-candidate conflict
- `matchFuzzy` — name token matching, non-free-provider exclusion, exclude set, rejection exclusion, threshold filtering, confidence sorting

---

## Files Modified

### `apps/web/lib/email/matcher.ts` (major rewrite)
- **`matchThread(supabase, agencyId, threadId)`** — returns the candidate any message in this thread is already linked to. If thread has links to >1 different candidate, falls back to exact-only and flags `email_threads.has_conflict = true`.
- **`matchFuzzy(supabase, agencyId, addresses, excludeSet)`** — token-set Jaccard similarity ≥ `EMAIL_FUZZY_MATCH_FLOOR` (default 0.65) on email local-part vs first+last name. Gated on free-provider allowlist (Gmail, Yahoo, Hotmail, Outlook, etc.). Checks `email_match_rejections` to skip previously rejected pairs. Returns matches with `status='pending_review'`.
- **`tokenSetSimilarity(a, b)`** — exported pure function; Jaccard similarity on token sets.
- **`matchMessage()`** — now runs strategies in order: thread → exact → alt → fuzzy. Conflicted threads only get exact matching.
- **`matchMessageAndLink()`** — updated to pass `match.status` through (fuzzy matches get `pending_review`).

### `apps/web/components/candidates/activity-timeline.tsx`
- Now accepts optional `emailMessages` prop
- Builds unified timeline items (activities + emails) sorted by timestamp
- Renders `TimelineEmailCard` for email items with thread siblings
- Uses filtered unified items for empty state check

### `apps/web/app/(dashboard)/candidates/[id]/page.tsx`
- Imports and calls `useEmailTimeline` + `useEmailConflicts` hooks
- Passes email messages to `<ActivityTimeline>` on the activity tab
- Displays amber conflict banner above tab bar when candidate has conflicted threads:
  "Some messages on this profile may belong to another candidate. Review →"

### `apps/web/lib/supabase/hooks.ts`
- **`usePendingEmailMatchCount()`** — returns count of pending_review links for sidebar badge (refreshes every 60s)
- **`useEmailConflicts(candidateId)`** — checks if candidate has links on conflicted threads

### `apps/web/components/layout/sidebar.tsx`
- Added "Unclaimed emails" nav item with red dot badge (animated ping) + count
- Only visible when `pendingEmailCount > 0`
- Links to `/integrations/email/review`

---

## Env Vars (Stage 9 additions)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `EMAIL_FUZZY_MATCH_FLOOR` | No | `0.65` | Minimum token-set similarity score for fuzzy matches |

---

## Database Changes

Migration `012_email_stage9_fuzzy_threads.sql`:
- `ALTER TABLE email_threads ADD COLUMN has_conflict BOOLEAN NOT NULL DEFAULT FALSE`
- `CREATE TABLE email_match_rejections (...)` with RLS policies
- `CREATE INDEX candidate_email_links_pending_review_idx` (partial on status)

---

## Manual Testing

### Fuzzy matching
1. Add a candidate "Jane Doe" with primary email `jane@company.com`
2. Connect Gmail account
3. Trigger backfill with emails from `jane.doe@gmail.com` (no exact match)
4. Verify fuzzy match appears in `/integrations/email/review` with ~100% confidence
5. Verify email does NOT appear on candidate timeline yet
6. Click "Confirm" → email appears on candidate timeline
7. Verify `alt_email` was set on candidate (if "also add as alt" checked)

### Fuzzy rejection
1. From review inbox, reject a fuzzy match
2. Trigger another sync
3. Verify the same (address, candidate) pair is NOT re-suggested

### Thread linking
1. Have an existing email linked to Candidate A via exact match
2. Send a reply from a different personal Gmail in the same thread
3. Verify new message auto-links to Candidate A with strategy='thread'
4. Verify it appears on Candidate A's timeline

### Thread conflict
1. Manually link messages in the same thread to two different candidates
2. Send a new email in that thread
3. Verify new email only gets exact matches (no thread or fuzzy)
4. Verify amber conflict banner shows on both candidate profiles

### Timeline email card
1. Navigate to a candidate with linked emails
2. Verify provider glyph, direction icon, subject, snippet, match chip render correctly
3. Click "N messages in thread" badge → thread siblings expand inline
4. Click email card → body expands below (fetched from API)

### Sidebar badge
1. With pending_review links present, verify red dot + count shows in sidebar
2. Clear all pending items → badge disappears

### Review page
1. Visit `/integrations/email/review`
2. Test all three actions: Confirm, Reject, "It's actually..." with candidate picker
3. Verify empty state renders when no pending matches remain

---

## Risks

- **Fuzzy match volume**: Agencies with large candidate pools + many free-provider emails may generate many pending reviews. The `EMAIL_FUZZY_MATCH_FLOOR` threshold can be raised to reduce noise. Consider adding a per-agency configuration in Stage 10.
- **Token-set similarity limitations**: "jsmith" won't match "John Smith" since tokens don't overlap. This is intentional — we prefer precision over recall for automated suggestions. Character n-gram similarity could be added as a secondary signal in future.
- **Thread conflict flag is permanent**: Once a thread is flagged as conflicted, it stays flagged even if one link is removed. Manual cleanup or a periodic reconciliation job could address this.
- **S3 body fetch**: The `/api/email/message/[id]` route falls back to snippet when S3 keys aren't available. Full S3 streaming will be polished in Stage 10.
