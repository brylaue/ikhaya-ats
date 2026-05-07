-- Migration 038: Embedding Backfill Queue (US-375)
--
-- Queues ALL existing candidates and jobs that don't yet have embeddings
-- into the embedding_jobs table so the Edge Function can process them.
--
-- The Edge Function (supabase/functions/generate-embeddings) polls
-- embedding_jobs WHERE status = 'pending' and calls OpenAI for each.
--
-- This migration is safe to re-run (ON CONFLICT DO NOTHING).
-- After applying, trigger the backfill cron or run it manually via:
--   POST /api/cron/embed-backfill  (protected by CRON_SECRET)

-- ─── 1. Queue all candidates without embeddings ───────────────────────────────

INSERT INTO embedding_jobs (entity_type, entity_id, status, queued_at)
SELECT
  'candidates',
  id,
  'pending',
  NOW()
FROM candidates
WHERE embedding IS NULL
ON CONFLICT (entity_type, entity_id) DO NOTHING;

-- ─── 2. Queue all jobs without embeddings ─────────────────────────────────────

INSERT INTO embedding_jobs (entity_type, entity_id, status, queued_at)
SELECT
  'jobs',
  id,
  'pending',
  NOW()
FROM jobs
WHERE embedding IS NULL
ON CONFLICT (entity_type, entity_id) DO NOTHING;

-- ─── 3. Queue all companies without embeddings ────────────────────────────────

INSERT INTO embedding_jobs (entity_type, entity_id, status, queued_at)
SELECT
  'companies',
  id,
  'pending',
  NOW()
FROM companies
WHERE embedding IS NULL
ON CONFLICT (entity_type, entity_id) DO NOTHING;

-- ─── 4. Helper: get next batch of pending jobs (used by cron endpoint) ────────

CREATE OR REPLACE FUNCTION next_embedding_batch(batch_size int DEFAULT 50)
RETURNS TABLE (entity_type text, entity_id uuid)
LANGUAGE sql STABLE AS $$
  SELECT entity_type, entity_id
  FROM   embedding_jobs
  WHERE  status = 'pending'
  ORDER  BY queued_at ASC
  LIMIT  batch_size;
$$;

-- ─── 5. Summary comment ───────────────────────────────────────────────────────
-- After applying this migration:
--   SELECT entity_type, count(*) FROM embedding_jobs WHERE status = 'pending' GROUP BY 1;
-- Then trigger the cron or manually process via the Edge Function.
