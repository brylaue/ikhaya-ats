-- ─── 020: Portal scorecard extensions ─────────────────────────────────────────
-- Allows unauthenticated portal clients to submit scorecards.
-- Makes interviewer_id nullable and adds portal-specific fields.

ALTER TABLE scorecard_submissions
  ALTER COLUMN interviewer_id DROP NOT NULL;

ALTER TABLE scorecard_submissions
  ADD COLUMN IF NOT EXISTS portal_slug         text,
  ADD COLUMN IF NOT EXISTS portal_client_name  text,
  ADD COLUMN IF NOT EXISTS portal_client_email text,
  ADD COLUMN IF NOT EXISTS pros                text,
  ADD COLUMN IF NOT EXISTS cons                text,
  ADD COLUMN IF NOT EXISTS submitted_via       text DEFAULT 'internal'
    CHECK (submitted_via IN ('internal', 'portal'));

-- Portal submissions come in via service-role API route (bypasses RLS)
-- Allow portal inserts from anon/service role
CREATE POLICY "portal scorecard insert"
  ON scorecard_submissions FOR INSERT
  WITH CHECK (submitted_via = 'portal' AND interviewer_id IS NULL);
