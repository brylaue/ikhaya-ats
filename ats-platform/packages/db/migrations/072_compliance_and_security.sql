-- ─── Migration 072: Compliance & Security Features ───────────────────────────
-- US-348: Sensitive Field Encryption at Application Layer
-- US-351: Article 30 Record of Processing Activities (RoPA)
-- US-352: Per-Agency Encryption Key Management (BYOK)
-- US-353: Candidate Privacy Self-Service Portal (DSAR)
-- US-354: Cross-Border Transfer Controls & SCC Templates
-- US-355: SOC 2 Type II Evidence Collection & Controls Mapping
-- US-404: IP Allowlist & Geo Restrictions
-- US-420: EEO-1 Demographic Capture & Attestation
-- US-421: Adverse Impact Analysis support columns

-- ─── US-348: Encrypted sensitive fields on candidates ────────────────────────

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS encrypted_fields JSONB DEFAULT '{}';

COMMENT ON COLUMN candidates.encrypted_fields IS
  'AES-GCM encrypted sensitive fields. Schema: { fieldName: { iv: string, ciphertext: string, tag: string } }. '
  'Key material derived from agency-level key (US-352). Never query or filter on ciphertext.';

-- ─── US-351: GDPR Article 30 Record of Processing Activities ─────────────────

CREATE TABLE IF NOT EXISTS data_processing_records (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id                UUID        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,

  -- Processing activity details
  activity_name            TEXT        NOT NULL,
  purpose                  TEXT        NOT NULL,
  legal_basis              TEXT        NOT NULL CHECK (legal_basis IN (
    'consent', 'contract', 'legal_obligation',
    'vital_interests', 'public_task', 'legitimate_interests'
  )),
  data_categories          TEXT[]      NOT NULL DEFAULT '{}',
  data_subjects            TEXT[]      NOT NULL DEFAULT '{}',
  recipients               TEXT[]      NOT NULL DEFAULT '{}',

  -- Retention
  retention_period         TEXT,

  -- Cross-border transfers
  third_country_transfers  TEXT[]      DEFAULT '{}',
  transfer_mechanism       TEXT        CHECK (transfer_mechanism IN (
    'adequacy_decision', 'sccs', 'bcrs', 'derogation', 'none'
  )),
  transfer_safeguards      TEXT,

  -- Controller/processor info
  controller_name          TEXT,
  dpo_contact              TEXT,

  -- Review lifecycle
  last_reviewed_at         TIMESTAMPTZ,
  last_reviewed_by         UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  needs_review_alert_sent  BOOLEAN     NOT NULL DEFAULT FALSE,

  -- Seeded = auto-created on agency provisioning
  is_seeded                BOOLEAN     NOT NULL DEFAULT FALSE,

  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dpr_agency_idx ON data_processing_records (agency_id);

ALTER TABLE data_processing_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dpr_agency_own" ON data_processing_records FOR ALL
  USING (agency_id = (SELECT agency_id FROM agency_users WHERE user_id = auth.uid() LIMIT 1));

CREATE TRIGGER dpr_updated_at
  BEFORE UPDATE ON data_processing_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed 5 standard activities on agency creation
-- (called from application layer on agency signup)

-- ─── US-352: Per-Agency Encryption Key (BYOK) ────────────────────────────────
-- Store agency's encryption key material (itself encrypted server-side)
-- to support key rotation without re-encrypting all fields at once.

ALTER TABLE agencies
  ADD COLUMN IF NOT EXISTS encryption_key_hash        TEXT,
  ADD COLUMN IF NOT EXISTS encryption_key_version     INTEGER     NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS encryption_key_rotated_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS encryption_key_rotated_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN agencies.encryption_key_hash IS
  'PBKDF2-SHA256 hash of the agency key material for verification. '
  'Actual key material lives in env or key management service.';

-- Key rotation audit log
CREATE TABLE IF NOT EXISTS encryption_key_rotations (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id        UUID        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  from_version     INTEGER     NOT NULL,
  to_version       INTEGER     NOT NULL,
  initiated_by     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  fields_migrated  INTEGER     DEFAULT 0,
  status           TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  error_detail     TEXT,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ekr_agency_idx ON encryption_key_rotations (agency_id, started_at DESC);
ALTER TABLE encryption_key_rotations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ekr_agency_admin" ON encryption_key_rotations FOR ALL
  USING (agency_id = (SELECT agency_id FROM agency_users WHERE user_id = auth.uid() LIMIT 1));

-- ─── US-353: Candidate Privacy Self-Service Portal (DSAR) ────────────────────

CREATE TABLE IF NOT EXISTS privacy_requests (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id       UUID        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,

  -- Submitter identity (verified by email token)
  email           TEXT        NOT NULL,
  verification_token TEXT     NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  verified_at     TIMESTAMPTZ,

  request_type    TEXT        NOT NULL CHECK (request_type IN (
    'access', 'erasure', 'portability', 'rectification', 'restriction', 'objection'
  )),

  -- Submission state
  status          TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'verified', 'processing', 'completed', 'rejected')),

  additional_info TEXT,

  -- Response
  response_notes  TEXT,
  completed_at    TIMESTAMPTZ,
  handled_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Token for status check (no account required)
  status_token    TEXT        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(20), 'hex'),

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pr_agency_idx   ON privacy_requests (agency_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS pr_email_idx    ON privacy_requests (email);
CREATE INDEX IF NOT EXISTS pr_ver_tok_idx  ON privacy_requests (verification_token);
CREATE INDEX IF NOT EXISTS pr_stat_tok_idx ON privacy_requests (status_token);

-- Public INSERT (no auth) — portal allows anyone to submit
ALTER TABLE privacy_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "privacy_requests_public_insert" ON privacy_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "privacy_requests_agency_manage" ON privacy_requests FOR SELECT USING (
  agency_id = (SELECT agency_id FROM agency_users WHERE user_id = auth.uid() LIMIT 1)
);
CREATE POLICY "privacy_requests_agency_update" ON privacy_requests FOR UPDATE USING (
  agency_id = (SELECT agency_id FROM agency_users WHERE user_id = auth.uid() LIMIT 1)
);

CREATE TRIGGER privacy_requests_updated_at
  BEFORE UPDATE ON privacy_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── US-354: Cross-Border Transfer Controls ───────────────────────────────────

ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS data_residency_region TEXT DEFAULT 'us-east-1';

CREATE TABLE IF NOT EXISTS scc_templates (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id   UUID        REFERENCES agencies(id) ON DELETE CASCADE,
  -- null agency_id = platform-level template
  name        TEXT        NOT NULL,
  corridor    TEXT        NOT NULL,  -- e.g. 'EU→US', 'UK→US'
  version     TEXT        NOT NULL,  -- e.g. '2021/914'
  content_url TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO scc_templates (name, corridor, version, content_url) VALUES
  ('EU Standard Contractual Clauses (2021)', 'EU→US',  '2021/914',  'https://eur-lex.europa.eu/eli/dec_impl/2021/914/oj'),
  ('UK International Data Transfer Agreement', 'UK→US', 'IDTA-2022', 'https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/international-transfers/international-data-transfer-agreement-and-guidance/')
ON CONFLICT DO NOTHING;

-- ─── US-355: SOC 2 Controls Inventory ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS soc2_controls (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id        UUID        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  control_id       TEXT        NOT NULL,   -- e.g. 'CC6.1'
  criteria         TEXT        NOT NULL,   -- e.g. 'CC6 — Logical Access'
  description      TEXT        NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'not_evaluated'
    CHECK (status IN ('passing', 'failing', 'not_applicable', 'not_evaluated')),
  evidence_query   TEXT,                   -- SQL to run for evidence collection
  last_checked_at  TIMESTAMPTZ,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agency_id, control_id)
);

CREATE INDEX IF NOT EXISTS soc2_agency_idx ON soc2_controls (agency_id);
ALTER TABLE soc2_controls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "soc2_agency_own" ON soc2_controls FOR ALL
  USING (agency_id = (SELECT agency_id FROM agency_users WHERE user_id = auth.uid() LIMIT 1));

CREATE TRIGGER soc2_controls_updated_at
  BEFORE UPDATE ON soc2_controls
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── US-404: IP Allowlist & Geo Restrictions ─────────────────────────────────

CREATE TABLE IF NOT EXISTS ip_allowlist_rules (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id   UUID        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  cidr        TEXT        NOT NULL,   -- e.g. '192.168.1.0/24'
  label       TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ip_al_agency_idx ON ip_allowlist_rules (agency_id) WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS geo_block_rules (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id   UUID        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  country_code TEXT       NOT NULL,   -- ISO 3166-1 alpha-2
  label       TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agency_id, country_code)
);

ALTER TABLE ip_allowlist_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ip_al_agency_admin" ON ip_allowlist_rules FOR ALL
  USING (agency_id = (SELECT agency_id FROM agency_users WHERE user_id = auth.uid() LIMIT 1));

ALTER TABLE geo_block_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "geo_block_agency_admin" ON geo_block_rules FOR ALL
  USING (agency_id = (SELECT agency_id FROM agency_users WHERE user_id = auth.uid() LIMIT 1));

-- ─── US-420: EEO-1 Demographic Capture ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS candidate_eeo_data (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id          UUID        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  candidate_id       UUID        NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,

  -- Self-reported; "declined" is a valid answer for each dimension
  gender             TEXT        CHECK (gender IN ('male','female','nonbinary','self_describe','declined')),
  race_ethnicity     TEXT        CHECK (race_ethnicity IN (
    'hispanic_or_latino','white','black_or_african_american',
    'native_hawaiian_pacific_islander','asian','american_indian_alaska_native',
    'two_or_more_races','declined'
  )),
  veteran_status     TEXT        CHECK (veteran_status IN ('veteran','protected_veteran','not_veteran','declined')),
  disability_status  TEXT        CHECK (disability_status IN ('yes','no','declined')),

  -- Jurisdiction override (EEO-1 vs local variants)
  jurisdiction       TEXT        DEFAULT 'us_federal',

  submitted_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agency_id, candidate_id)
);

CREATE INDEX IF NOT EXISTS eeo_agency_idx ON candidate_eeo_data (agency_id);
ALTER TABLE candidate_eeo_data ENABLE ROW LEVEL SECURITY;

-- Candidates submit via public portal (service role); recruiters read aggregate only
CREATE POLICY "eeo_agency_select" ON candidate_eeo_data FOR SELECT
  USING (agency_id = (SELECT agency_id FROM agency_users WHERE user_id = auth.uid() LIMIT 1));

COMMENT ON TABLE candidate_eeo_data IS
  'Voluntary EEO-1 self-identification data. Stored separately from match/screen data. '
  'Access restricted to aggregate reports; individual rows not exposed in candidate cards.';
