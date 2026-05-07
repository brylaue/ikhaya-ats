-- ─── 021: Feature flags & plan gating ────────────────────────────────────────
-- Adds plan tier validation and per-agency feature overrides to agencies table.

-- Ensure plan column exists (already added by registration, but idempotent)
ALTER TABLE agencies
  ADD COLUMN IF NOT EXISTS plan              text    NOT NULL DEFAULT 'starter'
    CHECK (plan IN ('starter','growth','pro','enterprise')),
  ADD COLUMN IF NOT EXISTS feature_overrides jsonb   NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS plan_expires_at   timestamptz;

-- Index for quick plan lookups
CREATE INDEX IF NOT EXISTS agencies_plan_idx ON agencies(plan);
