-- ============================================================
-- Migration 002: Full vector search across all entity types
-- Upgrades candidates index, adds embeddings to jobs + clients,
-- adds HNSW indexes, unified search function + trigger helpers
-- ============================================================

-- ─── 1. Upgrade candidates: IVFFlat → HNSW ───────────────────────────────────
-- HNSW is faster for real-time inserts and doesn't require training size

DROP INDEX IF EXISTS candidates_embedding_idx;

CREATE INDEX candidates_embedding_hnsw_idx ON candidates
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ─── 2. Add embedding columns to jobs ────────────────────────────────────────

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS embedding vector(1536),
  ADD COLUMN IF NOT EXISTS search_text TEXT GENERATED ALWAYS AS (
    coalesce(title, '') || ' ' ||
    coalesce(description, '') || ' ' ||
    coalesce(requirements, '') || ' ' ||
    coalesce(location, '')
  ) STORED;

CREATE INDEX IF NOT EXISTS jobs_embedding_hnsw_idx ON jobs
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS jobs_fulltext_idx ON jobs
  USING gin (to_tsvector('english',
    coalesce(title, '') || ' ' ||
    coalesce(description, '') || ' ' ||
    coalesce(requirements, '')
  ));

CREATE INDEX IF NOT EXISTS jobs_title_trgm_idx ON jobs
  USING gin (title gin_trgm_ops);

-- ─── 3. Add embedding columns to clients ─────────────────────────────────────

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS embedding vector(1536),
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS search_text TEXT GENERATED ALWAYS AS (
    coalesce(name, '') || ' ' ||
    coalesce(industry, '') || ' ' ||
    coalesce(notes, '')
  ) STORED;

CREATE INDEX IF NOT EXISTS clients_embedding_hnsw_idx ON clients
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS clients_fulltext_idx ON clients
  USING gin (to_tsvector('english',
    coalesce(name, '') || ' ' ||
    coalesce(industry, '') || ' ' ||
    coalesce(notes, '')
  ));

CREATE INDEX IF NOT EXISTS clients_name_trgm_idx ON clients
  USING gin (name gin_trgm_ops);

-- ─── 4. Embedding metadata table ─────────────────────────────────────────────
-- Tracks when embeddings were last generated so we can re-embed stale records

