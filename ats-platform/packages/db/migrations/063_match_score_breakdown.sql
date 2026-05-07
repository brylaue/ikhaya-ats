-- ── Migration 063: Match Score Breakdown & Feedback (US-110) ────────────────
--
-- Extends ai_match_scores with explainable-AI fields:
--   - breakdown: per-criterion sub-scores (skills / experience / location /
--                education / tenure) so the UI can render bars + hover
--                tooltips instead of a single opaque 0-100 number.
--   - rationale: short LLM-authored sentence explaining the strongest match
--                drivers and gaps. Useful in match cards + email compilations.
--   - confidence: 0-1 — LLM's self-reported certainty. Low-confidence scores
--                 should be flagged in the UI ("needs recruiter review").
--   - generated_by: model string (e.g., "claude-sonnet-4-6") for audit.
--
-- Adds a feedback log so recruiters can up/down-vote scores. Future pass can
-- train a lightweight reranker on this signal; for now we just collect.
--
-- Idempotent: safe to re-run.

-- ── Columns on ai_match_scores ───────────────────────────────────────────────

ALTER TABLE ai_match_scores
  ADD COLUMN IF NOT EXISTS breakdown     jsonb,
  ADD COLUMN IF NOT EXISTS rationale     text,
  ADD COLUMN IF NOT EXISTS confidence    numeric(3, 2) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  ADD COLUMN IF NOT EXISTS generated_by  text,
  ADD COLUMN IF NOT EXISTS explained_at  timestamptz;

-- breakdown shape (populated by lib/ai/match-score.ts):
--   {
--     "skills":      { "score": 78, "matched": ["React", "TypeScript"], "missing": ["GraphQL"] },
--     "experience":  { "score": 85, "summary": "6 yrs at target level" },
--     "location":    { "score": 60, "summary": "remote-ok, candidate in EU" },
--     "education":   { "score": 50, "summary": "BSc CS" },
--     "tenure":      { "score": 90, "summary": "avg 2.5y tenure" }
--   }
-- UI contract: every criterion has .score 0-100; other fields are optional
-- display hints. Keep backward-compat by tolerating missing criteria.

COMMENT ON COLUMN ai_match_scores.breakdown IS
  'US-110: Per-criterion sub-scores + matched/missing skill lists + short summaries.';

COMMENT ON COLUMN ai_match_scores.confidence IS
  'US-110: LLM self-reported confidence 0-1. Flag < 0.6 for manual review.';

-- ── Feedback table ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_match_score_feedback (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id      uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  match_score_id uuid NOT NULL REFERENCES ai_match_scores(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating         smallint NOT NULL CHECK (rating IN (-1, 1)),  -- -1 thumbs down, +1 thumbs up
  reason         text,                                          -- optional: "wrong skills weight", "location too strict"
  created_at     timestamptz NOT NULL DEFAULT now(),

  UNIQUE (match_score_id, user_id)  -- one vote per recruiter per score
);

CREATE INDEX IF NOT EXISTS idx_match_feedback_agency  ON ai_match_score_feedback(agency_id);
CREATE INDEX IF NOT EXISTS idx_match_feedback_score   ON ai_match_score_feedback(match_score_id);
CREATE INDEX IF NOT EXISTS idx_match_feedback_created ON ai_match_score_feedback(created_at DESC);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE ai_match_score_feedback ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ai_match_score_feedback' AND policyname = 'match_feedback_select'
  ) THEN
    CREATE POLICY match_feedback_select ON ai_match_score_feedback FOR SELECT
      USING (agency_id = current_agency_id());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ai_match_score_feedback' AND policyname = 'match_feedback_insert'
  ) THEN
    CREATE POLICY match_feedback_insert ON ai_match_score_feedback FOR INSERT
      WITH CHECK (agency_id = current_agency_id() AND user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ai_match_score_feedback' AND policyname = 'match_feedback_update'
  ) THEN
    CREATE POLICY match_feedback_update ON ai_match_score_feedback FOR UPDATE
      USING (agency_id = current_agency_id() AND user_id = auth.uid())
      WITH CHECK (agency_id = current_agency_id() AND user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ai_match_score_feedback' AND policyname = 'match_feedback_delete'
  ) THEN
    CREATE POLICY match_feedback_delete ON ai_match_score_feedback FOR DELETE
      USING (agency_id = current_agency_id() AND user_id = auth.uid());
  END IF;
END $$;

-- ── Aggregate view: average rating per score ─────────────────────────────────
-- Used by the retraining job + admin dashboards. Cheap — one row per score.

CREATE OR REPLACE VIEW ai_match_score_feedback_rollup AS
SELECT
  ms.id                           AS match_score_id,
  ms.agency_id,
  ms.candidate_id,
  ms.job_id,
  ms.score,
  ms.confidence,
  COUNT(fb.id)                    AS vote_count,
  COALESCE(AVG(fb.rating), 0)     AS avg_rating,
  SUM(CASE WHEN fb.rating = 1 THEN 1 ELSE 0 END) AS thumbs_up,
  SUM(CASE WHEN fb.rating = -1 THEN 1 ELSE 0 END) AS thumbs_down
FROM   ai_match_scores ms
LEFT   JOIN ai_match_score_feedback fb ON fb.match_score_id = ms.id
GROUP  BY ms.id, ms.agency_id, ms.candidate_id, ms.job_id, ms.score, ms.confidence;

COMMENT ON VIEW ai_match_score_feedback_rollup IS
  'US-110: Per-score feedback aggregate. Future use: signal for reranker training.';
