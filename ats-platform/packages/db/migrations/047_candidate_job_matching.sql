-- ── Migration 047: Candidate → Job reverse match lookup ──────────────────────
-- US-382: Best-Fit Job Matching — reverse lookup from candidate.
--
-- Adds top_matches_for_candidate() — mirror of top_matches_for_job() —
-- returning the top N open jobs for a given candidate ordered by AI match score.
--
-- Also adds search_jobs_semantic() for live vector similarity against jobs
-- when ai_match_scores has not yet been populated for a candidate.

-- ── top_matches_for_candidate ─────────────────────────────────────────────────
-- Returns job_id + score ordered by score DESC.
-- Only returns jobs that are "open" (status = 'open' or 'active').
CREATE OR REPLACE FUNCTION top_matches_for_candidate(
  p_candidate_id  uuid,
  p_limit         integer DEFAULT 5
)
RETURNS TABLE(job_id uuid, score numeric)
LANGUAGE sql STABLE
AS $$
  SELECT  ms.job_id, ms.score
  FROM    ai_match_scores ms
  JOIN    jobs j ON j.id = ms.job_id
  WHERE   ms.candidate_id = p_candidate_id
    AND   j.status IN ('open', 'active')
  ORDER   BY ms.score DESC
  LIMIT   p_limit;
$$;

-- ── search_jobs_semantic ──────────────────────────────────────────────────────
-- Live pgvector cosine similarity search across jobs for a given query embedding.
-- Used as fallback when ai_match_scores rows don't exist yet for a candidate.
CREATE OR REPLACE FUNCTION search_jobs_semantic(
  query_embedding vector(1536),
  p_agency_id     uuid,
  p_limit         integer   DEFAULT 5,
  p_threshold     float     DEFAULT 0.3
)
RETURNS TABLE(
  job_id     uuid,
  title      text,
  company    text,
  location   text,
  status     text,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    j.id                                        AS job_id,
    j.title,
    c.name                                      AS company,
    j.location,
    j.status,
    1 - (j.embedding <=> query_embedding)       AS similarity
  FROM   jobs j
  LEFT   JOIN companies c ON c.id = j.company_id
  WHERE  j.agency_id   = p_agency_id
    AND  j.status      IN ('open', 'active')
    AND  j.embedding   IS NOT NULL
    AND  1 - (j.embedding <=> query_embedding) >= p_threshold
  ORDER  BY j.embedding <=> query_embedding
  LIMIT  p_limit;
$$;
