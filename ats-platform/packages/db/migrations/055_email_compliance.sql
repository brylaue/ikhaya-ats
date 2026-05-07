-- ─── Migration 055: Email Compliance (US-473, US-482, US-472) ───────────────
-- Adds the primitives required by CAN-SPAM, one-click unsubscribe (RFC 8058),
-- and bounce processing for outbound email. The outbound send path is not yet
-- wired (Gmail/Graph send is Stage 8+), but the data model ships now so that
-- compliance-critical behaviour lands in the same commit as the send surface.
--
-- Three additions:
--
-- 1. `email_suppression_list` — suppression per (agency, lower(email)). Consulted
--    before every send; honours unsubscribe / hard bounce / manual block.
--
-- 2. `email_bounces` — one row per bounced delivery. Populated by the inbound
--    sync worker when it detects a DSN / Mailer-Daemon NDR. Hard bounces auto-
--    insert into the suppression list via trigger.
--
-- 3. `agencies.mailing_address` + `agencies.support_email` + `agencies.legal_name`
--    — required fields for the CAN-SPAM physical-address footer (US-482).

-- ─── 1. Suppression list ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_suppression_list (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id  UUID        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  email      CITEXT      NOT NULL,
  reason     TEXT        NOT NULL DEFAULT 'unsubscribe'
             CHECK (reason IN ('unsubscribe','hard_bounce','complaint','manual','list_unsubscribe_post')),
  message_id UUID,       -- originating outbound message, if known
  source     TEXT,       -- 'footer_link' | 'list_unsubscribe_header' | 'bounce_trigger' | 'admin_ui'
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT email_suppression_agency_email_uniq UNIQUE (agency_id, email)
);

-- Requires citext — safe if already present.
CREATE EXTENSION IF NOT EXISTS citext;

CREATE INDEX IF NOT EXISTS email_suppression_agency_idx
  ON email_suppression_list(agency_id);
CREATE INDEX IF NOT EXISTS email_suppression_email_idx
  ON email_suppression_list(lower(email::text));

ALTER TABLE email_suppression_list ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'email_suppression_list' AND policyname = 'agency_suppression_select') THEN
    CREATE POLICY "agency_suppression_select" ON email_suppression_list
      FOR SELECT USING (agency_id = current_agency_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'email_suppression_list' AND policyname = 'agency_suppression_insert') THEN
    CREATE POLICY "agency_suppression_insert" ON email_suppression_list
      FOR INSERT WITH CHECK (agency_id = current_agency_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'email_suppression_list' AND policyname = 'agency_suppression_delete') THEN
    CREATE POLICY "agency_suppression_delete" ON email_suppression_list
      FOR DELETE USING (
        agency_id = current_agency_id() AND
        (SELECT role FROM users WHERE id = auth.uid()) IN ('owner','admin')
      );
  END IF;
END $$;

-- ─── 2. Bounce log ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_bounces (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  agency_id       UUID        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  recipient_email CITEXT      NOT NULL,
  bounce_type     TEXT        NOT NULL
                  CHECK (bounce_type IN ('hard','soft','complaint','auto_reply','unknown')),
  diagnostic_code TEXT,
  smtp_status     TEXT,       -- e.g. '5.1.1', '4.7.0'
  message_id      UUID,       -- originating outbound message, if resolvable
  dsn_raw         JSONB,      -- parsed DSN headers
  reported_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS email_bounces_agency_idx
  ON email_bounces(agency_id, reported_at DESC);
CREATE INDEX IF NOT EXISTS email_bounces_recipient_idx
  ON email_bounces(lower(recipient_email::text));

ALTER TABLE email_bounces ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'email_bounces' AND policyname = 'agency_bounces_select') THEN
    CREATE POLICY "agency_bounces_select" ON email_bounces
      FOR SELECT USING (agency_id = current_agency_id());
  END IF;
  -- Inserts come from the service role (sync worker) — bypasses RLS — so no
  -- customer-facing insert policy is needed.
END $$;

-- Hard bounces and spam complaints automatically add the recipient to
-- suppression. Soft bounces are logged but do NOT suppress (transient).
CREATE OR REPLACE FUNCTION email_bounces_auto_suppress()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.bounce_type IN ('hard','complaint') THEN
    INSERT INTO email_suppression_list (agency_id, email, reason, message_id, source, note)
    VALUES (
      NEW.agency_id,
      NEW.recipient_email,
      CASE NEW.bounce_type WHEN 'complaint' THEN 'complaint' ELSE 'hard_bounce' END,
      NEW.message_id,
      'bounce_trigger',
      NEW.smtp_status
    )
    ON CONFLICT (agency_id, email) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'email_bounces_auto_suppress_trg') THEN
    CREATE TRIGGER email_bounces_auto_suppress_trg
      AFTER INSERT ON email_bounces
      FOR EACH ROW EXECUTE FUNCTION email_bounces_auto_suppress();
  END IF;
END $$;

-- ─── 3. Agency mailing info (CAN-SPAM footer requirement) ────────────────────

ALTER TABLE agencies
  ADD COLUMN IF NOT EXISTS mailing_address TEXT,   -- multi-line, free-form
  ADD COLUMN IF NOT EXISTS legal_name      TEXT,
  ADD COLUMN IF NOT EXISTS support_email   CITEXT;

-- ─── Verification (comment only; run manually post-migration) ────────────────
-- SELECT policyname FROM pg_policies WHERE tablename = 'email_suppression_list';
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'agencies' AND column_name IN ('mailing_address','legal_name','support_email');
