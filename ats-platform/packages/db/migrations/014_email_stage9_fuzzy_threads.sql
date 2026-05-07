-- ============================================================
-- Migration 011: Email Stage 9 — Fuzzy matching + Thread conflicts
--
-- Changes:
--   1. Add has_conflict boolean to email_threads
--   2. Create email_match_rejections table (prevents re-suggesting rejected pairs)
--   3. Add index for pending_review lookups on candidate_email_links
-- ============================================================

-- ─── email_threads: conflict flag ────────────────────────────────────────────

ALTER TABLE email_threads
  ADD COLUMN has_conflict BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN email_threads.has_conflict IS
  'True when messages in this thread are linked to >1 different candidate. '
  'New messages on conflicted threads fall back to exact-only attribution.';

-- ─── email_match_rejections ──────────────────────────────────────────────────
-- Prevents the fuzzy matcher from re-suggesting the same (address, candidate) pair
-- after a user rejects it via the review inbox.

CREATE TABLE email_match_rejections (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id         UUID        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  candidate_id      UUID        NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  rejected_address  CITEXT      NOT NULL,
  rejected_by       UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (agency_id, candidate_id, rejected_address)
);

CREATE INDEX email_match_rejections_agency_idx  ON email_match_rejections(agency_id);
CREATE INDEX email_match_rejections_address_idx ON email_match_rejections(rejected_address);

-- RLS
ALTER TABLE email_match_rejections ENABLE ROW LEVEL SECURITY;

CREATE POLICY email_match_rejections_select ON email_match_rejections
  FOR SELECT USING (agency_id = current_agency_id());

CREATE POLICY email_match_rejections_insert ON email_match_rejections
  FOR INSERT WITH CHECK (agency_id = current_agency_id());

CREATE POLICY email_match_rejections_delete ON email_match_rejections
  FOR DELETE USING (agency_id = current_agency_id());

-- ─── Index for review inbox queries ─────────────────────────────────────────

CREATE INDEX candidate_email_links_pending_review_idx
  ON candidate_email_links(status)
  WHERE status = 'pending_review';
