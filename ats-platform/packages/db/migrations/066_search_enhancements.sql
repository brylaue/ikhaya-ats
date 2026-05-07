-- ── Migration 066: Search Enhancements (US-486, US-488, US-489, US-490, US-494) ──
--
-- Covers the five search-quality stories:
--
--   US-486  Search History & Quick Re-Run
--           Per-user ring buffer of recent searches (limit 20 per user).
--           Stores query text + filters + result count so we can re-run
--           without the user re-typing.
--
--   US-488  Explicit Search Result Feedback
--           Recruiter thumbs-up / thumbs-down on a specific candidate result
--           for a given search context (query + job). Used to surface "great fit
--           that I always pick" and "always skip this one" candidates.
--
--   US-489  Implicit Search Signal Capture
--           Auto-recorded events: candidate viewed from search result, added to
--           shortlist from search, etc. Lower-fidelity signal than explicit
--           feedback but much higher volume.
--
--   US-490  Pinned Filters & Per-User Search Defaults
--           Stores user's preferred default filters (status, source, tag, etc.)
--           so the search page opens in the right state for each recruiter.
--
--   US-494  Boolean Search Feedback Loop
--           Tracks which AI-generated boolean strings the recruiter actually
--           used vs. discarded — feeds quality improvement.
--
-- Idempotent: safe to re-run.

-- ── search_history ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS search_history (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id       uuid        NOT NULL REFERENCES agencies(id)  ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
  query           text        NOT NULL DEFAULT '',
  filters         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  -- e.g. { "status": "active", "source": "linkedin", "tags": ["python"] }
  result_count    integer     NOT NULL DEFAULT 0,
  search_type     text        NOT NULL DEFAULT 'keyword'
                              CHECK (search_type IN ('keyword', 'boolean', 'semantic', 'nl_talent')),
  ran_at          timestamptz NOT NULL DEFAULT now()
);

-- Keep at most 20 entries per user — enforced by trigger below
CREATE INDEX IF NOT EXISTS search_history_user_ran_idx
  ON search_history (user_id, ran_at DESC);
CREATE INDEX IF NOT EXISTS search_history_agency_idx
  ON search_history (agency_id);

-- Trim to 20 most-recent entries per user after each insert
CREATE OR REPLACE FUNCTION trim_search_history()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM search_history
  WHERE user_id = NEW.user_id
    AND id NOT IN (
      SELECT id FROM search_history
      WHERE user_id = NEW.user_id
      ORDER BY ran_at DESC
      LIMIT 20
    );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS search_history_trim ON search_history;
CREATE TRIGGER search_history_trim
  AFTER INSERT ON search_history
  FOR EACH ROW EXECUTE FUNCTION trim_search_history();

ALTER TABLE search_history ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='search_history' AND policyname='sh_select') THEN
    CREATE POLICY "sh_select" ON search_history FOR SELECT USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='search_history' AND policyname='sh_insert') THEN
    CREATE POLICY "sh_insert" ON search_history FOR INSERT WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='search_history' AND policyname='sh_delete') THEN
    CREATE POLICY "sh_delete" ON search_history FOR DELETE USING (user_id = auth.uid());
  END IF;
END $$;

-- ── search_result_feedback ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS search_result_feedback (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id       uuid        NOT NULL REFERENCES agencies(id)      ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
  candidate_id    uuid        NOT NULL REFERENCES candidates(id)    ON DELETE CASCADE,
  job_id          uuid                 REFERENCES jobs(id)          ON DELETE SET NULL,
  -- query context at time of feedback
  query_snapshot  text        NOT NULL DEFAULT '',
  signal          text        NOT NULL CHECK (signal IN ('thumbs_up', 'thumbs_down')),
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- one explicit signal per (user, candidate, job) context
  UNIQUE (user_id, candidate_id, job_id)
);

CREATE INDEX IF NOT EXISTS srf_candidate_idx ON search_result_feedback (candidate_id);
CREATE INDEX IF NOT EXISTS srf_agency_idx    ON search_result_feedback (agency_id);

ALTER TABLE search_result_feedback ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='search_result_feedback' AND policyname='srf_select') THEN
    CREATE POLICY "srf_select" ON search_result_feedback FOR SELECT
      USING (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='search_result_feedback' AND policyname='srf_write') THEN
    CREATE POLICY "srf_write" ON search_result_feedback FOR ALL
      USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- ── search_signals ────────────────────────────────────────────────────────────
-- Implicit signals: view, shortlist-add, email-sent, profile-opened, skipped.

CREATE TABLE IF NOT EXISTS search_signals (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id       uuid        NOT NULL REFERENCES agencies(id)      ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
  candidate_id    uuid        NOT NULL REFERENCES candidates(id)    ON DELETE CASCADE,
  job_id          uuid                 REFERENCES jobs(id)          ON DELETE SET NULL,
  query_snapshot  text        NOT NULL DEFAULT '',
  signal_type     text        NOT NULL
                              CHECK (signal_type IN ('view','shortlist_add','email_sent','skip','profile_open')),
  position        integer,    -- rank in search results at time of action
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ss_candidate_idx ON search_signals (candidate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ss_agency_idx    ON search_signals (agency_id, created_at DESC);

ALTER TABLE search_signals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='search_signals' AND policyname='ss_select') THEN
    CREATE POLICY "ss_select" ON search_signals FOR SELECT
      USING (agency_id IN (SELECT agency_id FROM users WHERE id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='search_signals' AND policyname='ss_insert') THEN
    CREATE POLICY "ss_insert" ON search_signals FOR INSERT WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- ── user_search_defaults ──────────────────────────────────────────────────────
-- One row per user; JSONB map of pinned filter defaults.
-- e.g. { "status": "active", "source": "linkedin", "tags": [], "sort": "match_score" }

CREATE TABLE IF NOT EXISTS user_search_defaults (
  user_id     uuid        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  agency_id   uuid        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  defaults    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_search_defaults ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_search_defaults' AND policyname='usd_own') THEN
    CREATE POLICY "usd_own" ON user_search_defaults FOR ALL
      USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

CREATE OR REPLACE FUNCTION usd_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS usd_updated_at ON user_search_defaults;
CREATE TRIGGER usd_updated_at
  BEFORE UPDATE ON user_search_defaults
  FOR EACH ROW EXECUTE FUNCTION usd_touch_updated_at();

-- ── boolean_search_feedback ───────────────────────────────────────────────────
-- US-494: track whether recruiter used / edited / discarded each AI boolean string.

CREATE TABLE IF NOT EXISTS boolean_search_feedback (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id       uuid        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  natural_query   text        NOT NULL,
  generated_bool  text        NOT NULL,
  final_bool      text,       -- what the recruiter actually ran (null = discarded)
  outcome         text        NOT NULL DEFAULT 'pending'
                              CHECK (outcome IN ('used_as_is','edited','discarded','pending')),
  result_count    integer,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bsf_agency_idx ON boolean_search_feedback (agency_id, created_at DESC);

ALTER TABLE boolean_search_feedback ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='boolean_search_feedback' AND policyname='bsf_own') THEN
    CREATE POLICY "bsf_own" ON boolean_search_feedback FOR ALL
      USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END $$;
