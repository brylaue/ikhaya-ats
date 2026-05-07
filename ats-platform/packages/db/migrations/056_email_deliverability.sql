-- ─── Migration 056: Email Deliverability ──────────────────────────────────────
-- US-471: Custom sending domains (SPF/DKIM/DMARC verification)
-- US-472: Bounce processing
-- US-473: Unsubscribe tokens
-- US-482: CAN-SPAM compliance fields

-- ── Sending domains ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sending_domains (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id       UUID        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  domain          TEXT        NOT NULL,

  -- DNS verification state
  verified        BOOLEAN     NOT NULL DEFAULT false,
  verified_at     TIMESTAMPTZ,

  -- SPF / DKIM / DMARC DNS records the agency must publish
  spf_record      TEXT,       -- expected TXT value
  dkim_selector   TEXT,       -- e.g. "mailkey1"
  dkim_public_key TEXT,       -- DKIM public key for the TXT record
  dmarc_record    TEXT,       -- expected DMARC TXT value

  -- Provider-specific identifiers (Postmark / SendGrid domain ID)
  provider        TEXT        NOT NULL DEFAULT 'postmark',
  provider_domain_id TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One verified domain per agency
CREATE UNIQUE INDEX IF NOT EXISTS sending_domains_agency_domain_uq
  ON sending_domains (agency_id, domain);

-- Fast lookup by provider domain ID (for webhook matching)
CREATE INDEX IF NOT EXISTS sending_domains_provider_id_idx
  ON sending_domains (provider_domain_id)
  WHERE provider_domain_id IS NOT NULL;

ALTER TABLE sending_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sending_domains_agency_own" ON sending_domains FOR ALL
  USING (agency_id = (SELECT agency_id FROM agency_users WHERE user_id = auth.uid() LIMIT 1));

CREATE TRIGGER sending_domains_updated_at
  BEFORE UPDATE ON sending_domains
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE sending_domains IS
  'Custom sending domains per agency. DNS records (SPF/DKIM/DMARC) must be published '
  'before the domain can be used to send outreach emails.';

-- ── Email suppression list ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_suppression_list (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id   UUID        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  email       TEXT        NOT NULL,
  reason      TEXT        NOT NULL    -- 'unsubscribe' | 'bounce_hard' | 'bounce_soft' | 'spam_complaint' | 'manual'
    CHECK (reason IN ('unsubscribe', 'bounce_hard', 'bounce_soft', 'spam_complaint', 'manual')),
  source      TEXT,                   -- e.g. 'webhook:postmark', 'user:manual', 'sequence:enroll'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One suppression record per (agency, email) — prevents duplicate suppression rows
CREATE UNIQUE INDEX IF NOT EXISTS email_suppression_agency_email_uq
  ON email_suppression_list (agency_id, email);

CREATE INDEX IF NOT EXISTS email_suppression_email_idx ON email_suppression_list (email);
CREATE INDEX IF NOT EXISTS email_suppression_reason_idx ON email_suppression_list (reason);

ALTER TABLE email_suppression_list ENABLE ROW LEVEL SECURITY;

-- Recruiters can read/create suppressions for their agency (unsubscribe flow creates rows via service role)
CREATE POLICY "email_suppression_agency_read" ON email_suppression_list FOR SELECT
  USING (agency_id = (SELECT agency_id FROM agency_users WHERE user_id = auth.uid() LIMIT 1));

CREATE POLICY "email_suppression_agency_insert" ON email_suppression_list FOR INSERT
  WITH CHECK (agency_id = (SELECT agency_id FROM agency_users WHERE user_id = auth.uid() LIMIT 1));

CREATE POLICY "email_suppression_agency_delete" ON email_suppression_list FOR DELETE
  USING (agency_id = (SELECT agency_id FROM agency_users WHERE user_id = auth.uid() LIMIT 1));

COMMENT ON TABLE email_suppression_list IS
  'Agency-scoped email suppression list. Any email here is skipped during outreach sends. '
  'Populated by unsubscribe clicks, bounce webhooks, and manual recruiter entries.';

-- ── Unsubscribe tokens ─────────────────────────────────────────────────────────
-- Each outreach email embeds a signed token. Clicking unsubscribe calls
-- /api/unsubscribe?t=<token> which adds the email to email_suppression_list.

CREATE TABLE IF NOT EXISTS unsubscribe_tokens (
  token       TEXT        PRIMARY KEY,   -- random 32-byte hex
  agency_id   UUID        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  email       TEXT        NOT NULL,
  candidate_id UUID       REFERENCES candidates(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS unsubscribe_tokens_email_idx ON unsubscribe_tokens (email);
CREATE INDEX IF NOT EXISTS unsubscribe_tokens_agency_idx ON unsubscribe_tokens (agency_id);

COMMENT ON TABLE unsubscribe_tokens IS
  'One-time tokens embedded in outreach email footers. '
  'Consuming a token suppresses the recipient email for that agency.';

-- ── CAN-SPAM: physical address on agencies ────────────────────────────────────

ALTER TABLE agencies
  ADD COLUMN IF NOT EXISTS can_spam_address TEXT;

COMMENT ON COLUMN agencies.can_spam_address IS
  'US-482 CAN-SPAM §7(b): Physical postal address injected into outreach email footers.';
