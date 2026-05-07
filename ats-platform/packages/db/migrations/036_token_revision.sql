-- Migration: 028_token_revision
-- US-340: Add token_revision column to provider_connections for optimistic
-- locking during concurrent refresh token rotation. Prevents race conditions
-- where two simultaneous refreshes both succeed but only one is persisted.
--
-- The update pattern: UPDATE ... SET token_revision = token_revision + 1
--   WHERE id = $1 AND token_revision = $current
-- If 0 rows updated → another refresh won the race, retry with fresh data.

ALTER TABLE provider_connections
  ADD COLUMN IF NOT EXISTS token_revision INTEGER NOT NULL DEFAULT 1;

COMMENT ON COLUMN provider_connections.token_revision IS
  'Monotonically incrementing integer; used for optimistic locking during '
  'token refresh to detect concurrent refresh races (US-340).';
