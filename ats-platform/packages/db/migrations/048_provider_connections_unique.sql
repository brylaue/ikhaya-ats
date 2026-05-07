-- Migration: 048_provider_connections_unique
-- US-343: Harden provider_connections against duplicate rows from concurrent
-- OAuth callbacks (e.g. user double-clicks "Connect Microsoft", two tabs
-- complete the auth dance at nearly the same moment).
--
-- Two constraints guard the table:
--
--   1. UNIQUE (user_id, provider)
--        Already created in migration 003; re-asserted here defensively.
--        Guarantees a single user can only hold one active connection per
--        provider, so the Google / Microsoft callback upserts
--        (onConflict: "user_id,provider") can never emit a second row.
--
--   2. UNIQUE (agency_id, provider, provider_sub)
--        NEW. Prevents the same external account (provider_sub) from being
--        linked twice inside the same Ikhaya agency — regardless of which
--        Ikhaya user linked it. Without this, User A and User B in the same
--        agency could race to connect the same MS mailbox and end up with
--        two rows both pointing at the same external inbox. Cross-agency
--        collisions are intentionally allowed — they are handled by the
--        "already-bound" check in the OAuth callback, which returns a
--        friendlier UX (redirect + explanatory error) than a 23505 at the
--        DB layer.
--
-- Both statements are idempotent: the DO blocks inspect
-- information_schema.table_constraints before creating.
--
-- Rollback:
--   ALTER TABLE provider_connections DROP CONSTRAINT IF EXISTS provider_connections_agency_provider_sub_key;

-- Defensive re-assertion of the (user_id, provider) uniqueness.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   information_schema.table_constraints
    WHERE  table_name      = 'provider_connections'
    AND    constraint_type = 'UNIQUE'
    AND    constraint_name = 'provider_connections_user_id_provider_key'
  ) THEN
    ALTER TABLE provider_connections
      ADD CONSTRAINT provider_connections_user_id_provider_key
      UNIQUE (user_id, provider);
  END IF;
END $$;

-- Agency-scoped identity uniqueness — blocks same MS / Google account
-- being linked twice inside one agency under different user rows.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   information_schema.table_constraints
    WHERE  table_name      = 'provider_connections'
    AND    constraint_type = 'UNIQUE'
    AND    constraint_name = 'provider_connections_agency_provider_sub_key'
  ) THEN
    ALTER TABLE provider_connections
      ADD CONSTRAINT provider_connections_agency_provider_sub_key
      UNIQUE (agency_id, provider, provider_sub);
  END IF;
END $$;

COMMENT ON CONSTRAINT provider_connections_agency_provider_sub_key ON provider_connections IS
  'US-343: prevents duplicate rows for the same external account within an '
  'agency. Cross-agency duplicates are handled by the OAuth callback '
  '"already-bound" check, which emits a user-friendly redirect instead of '
  'a raw unique violation.';
