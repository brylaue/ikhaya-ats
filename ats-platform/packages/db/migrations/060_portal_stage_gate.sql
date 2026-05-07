-- ─── Migration 060: Candidate Portal Stage Gate ──────────────────────────────
-- US-241: Per-candidate stage visibility controls.
-- Recruiters can set a minimum pipeline stage order (unlocked_from_stage_order)
-- on each portal token. The portal page returns a "locked" state if the
-- candidate has not yet reached that stage, hiding content until the right
-- moment in the process.
--
-- Default 0 = always visible (no gate) — backward compatible.

ALTER TABLE candidate_portal_tokens
  ADD COLUMN IF NOT EXISTS unlocked_from_stage_order INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN candidate_portal_tokens.unlocked_from_stage_order IS
  'Minimum pipeline stage_order at which the portal content is visible to the '
  'candidate. 0 = always visible. Set by the recruiter per token.';