CREATE TABLE IF NOT EXISTS embedding_jobs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type   TEXT NOT NULL,          -- 'candidate' | 'job' | 'client'
  entity_id     UUID NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'done' | 'error'
  error         TEXT,
  queued_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,
  UNIQUE (entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS embedding_jobs_status_idx ON embedding_jobs(status);
CREATE INDEX IF NOT EXISTS embedding_jobs_entity_idx ON embedding_jobs(entity_type, entity_id);

-- ─── 5. Unified search function ──────────────────────────────────────────────
-- Returns ranked results across candidates + jobs + clients for a given org.
-- Falls back to pg_trgm when embedding is NULL (not yet embedded).

CREATE OR REPLACE FUNCTION search_all(
  query_embedding   vector(1536),
  p_org_id          UUID,
  p_limit           INT     DEFAULT 10,
  p_threshold       FLOAT   DEFAULT 0.25   -- cosine similarity threshold (0–1)
)
RETURNS TABLE (
  entity_type   TEXT,
  entity_id     UUID,
  label         TEXT,
  sublabel      TEXT,
  href          TEXT,
  similarity    FLOAT
)
LANGUAGE sql STABLE AS $$

  -- Candidates
  SELECT
    'candidate'::TEXT,
    c.id,
    c.first_name || ' ' || c.last_name,
    coalesce(c.current_title, '') || CASE WHEN c.current_company IS NOT NULL THEN ' · ' || c.current_company ELSE '' END,
    '/candidates/' || c.id,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM candidates c
  WHERE c.org_id = p_org_id
    AND c.embedding IS NOT NULL
    AND 1 - (c.embedding <=> query_embedding) >= p_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT p_limit

UNION ALL

  -- Jobs
  SELECT
    'job'::TEXT,
    j.id,
    j.title,
    coalesce(cl.name, '') || CASE WHEN j.location IS NOT NULL THEN ' · ' || j.location ELSE '' END,
    '/jobs/' || j.id,
    1 - (j.embedding <=> query_embedding)
  FROM jobs j
  LEFT JOIN clients cl ON cl.id = j.client_id
  WHERE j.org_id = p_org_id
    AND j.embedding IS NOT NULL
    AND 1 - (j.embedding <=> query_embedding) >= p_threshold
  ORDER BY j.embedding <=> query_embedding
  LIMIT p_limit

UNION ALL

  -- Clients
  SELECT
    'client'::TEXT,
    cl.id,
    cl.name,
    coalesce(cl.industry, ''),
    '/clients/' || cl.id,
    1 - (cl.embedding <=> query_embedding)
  FROM clients cl
  WHERE cl.org_id = p_org_id
    AND cl.embedding IS NOT NULL
    AND 1 - (cl.embedding <=> query_embedding) >= p_threshold
  ORDER BY cl.embedding <=> query_embedding
  LIMIT p_limit

  ORDER BY similarity DESC
  LIMIT p_limit;

$$;

-- ─── 6. Keyword fallback function (pg_trgm + full-text) ──────────────────────
-- Used when embeddings aren't available or as a hybrid re-ranker

CREATE OR REPLACE FUNCTION search_all_keyword(
  p_query   TEXT,
  p_org_id  UUID,
  p_limit   INT DEFAULT 10
)
RETURNS TABLE (
  entity_type   TEXT,
  entity_id     UUID,
  label         TEXT,
  sublabel      TEXT,
  href          TEXT,
  similarity    FLOAT
)
LANGUAGE sql STABLE AS $$

  SELECT
    'candidate'::TEXT,
    c.id,
    c.first_name || ' ' || c.last_name,
    coalesce(c.current_title, '') || CASE WHEN c.current_company IS NOT NULL THEN ' · ' || c.current_company ELSE '' END,
    '/candidates/' || c.id,
    greatest(
      similarity(lower(c.first_name || ' ' || c.last_name), lower(p_query)),
      similarity(lower(coalesce(c.current_title, '')), lower(p_query)),
      similarity(lower(coalesce(c.current_company, '')), lower(p_query))
    )::FLOAT AS sim
  FROM candidates c
  WHERE c.org_id = p_org_id
    AND (
      lower(c.first_name || ' ' || c.last_name) % lower(p_query)
      OR lower(coalesce(c.current_title, '')) % lower(p_query)
      OR lower(coalesce(c.current_company, '')) % lower(p_query)
      OR to_tsvector('english', coalesce(c.summary, '')) @@ plainto_tsquery('english', p_query)
    )

UNION ALL

  SELECT
    'job'::TEXT,
    j.id,
    j.title,
    coalesce(cl.name, '') || CASE WHEN j.location IS NOT NULL THEN ' · ' || j.location ELSE '' END,
    '/jobs/' || j.id,
    similarity(lower(j.title), lower(p_query))::FLOAT
  FROM jobs j
  LEFT JOIN clients cl ON cl.id = j.client_id
  WHERE j.org_id = p_org_id
    AND (
      lower(j.title) % lower(p_query)
      OR to_tsvector('english', coalesce(j.description, '') || ' ' || coalesce(j.requirements, ''))
         @@ plainto_tsquery('english', p_query)
    )

UNION ALL

  SELECT
    'client'::TEXT,
    cl.id,
    cl.name,
    coalesce(cl.industry, ''),
    '/clients/' || cl.id,
    similarity(lower(cl.name), lower(p_query))::FLOAT
  FROM clients cl
  WHERE cl.org_id = p_org_id
    AND (
      lower(cl.name) % lower(p_query)
      OR lower(coalesce(cl.industry, '')) % lower(p_query)
    )

  ORDER BY sim DESC
  LIMIT p_limit;

$$;

-- ─── 7. Auto-queue embedding jobs on insert/update ───────────────────────────

CREATE OR REPLACE FUNCTION queue_embedding_job()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO embedding_jobs (entity_type, entity_id, status)
  VALUES (TG_TABLE_NAME, NEW.id, 'pending')
  ON CONFLICT (entity_type, entity_id)
  DO UPDATE SET status = 'pending', queued_at = NOW(), completed_at = NULL;
  RETURN NEW;
END;
$$;

-- Trigger on candidates
DROP TRIGGER IF EXISTS trg_candidate_embedding ON candidates;
CREATE TRIGGER trg_candidate_embedding
  AFTER INSERT OR UPDATE OF first_name, last_name, current_title, current_company, summary
  ON candidates FOR EACH ROW EXECUTE FUNCTION queue_embedding_job();

-- Trigger on jobs
DROP TRIGGER IF EXISTS trg_job_embedding ON jobs;
CREATE TRIGGER trg_job_embedding
  AFTER INSERT OR UPDATE OF title, description, requirements
  ON jobs FOR EACH ROW EXECUTE FUNCTION queue_embedding_job();

-- Trigger on clients
DROP TRIGGER IF EXISTS trg_client_embedding ON clients;
CREATE TRIGGER trg_client_embedding
  AFTER INSERT OR UPDATE OF name, industry, notes
  ON clients FOR EACH ROW EXECUTE FUNCTION queue_embedding_job();
