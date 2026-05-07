-- Migration 023: AI Match Scoring embeddings (US-110)
-- Stores vector embeddings for candidates and jobs for cosine similarity matching.
-- Vector dimension: 1536 (OpenAI text-embedding-3-small / ada-002 compatible).

-- ── Candidate embeddings ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS candidate_embeddings (
  candidate_id  uuid PRIMARY KEY REFERENCES candidates(id) ON DELETE CASCADE,
  agency_id     uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  embedding     vector(1536) NOT NULL,
  model         text NOT NULL DEFAULT 'text-embedding-3-small',
  content_hash  text,  -- SHA-256 of the text used to generate the embedding (for cache invalidation)
  generated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cand_emb_agency ON candidate_embeddings(agency_id);
-- IVFFlat index for approximate nearest-neighbor search
CREATE INDEX IF NOT EXISTS idx_cand_emb_vector
  ON candidate_embeddings USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ── Job embeddings ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_embeddings (
  job_id        uuid PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
  agency_id     uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  embedding     vector(1536) NOT NULL,
  model         text NOT NULL DEFAULT 'text-embedding-3-small',
  content_hash  text,
  generated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_emb_agency ON job_embeddings(agency_id);
CREATE INDEX IF NOT EXISTS idx_job_emb_vector
  ON job_embeddings USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ── Match score cache ─────────────────────────────────────────────────────────
-- Pre-computed match scores. Populated by the embedding worker / edge function.
-- Refreshed whenever either embedding is regenerated.
CREATE TABLE IF NOT EXISTS ai_match_scores (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id     uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  candidate_id  uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  job_id        uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  score         numeric(5, 2) NOT NULL CHECK (score BETWEEN 0 AND 100),
  percentile    numeric(5, 2),  -- percentile rank among all candidates for this job
  computed_at   timestamptz NOT NULL DEFAULT now(),

  UNIQUE (candidate_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_match_scores_job       ON ai_match_scores(job_id);
CREATE INDEX IF NOT EXISTS idx_match_scores_candidate ON ai_match_scores(candidate_id);
CREATE INDEX IF NOT EXISTS idx_match_scores_score     ON ai_match_scores(score DESC);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE candidate_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_embeddings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_match_scores      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cand_emb_select" ON candidate_embeddings FOR SELECT
  USING (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));
CREATE POLICY "cand_emb_insert" ON candidate_embeddings FOR INSERT
  WITH CHECK (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));
CREATE POLICY "cand_emb_update" ON candidate_embeddings FOR UPDATE
  USING (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));

CREATE POLICY "job_emb_select" ON job_embeddings FOR SELECT
  USING (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));
CREATE POLICY "job_emb_insert" ON job_embeddings FOR INSERT
  WITH CHECK (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));
CREATE POLICY "job_emb_update" ON job_embeddings FOR UPDATE
  USING (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));

CREATE POLICY "match_scores_select" ON ai_match_scores FOR SELECT
  USING (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));
CREATE POLICY "match_scores_upsert" ON ai_match_scores FOR INSERT
  WITH CHECK (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));
CREATE POLICY "match_scores_update" ON ai_match_scores FOR UPDATE
  USING (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));

-- ── Helper function: top N matches for a job ──────────────────────────────────
-- Returns candidate_id + score ordered by score DESC.
-- Useful for the Match tab in jobs/[id].
CREATE OR REPLACE FUNCTION top_matches_for_job(
  p_job_id   uuid,
  p_limit    integer DEFAULT 20
)
RETURNS TABLE(candidate_id uuid, score numeric)
LANGUAGE sql STABLE
AS $$
  SELECT candidate_id, score
  FROM   ai_match_scores
  WHERE  job_id = p_job_id
  ORDER  BY score DESC
  LIMIT  p_limit;
$$;
