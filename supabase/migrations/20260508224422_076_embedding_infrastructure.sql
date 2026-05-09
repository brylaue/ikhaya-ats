/*
  # Embedding Infrastructure

  Wires up the full vector embedding pipeline:

  ## New Tables
  - `embedding_jobs` — queue for pending/processing/done embedding work
  - `candidate_embeddings` — per-candidate 1536-dim vector + model metadata
  - `job_embeddings` — per-job 1536-dim vector + model metadata
  - `ai_match_scores` — pre-computed candidate×job cosine similarity scores

  ## New Columns
  - `jobs.embedding vector(1536)` — inline embedding for search_all RPC

  ## Triggers
  - `trg_queue_candidate_embedding` — enqueues a candidate on INSERT or when
    name/title/company/skills/summary changes
  - `trg_queue_job_embedding` — enqueues a job on INSERT or when
    title/description/requirements/location changes

  ## Functions
  - `next_embedding_batch(batch_size)` — returns next N pending jobs ordered by queued_at
  - `top_matches_for_job(job_id, limit)` — returns top candidate matches from score cache

  ## Security
  - RLS enabled on all new tables
  - Policies scope all access to the user's own agency
*/

-- ── Add embedding column to jobs if not present ───────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'embedding'
  ) THEN
    ALTER TABLE public.jobs ADD COLUMN embedding vector(1536);
  END IF;
END $$;

-- ── embedding_jobs queue ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.embedding_jobs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text        NOT NULL CHECK (entity_type IN ('candidates', 'jobs', 'companies')),
  entity_id   uuid        NOT NULL,
  status      text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'error')),
  error       text,
  queued_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_embedding_jobs_pending
  ON public.embedding_jobs (queued_at ASC)
  WHERE status = 'pending';

ALTER TABLE public.embedding_jobs ENABLE ROW LEVEL SECURITY;

-- Service role (used by cron + edge function) can do everything; authenticated
-- users can only read their own agency's jobs via the entity relationship.
-- For simplicity, embedding_jobs is managed exclusively by service role — no
-- direct user access needed.
CREATE POLICY "Service role manages embedding jobs"
  ON public.embedding_jobs FOR SELECT
  TO authenticated
  USING (false);

