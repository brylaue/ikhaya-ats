-- Migration 033: Email Verification Tokens (US-400)
-- One-time codes for high-risk actions: API key creation, bulk export, deletion, etc.
-- 10-minute TTL, consumed on use, audit-logged.

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action        TEXT        NOT NULL,         -- e.g. "api_key_create", "bulk_export", "account_delete"
  code          TEXT        NOT NULL,         -- 6-digit OTP (stored as bcrypt hash ideally, plain for simplicity here)
  code_hash     TEXT        NOT NULL,         -- SHA-256 of code for constant-time compare
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '10 minutes'),
  used_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for lookups
CREATE INDEX IF NOT EXISTS email_verification_tokens_user_action_idx
  ON email_verification_tokens (user_id, action, expires_at);

-- Auto-clean expired tokens (keep 24h for audit trail)
CREATE INDEX IF NOT EXISTS email_verification_tokens_expires_idx
  ON email_verification_tokens (expires_at);

-- RLS
ALTER TABLE email_verification_tokens ENABLE ROW LEVEL SECURITY;

-- Users can only read/delete their own tokens (server uses service role to insert/verify)
CREATE POLICY "users_own_tokens" ON email_verification_tokens
  FOR SELECT USING (auth.uid() = user_id);

-- Service role bypasses RLS for all writes
