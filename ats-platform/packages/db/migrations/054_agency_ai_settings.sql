-- ─── Migration 052: Agency AI Settings (BYO AI Key) ─────────────────────────
-- US-441: Agencies can supply their own Anthropic / OpenAI keys and choose
--         which Claude model to use. Keys are stored AES-256-GCM encrypted
--         (same scheme as email tokens). NULL key → platform key is used.

CREATE TABLE agency_ai_settings (
  agency_id        UUID        PRIMARY KEY
                               REFERENCES agencies(id) ON DELETE CASCADE,
  preferred_model  TEXT        NOT NULL DEFAULT 'claude-sonnet-4-6',
  -- Encrypted API keys (AES-256-GCM via AI_KEY_ENCRYPTION_KEY env var).
  -- NULL = use platform-level key from ANTHROPIC_API_KEY / OPENAI_API_KEY.
  anthropic_key    TEXT,
  openai_key       TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by       UUID        REFERENCES auth.users(id)
);

-- Only values shipped / expected by the app are allowed.
ALTER TABLE agency_ai_settings
  ADD CONSTRAINT agency_ai_settings_model_check
  CHECK (preferred_model IN (
    'claude-opus-4-6',
    'claude-sonnet-4-6',
    'claude-haiku-4-5-20251001'
  ));

-- Row-level security: agency admins read/write their own row.
-- Uses the same pattern as other agency-scoped tables.
ALTER TABLE agency_ai_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agency_ai_settings_own"
  ON agency_ai_settings
  FOR ALL
  USING (
    agency_id = (
      SELECT agency_id
      FROM   agency_users
      WHERE  user_id = auth.uid()
      LIMIT  1
    )
  );

COMMENT ON TABLE agency_ai_settings IS
  'Per-agency AI model preferences and optional BYO API keys (encrypted). '
  'NULL keys fall back to platform-level environment variables.';

COMMENT ON COLUMN agency_ai_settings.anthropic_key IS
  'AES-256-GCM encrypted Anthropic API key. '
  'Envelope key: AI_KEY_ENCRYPTION_KEY env var (32-byte base64). '
  'NULL = use platform ANTHROPIC_API_KEY.';

COMMENT ON COLUMN agency_ai_settings.openai_key IS
  'AES-256-GCM encrypted OpenAI API key used for text-embedding-3-small. '
  'NULL = use platform OPENAI_API_KEY.';