-- ── candidate_embeddings ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.candidate_embeddings (
  candidate_id  uuid PRIMARY KEY REFERENCES public.candidates(id) ON DELETE CASCADE,
  agency_id     uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  embedding     vector(1536) NOT NULL,
  model         text NOT NULL DEFAULT 'text-embedding-3-small',
  content_hash  text,
  generated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cand_emb_agency ON public.candidate_embeddings (agency_id);
CREATE INDEX IF NOT EXISTS idx_cand_emb_vector
  ON public.candidate_embeddings USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

ALTER TABLE public.candidate_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency members can view candidate embeddings"
  ON public.candidate_embeddings FOR SELECT
  TO authenticated
  USING (agency_id IN (SELECT agency_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Agency members can insert candidate embeddings"
  ON public.candidate_embeddings FOR INSERT
  TO authenticated
  WITH CHECK (agency_id IN (SELECT agency_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Agency members can update candidate embeddings"
  ON public.candidate_embeddings FOR UPDATE
  TO authenticated
  USING (agency_id IN (SELECT agency_id FROM public.users WHERE id = auth.uid()))
  WITH CHECK (agency_id IN (SELECT agency_id FROM public.users WHERE id = auth.uid()));

-- ── job_embeddings ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.job_embeddings (
  job_id        uuid PRIMARY KEY REFERENCES public.jobs(id) ON DELETE CASCADE,
  agency_id     uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  embedding     vector(1536) NOT NULL,
  model         text NOT NULL DEFAULT 'text-embedding-3-small',
  content_hash  text,
  generated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_emb_agency ON public.job_embeddings (agency_id);
CREATE INDEX IF NOT EXISTS idx_job_emb_vector
  ON public.job_embeddings USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

ALTER TABLE public.job_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency members can view job embeddings"
  ON public.job_embeddings FOR SELECT
  TO authenticated
  USING (agency_id IN (SELECT agency_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Agency members can insert job embeddings"
  ON public.job_embeddings FOR INSERT
  TO authenticated
  WITH CHECK (agency_id IN (SELECT agency_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Agency members can update job embeddings"
  ON public.job_embeddings FOR UPDATE
  TO authenticated
  USING (agency_id IN (SELECT agency_id FROM public.users WHERE id = auth.uid()))
  WITH CHECK (agency_id IN (SELECT agency_id FROM public.users WHERE id = auth.uid()));

-- ── ai_match_scores ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_match_scores (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id     uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  candidate_id  uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  job_id        uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  score         numeric(5,2) NOT NULL CHECK (score BETWEEN 0 AND 100),
  percentile    numeric(5,2),
  computed_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_match_scores_job       ON public.ai_match_scores (job_id);
CREATE INDEX IF NOT EXISTS idx_match_scores_candidate ON public.ai_match_scores (candidate_id);
CREATE INDEX IF NOT EXISTS idx_match_scores_score     ON public.ai_match_scores (score DESC);

ALTER TABLE public.ai_match_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency members can view match scores"
  ON public.ai_match_scores FOR SELECT
  TO authenticated
  USING (agency_id IN (SELECT agency_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Agency members can insert match scores"
  ON public.ai_match_scores FOR INSERT
  TO authenticated
  WITH CHECK (agency_id IN (SELECT agency_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "Agency members can update match scores"
  ON public.ai_match_scores FOR UPDATE
  TO authenticated
  USING (agency_id IN (SELECT agency_id FROM public.users WHERE id = auth.uid()))
  WITH CHECK (agency_id IN (SELECT agency_id FROM public.users WHERE id = auth.uid()));

-- ── Helper: next_embedding_batch ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.next_embedding_batch(batch_size int DEFAULT 50)
RETURNS TABLE (entity_type text, entity_id uuid)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT entity_type, entity_id
  FROM   public.embedding_jobs
  WHERE  status = 'pending'
  ORDER  BY queued_at ASC
  LIMIT  batch_size;
$$;

-- ── Helper: top_matches_for_job ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.top_matches_for_job(
  p_job_id uuid,
  p_limit  integer DEFAULT 20
)
RETURNS TABLE (candidate_id uuid, score numeric)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT candidate_id, score
  FROM   public.ai_match_scores
  WHERE  job_id = p_job_id
  ORDER  BY score DESC
  LIMIT  p_limit;
$$;

-- ── Trigger: enqueue candidate on create/relevant update ─────────────────────
CREATE OR REPLACE FUNCTION public.queue_candidate_embedding()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR (
    TG_OP = 'UPDATE' AND (
      NEW.first_name     IS DISTINCT FROM OLD.first_name     OR
      NEW.last_name      IS DISTINCT FROM OLD.last_name      OR
      NEW.current_title  IS DISTINCT FROM OLD.current_title  OR
      NEW.current_company IS DISTINCT FROM OLD.current_company OR
      NEW.skills         IS DISTINCT FROM OLD.skills         OR
      NEW.summary        IS DISTINCT FROM OLD.summary        OR
      NEW.resume_text    IS DISTINCT FROM OLD.resume_text
    )
  ) THEN
    INSERT INTO public.embedding_jobs (entity_type, entity_id, status, queued_at)
    VALUES ('candidates', NEW.id, 'pending', NOW())
    ON CONFLICT (entity_type, entity_id)
    DO UPDATE SET status = 'pending', queued_at = NOW(), error = NULL, completed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_queue_candidate_embedding ON public.candidates;
CREATE TRIGGER trg_queue_candidate_embedding
  AFTER INSERT OR UPDATE ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION public.queue_candidate_embedding();

-- ── Trigger: enqueue job on create/relevant update ────────────────────────────
CREATE OR REPLACE FUNCTION public.queue_job_embedding()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR (
    TG_OP = 'UPDATE' AND (
      NEW.title        IS DISTINCT FROM OLD.title        OR
      NEW.description  IS DISTINCT FROM OLD.description  OR
      NEW.requirements IS DISTINCT FROM OLD.requirements OR
      NEW.location     IS DISTINCT FROM OLD.location
    )
  ) THEN
    INSERT INTO public.embedding_jobs (entity_type, entity_id, status, queued_at)
    VALUES ('jobs', NEW.id, 'pending', NOW())
    ON CONFLICT (entity_type, entity_id)
    DO UPDATE SET status = 'pending', queued_at = NOW(), error = NULL, completed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_queue_job_embedding ON public.jobs;
CREATE TRIGGER trg_queue_job_embedding
  AFTER INSERT OR UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.queue_job_embedding();

-- ── Backfill: queue existing records that have no embedding ───────────────────
INSERT INTO public.embedding_jobs (entity_type, entity_id, status, queued_at)
SELECT 'candidates', id, 'pending', NOW()
FROM public.candidates
WHERE embedding IS NULL
ON CONFLICT (entity_type, entity_id) DO NOTHING;

INSERT INTO public.embedding_jobs (entity_type, entity_id, status, queued_at)
SELECT 'jobs', id, 'pending', NOW()
FROM public.jobs
WHERE embedding IS NULL
ON CONFLICT (entity_type, entity_id) DO NOTHING;
