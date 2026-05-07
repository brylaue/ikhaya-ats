-- ─── Migration 051: Bulk Candidate Operations ────────────────────────────────
-- US-479: append_candidate_tag RPC used by POST /api/candidates/bulk

CREATE OR REPLACE FUNCTION append_candidate_tag(
  p_agency_id    UUID,
  p_candidate_id UUID,
  p_tag          TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE candidates
  SET    tags = array_append(
           COALESCE(tags, '{}'),
           p_tag
         )
  WHERE  id        = p_candidate_id
    AND  agency_id = p_agency_id
    AND  NOT (p_tag = ANY(COALESCE(tags, '{}')));  -- idempotent: skip if already tagged
END;
$$;

COMMENT ON FUNCTION append_candidate_tag IS
  'Appends a tag to a candidate''s tags array. Idempotent — skips if already present.';
