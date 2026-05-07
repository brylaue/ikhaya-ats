-- Migration 037: Fix search_all() RPC for agency model (US-373)
--
-- Migration 002 created search_all() using `org_id` and `clients` table names,
-- which predates the rename to `agency_id` and `companies`.
-- This migration replaces the function with the correct column/table names,
-- and also adds a fixed search_all_keyword() fallback.
--
-- Also adds companies.embedding column (parallel to candidates + jobs)
-- so the client search arm can do vector search too.

-- ─── 1. Add embedding column to companies (if not present) ───────────────────

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

CREATE INDEX IF NOT EXISTS companies_embedding_hnsw_idx ON companies
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ─── 2. Rebuild search_all() using correct schema names ──────────────────────

CREATE OR REPLACE FUNCTION search_all(
  query_embedding   vector(1536),
  p_agency_id       uuid,
  p_limit           int     DEFAULT 10,
  p_threshold       float   DEFAULT 0.25
)
RETURNS TABLE (
  entity_type   text,
  entity_id     uuid,
  label         text,
  sublabel      text,
  href          text,
  similarity    float
)
LANGUAGE sql STABLE AS $$

  -- Candidates
  SELECT
    'candidate'::text,
    c.id,
    c.first_name || ' ' || c.last_name,
    coalesce(c.current_title, '') ||
      CASE WHEN c.current_company IS NOT NULL THEN ' · ' || c.current_company ELSE '' END,
    '/candidates/' || c.id,
    (1 - (c.embedding <=> query_embedding))::float
  FROM candidates c
  WHERE c.agency_id = p_agency_id
    AND c.embedding IS NOT NULL
    AND (1 - (c.embedding <=> query_embedding)) >= p_threshold

UNION ALL

  -- Jobs
  SELECT
    'job'::text,
    j.id,
    j.title,
    coalesce(co.name, '') ||
      CASE WHEN j.location IS NOT NULL THEN ' · ' || j.location ELSE '' END,
    '/jobs/' || j.id,
    (1 - (j.embedding <=> query_embedding))::float
  FROM jobs j
  LEFT JOIN companies co ON co.id = j.company_id
  WHERE j.agency_id = p_agency_id
    AND j.embedding IS NOT NULL
    AND (1 - (j.embedding <=> query_embedding)) >= p_threshold

UNION ALL

  -- Companies (clients)
  SELECT
    'client'::text,
    co.id,
    co.name,
    coalesce(co.industry, ''),
    '/clients/' || co.id,
    (1 - (co.embedding <=> query_embedding))::float
  FROM companies co
  WHERE co.agency_id = p_agency_id
    AND co.embedding IS NOT NULL
    AND (1 - (co.embedding <=> query_embedding)) >= p_threshold

  ORDER BY similarity DESC
  LIMIT p_limit;
$$;

-- ─── 3. Rebuild search_all_keyword() using correct schema names ───────────────

CREATE OR REPLACE FUNCTION search_all_keyword(
  p_query       text,
  p_agency_id   uuid,
  p_limit       int DEFAULT 10
)
RETURNS TABLE (
  entity_type   text,
  entity_id     uuid,
  label         text,
  sublabel      text,
  href          text,
  similarity    float
)
LANGUAGE sql STABLE AS $$

  SELECT
    'candidate'::text,
    c.id,
    c.first_name || ' ' || c.last_name,
    coalesce(c.current_title, '') ||
      CASE WHEN c.current_company IS NOT NULL THEN ' · ' || c.current_company ELSE '' END,
    '/candidates/' || c.id,
    greatest(
      similarity(lower(c.first_name || ' ' || c.last_name), lower(p_query)),
      similarity(lower(coalesce(c.current_title, '')),       lower(p_query)),
      similarity(lower(coalesce(c.current_company, '')),     lower(p_query))
    )::float
  FROM candidates c
  WHERE c.agency_id = p_agency_id
    AND (
      lower(c.first_name || ' ' || c.last_name) % lower(p_query)
      OR lower(coalesce(c.current_title, ''))   % lower(p_query)
      OR lower(coalesce(c.current_company, '')) % lower(p_query)
      OR to_tsvector('english', coalesce(c.summary, '')) @@ plainto_tsquery('english', p_query)
    )

UNION ALL

  SELECT
    'job'::text,
    j.id,
    j.title,
    coalesce(co.name, '') ||
      CASE WHEN j.location IS NOT NULL THEN ' · ' || j.location ELSE '' END,
    '/jobs/' || j.id,
    similarity(lower(j.title), lower(p_query))::float
  FROM jobs j
  LEFT JOIN companies co ON co.id = j.company_id
  WHERE j.agency_id = p_agency_id
    AND (
      lower(j.title) % lower(p_query)
      OR to_tsvector('english', coalesce(j.description, '') || ' ' || coalesce(j.requirements, ''))
         @@ plainto_tsquery('english', p_query)
    )

UNION ALL

  SELECT
    'client'::text,
    co.id,
    co.name,
    coalesce(co.industry, ''),
    '/clients/' || co.id,
    similarity(lower(co.name), lower(p_query))::float
  FROM companies co
  WHERE co.agency_id = p_agency_id
    AND (
      lower(co.name)             % lower(p_query)
      OR lower(coalesce(co.industry, '')) % lower(p_query)
    )

  ORDER BY similarity DESC
  LIMIT p_limit;
$$;

-- ─── 4. Semantic candidate search function (used by US-379) ──────────────────
-- Returns full candidate rows ordered by vector similarity.

CREATE OR REPLACE FUNCTION search_candidates_semantic(
  query_embedding   vector(1536),
  p_agency_id       uuid,
  p_limit           int   DEFAULT 20,
  p_threshold       float DEFAULT 0.20
)
RETURNS TABLE (
  id              uuid,
  first_name      text,
  last_name       text,
  current_title   text,
  current_company text,
  location        text,
  status          text,
  skills          text[],
  similarity      float
)
LANGUAGE sql STABLE AS $$
  SELECT
    c.id,
    c.first_name,
    c.last_name,
    c.current_title,
    c.current_company,
    c.location::text,
    c.status,
    c.skills,
    (1 - (c.embedding <=> query_embedding))::float AS similarity
  FROM candidates c
  WHERE c.agency_id = p_agency_id
    AND c.embedding IS NOT NULL
    AND (1 - (c.embedding <=> query_embedding)) >= p_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT p_limit;
$$;

-- ─── 5. Fix trigger table names (migration 002 used old names) ───────────────

-- Re-create triggers with correct table references
DROP TRIGGER IF EXISTS trg_candidate_embedding ON candidates;
CREATE TRIGGER trg_candidate_embedding
  AFTER INSERT OR UPDATE OF first_name, last_name, current_title, current_company, summary
  ON candidates FOR EACH ROW EXECUTE FUNCTION queue_embedding_job();

DROP TRIGGER IF EXISTS trg_job_embedding ON jobs;
CREATE TRIGGER trg_job_embedding
  AFTER INSERT OR UPDATE OF title, description, requirements
  ON jobs FOR EACH ROW EXECUTE FUNCTION queue_embedding_job();

DROP TRIGGER IF EXISTS trg_company_embedding ON companies;
CREATE TRIGGER trg_company_embedding
  AFTER INSERT OR UPDATE OF name, industry
  ON companies FOR EACH ROW EXECUTE FUNCTION queue_embedding_job();
