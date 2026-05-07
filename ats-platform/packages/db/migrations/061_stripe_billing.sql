-- ─── Migration 055: Stripe Billing Fields ────────────────────────────────────
-- US-468/469/470: Adds Stripe subscription state to the agencies table and
-- creates a billing_events log for webhook idempotency + audit.

-- ── Stripe fields on agencies ─────────────────────────────────────────────────

ALTER TABLE agencies
  ADD COLUMN IF NOT EXISTS stripe_customer_id       TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id   TEXT,
  ADD COLUMN IF NOT EXISTS subscription_status      TEXT NOT NULL DEFAULT 'trialing'
    CHECK (subscription_status IN (
      'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete', 'paused'
    )),
  ADD COLUMN IF NOT EXISTS subscription_period_end  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_ends_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stripe_price_id          TEXT,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end     BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS agencies_stripe_customer_id_uq
  ON agencies (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS agencies_stripe_subscription_id_uq
  ON agencies (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- ── Billing events log (webhook idempotency + audit) ──────────────────────────

CREATE TABLE IF NOT EXISTS billing_events (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id       UUID        REFERENCES agencies(id) ON DELETE SET NULL,
  stripe_event_id TEXT        NOT NULL UNIQUE,   -- prevents replay
  event_type      TEXT        NOT NULL,          -- e.g. customer.subscription.updated
  payload         JSONB,
  processed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_events_agency_idx ON billing_events (agency_id);
CREATE INDEX IF NOT EXISTS billing_events_type_idx   ON billing_events (event_type);

-- RLS: platform-internal only — no user-facing RLS needed (all writes via service role).
-- Super-admin can read via service role; no row policy needed.

COMMENT ON TABLE billing_events IS
  'Idempotent log of inbound Stripe webhook events. '
  'stripe_event_id uniqueness prevents double-processing on retries.';

COMMENT ON COLUMN agencies.subscription_status IS
  'Mirrors Stripe subscription.status. Updated by /api/webhooks/stripe.';

COMMENT ON COLUMN agencies.cancel_at_period_end IS
  'True when the user has requested cancellation at end of current period.';
