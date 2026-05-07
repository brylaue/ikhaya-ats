-- ── Migration 064: AI Decision Log & Transparency Label (US-422) ───────────
--
-- EU AI Act preparedness + candidate-side transparency.
--
-- `ai_usage_events` (migration 049) is an API-call log: one row per fetch.
-- It's the right layer for cost accounting but is too low-level for
-- user-facing transparency. `ai_decisions` is the complementary table:
--   - One row per user-meaningful AI decision (match score, resume parse,
--     shortlist summary, skill normalisation, bias rewrite, …).
--   - Carries a stable `model_card_url` pointer so the platform can link
--     out to documentation without bloating this table.
--   - `visible_to_candidate` lets the candidate-portal transparency view
--     surface decisions that directly shaped *their* experience, while
--     hiding recruiter-internal ones (boolean-search generation etc).
--   - `input_hash` is a SHA-256 of the canonical prompt payload — lets us
--     detect whether two decisions came from equivalent inputs without
--     persisting the full prompt (PII-safe).
--
-- Pairs with the agency-level `ai_transparency_enabled` flag: if off,
-- candidate-portal transparency endpoints return an empty set. Log rows
-- are still written regardless (EU AI Act requires internal retention).
--
-- Idempotent: safe to re-run.

-- ── agency transparency flag ────────────────────────────────────────────────

ALTER TABLE agencies
  ADD COLUMN IF NOT EXISTS ai_transparency_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN agencies.ai_transparency_enabled IS
  'US-422: When true, candidates see a transparency badge listing AI decisions that shaped their experience. When false, internal logging still occurs; only candidate-facing exposure is suppressed.';

-- ── ai_decisions ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_decisions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id             uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  user_id               uuid REFERENCES users(id)    ON DELETE SET NULL,
  -- What kind of AI-assisted thing happened. Keep in sync with
  -- lib/ai/decision-log.ts DECISION_TYPES.
  decision_type         text NOT NULL,
  -- Subject = the primary entity this decision is about. Used for
  -- candidate-portal lookups and admin drill-downs.
  subject_type          text NOT NULL CHECK (subject_type IN (
                          'candidate','job','match_score','outreach',
                          'shortlist','query','scorecard','interview','other'
                        )),
  subject_id            uuid,
  -- Optional second entity: e.g. a match_score decision has subject=candidate
  -- and related=job so transparency view can say "scored against role X".
  related_type          text,
  related_id            uuid,
  -- Model identity — keep both the raw id (for cost lookups) and a stable
  -- model_card_url so the UI can link to documentation that persists across
  -- model churn.
  provider              text NOT NULL,
  model                 text NOT NULL,
  model_version         text,
  model_card_url        text,
  -- Bounded explanation field. Not a raw prompt dump — a short summary
  -- the UI can show ("Ranked candidate against job requirements using
  -- skills + experience + location criteria"). PII-safe.
  rationale             text,
  -- SHA-256 of the canonical prompt payload for reproducibility audits.
  input_hash            text,
  -- Which pre-computed usage event this belongs to, if any. Lets the
  -- admin drill from a decision to the underlying cost row.
  usage_event_id        uuid REFERENCES ai_usage_events(id) ON DELETE SET NULL,
  visible_to_candidate  boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_decisions_agency_time_idx
  ON ai_decisions (agency_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_decisions_subject_idx
  ON ai_decisions (subject_type, subject_id);

CREATE INDEX IF NOT EXISTS ai_decisions_related_idx
  ON ai_decisions (related_type, related_id)
  WHERE related_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS ai_decisions_type_time_idx
  ON ai_decisions (decision_type, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_decisions_candidate_visible_idx
  ON ai_decisions (subject_id, created_at DESC)
  WHERE subject_type = 'candidate' AND visible_to_candidate = true;

COMMENT ON TABLE ai_decisions IS
  'US-422: Per-decision AI transparency log. Complements ai_usage_events (API-call level) with a user-meaningful layer (match scores, parses, summaries). EU AI Act compliant.';

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE ai_decisions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ai_decisions' AND policyname = 'ai_decisions_select'
  ) THEN
    CREATE POLICY ai_decisions_select ON ai_decisions FOR SELECT
      USING (agency_id = current_agency_id());
  END IF;

  -- Inserts happen via the service-role path (decision-log.ts uses the
  -- service client). No user-facing INSERT policy is required, but add
  -- a restrictive one so direct Supabase-client writes still respect
  -- tenant scoping if the service-role bypass ever changes.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ai_decisions' AND policyname = 'ai_decisions_insert'
  ) THEN
    CREATE POLICY ai_decisions_insert ON ai_decisions FOR INSERT
      WITH CHECK (agency_id = current_agency_id());
  END IF;

  -- No UPDATE/DELETE policy — decisions are append-only by design.
  -- GDPR erasure cascades handle lawful removal via the agency/user FKs.
END $$;

-- ── Model-card registry view ────────────────────────────────────────────────
-- Denormalised view joining decisions to recorded usage. Useful for the
-- admin transparency page + potential regulator exports. Cheap — LEFT JOIN
-- on indexed FK.

CREATE OR REPLACE VIEW ai_decisions_enriched AS
SELECT
  d.id,
  d.agency_id,
  d.user_id,
  u.email           AS user_email,
  TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')) AS user_name,
  d.decision_type,
  d.subject_type,
  d.subject_id,
  d.related_type,
  d.related_id,
  d.provider,
  d.model,
  d.model_version,
  d.model_card_url,
  d.rationale,
  d.visible_to_candidate,
  d.created_at,
  ue.input_tokens,
  ue.output_tokens,
  ue.estimated_cost_usd,
  ue.latency_ms
FROM   ai_decisions d
LEFT   JOIN users           u  ON u.id  = d.user_id
LEFT   JOIN ai_usage_events ue ON ue.id = d.usage_event_id;

COMMENT ON VIEW ai_decisions_enriched IS
  'US-422: Decisions + resolved user + cost/latency from ai_usage_events. Powers the admin AI transparency page.';
