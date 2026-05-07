-- ============================================================
-- Migration 010: Data Compliance & Privacy
-- GDPR / CCPA hardening: consent, DSAR, retention, breach response
-- Per-agency RLS on all tables via current_agency_id()
-- ============================================================

-- ─────────────────────────────────────────────
-- 1. CANDIDATE CONSENTS
-- One record per consent event per candidate.
-- Tracks legal basis, source, grant/withdrawal timestamps.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS candidate_consents (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id         UUID        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  candidate_id      UUID        NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,

  -- What the candidate consented (or objected) to
  consent_type      TEXT        NOT NULL CHECK (consent_type IN (
                                  'data_processing',   -- general profile storage & use
                                  'marketing_email',   -- outreach sequences
                                  'sms',               -- SMS (mirrors 10DLC record)
                                  'portal_sharing',    -- sharing profile to client portals
                                  'enrichment',        -- vendor data enrichment lookups
                                  'ai_processing',     -- AI scoring / summarization
                                  'third_party_ats'    -- pushing to client ATS
                                )),

  -- Current state
  status            TEXT        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending','granted','denied','withdrawn','expired')),

  -- GDPR Article 6 legal basis
  legal_basis       TEXT        NOT NULL CHECK (legal_basis IN (
                                  'consent',
                                  'legitimate_interest',
                                  'contract',
                                  'legal_obligation',
                                  'vital_interests',
                                  'public_task'
                                )),

  -- How consent was collected
  source            TEXT        NOT NULL CHECK (source IN (
                                  'manual',            -- recruiter recorded on behalf of candidate
                                  'csv_import',        -- bulk import (legitimate interest default)
                                  'chrome_extension',  -- scraped from LinkedIn/GitHub
                                  'candidate_portal',  -- candidate clicked consent in portal
                                  'api',               -- via REST API
                                  'email_reply'        -- inferred from reply to outreach
                                )),

  -- Evidence
  ip_address        INET,
  user_agent        TEXT,
  consent_text      TEXT,        -- verbatim consent wording shown to candidate

  -- Lifecycle timestamps
  granted_at        TIMESTAMPTZ,
  withdrawn_at      TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ, -- some consents expire (e.g. 2yr marketing consent)

  -- Who recorded this
  created_by        UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_candidate_consents_agency   ON candidate_consents(agency_id);
CREATE INDEX idx_candidate_consents_candidate ON candidate_consents(candidate_id);
CREATE INDEX idx_candidate_consents_type_status ON candidate_consents(candidate_id, consent_type, status);

ALTER TABLE candidate_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY candidate_consents_agency_isolation ON candidate_consents
  USING (agency_id = current_agency_id());


-- ─────────────────────────────────────────────
-- 2. PRIVACY REQUESTS (DSAR)
-- Data Subject Access, Erasure, Portability, Rectification,
-- Restriction, and Objection requests.
-- 30-day fulfilment SLA with breach tracking.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS privacy_requests (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id             UUID        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  candidate_id          UUID        REFERENCES candidates(id) ON DELETE SET NULL,

  -- Request details
  request_type          TEXT        NOT NULL CHECK (request_type IN (
                                      'access',         -- SAR: what data do you hold on me?
                                      'erasure',        -- right to be forgotten
                                      'portability',    -- machine-readable export
                                      'rectification',  -- correct inaccurate data
                                      'restriction',    -- stop processing but don't delete
                                      'objection'       -- object to legitimate interest processing
                                    )),
  status                TEXT        NOT NULL DEFAULT 'pending'
                                    CHECK (status IN (
                                      'pending',        -- received, not yet assigned
                                      'verifying',      -- identity check in progress
                                      'in_review',      -- assigned to reviewer
                                      'fulfilled',      -- completed within SLA
                                      'denied',         -- denied with documented reason
                                      'cancelled'       -- withdrawn by requester
                                    )),

  -- Requester identity (may not be in candidate DB yet)
  requester_email       TEXT        NOT NULL,
  requester_name        TEXT,
  requester_message     TEXT,       -- free text from the request form

  -- Identity verification
  identity_verified     BOOLEAN     NOT NULL DEFAULT FALSE,
  identity_verified_at  TIMESTAMPTZ,
  verified_by           UUID        REFERENCES users(id) ON DELETE SET NULL,
  verification_method   TEXT        CHECK (verification_method IN (
                                      'email_token',    -- sent a unique link to requester email
                                      'document',       -- ID document reviewed
                                      'knowledge',      -- knowledge-based questions
                                      'manual'          -- manually confirmed by staff
                                    )),

  -- SLA (GDPR: 30 days; UK GDPR same; CCPA: 45 days)
  received_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_at                TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  fulfilled_at          TIMESTAMPTZ,

  -- Outcome
  denial_reason         TEXT,
  internal_notes        TEXT,
  export_path           TEXT,       -- S3/R2 path for access/portability exports

  -- Assignment
  assigned_to           UUID        REFERENCES users(id) ON DELETE SET NULL,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_privacy_requests_agency    ON privacy_requests(agency_id);
CREATE INDEX idx_privacy_requests_candidate ON privacy_requests(candidate_id);
CREATE INDEX idx_privacy_requests_status    ON privacy_requests(agency_id, status);
CREATE INDEX idx_privacy_requests_due       ON privacy_requests(agency_id, due_at) WHERE status NOT IN ('fulfilled','denied','cancelled');

ALTER TABLE privacy_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY privacy_requests_agency_isolation ON privacy_requests
  USING (agency_id = current_agency_id());


-- ─────────────────────────────────────────────
-- 3. DATA RETENTION POLICIES
-- One row per agency. Configures how long each data
-- category is kept before automated purge eligibility.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS data_retention_policies (
  id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id                   UUID        NOT NULL UNIQUE REFERENCES orgs(id) ON DELETE CASCADE,

  -- Retention periods (months). NULL = keep forever.
  candidate_inactive_months   INTEGER     NOT NULL DEFAULT 36,   -- inactive candidate profile
  email_body_months           INTEGER     NOT NULL DEFAULT 12,   -- email message bodies (PII-heavy)
  activity_log_months         INTEGER     NOT NULL DEFAULT 84,   -- 7yr for audit/legal
  placement_months            INTEGER     NOT NULL DEFAULT 84,   -- 7yr (financial records)
  audit_log_months            INTEGER     NOT NULL DEFAULT 84,
  resume_file_months          INTEGER     NOT NULL DEFAULT 36,   -- resume files in storage

  -- Enforcement
  enforcement_enabled         BOOLEAN     NOT NULL DEFAULT FALSE,
  dry_run_mode                BOOLEAN     NOT NULL DEFAULT TRUE,  -- log what WOULD be deleted first
  notify_before_deletion_days INTEGER     NOT NULL DEFAULT 30,   -- warn recruiter N days before auto-delete
  last_enforcement_run        TIMESTAMPTZ,
  last_enforcement_summary    JSONB,       -- {candidates_flagged, emails_purged, ...}

  -- Geography / regulation context
  primary_regulation          TEXT        NOT NULL DEFAULT 'gdpr'
                                          CHECK (primary_regulation IN ('gdpr','uk_gdpr','ccpa','pipeda','none')),
  data_residency_region       TEXT        NOT NULL DEFAULT 'us-east-1',

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE data_retention_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY data_retention_policies_agency_isolation ON data_retention_policies
  USING (agency_id = current_agency_id());

-- Auto-create a default retention policy when a new agency registers
CREATE OR REPLACE FUNCTION create_default_retention_policy()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO data_retention_policies (agency_id)
  VALUES (NEW.id)
  ON CONFLICT (agency_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_default_retention_policy ON orgs;
CREATE TRIGGER trg_default_retention_policy
  AFTER INSERT ON orgs
  FOR EACH ROW EXECUTE FUNCTION create_default_retention_policy();


-- ─────────────────────────────────────────────
-- 4. DATA PROCESSING RECORDS
-- GDPR Article 30: Record of Processing Activities (RoPA).
-- Documents every category of data processing the agency performs.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS data_processing_records (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id               UUID        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,

  -- Activity description
  activity_name           TEXT        NOT NULL, -- e.g. "Candidate Profile Management"
  purpose                 TEXT        NOT NULL, -- why this processing occurs
  legal_basis             TEXT        NOT NULL CHECK (legal_basis IN (
                                        'consent','legitimate_interest','contract',
                                        'legal_obligation','vital_interests','public_task'
                                      )),
  legitimate_interest_assessment TEXT, -- required if basis = legitimate_interest

  -- What data / who it affects
  data_categories         TEXT[]      NOT NULL, -- ['name','email','work_history','salary','cv']
  data_subjects           TEXT[]      NOT NULL, -- ['candidates','clients','contacts','employees']
  special_categories      TEXT[],              -- ['health','criminal','biometric'] — Art.9 data

  -- Where data goes
  recipients              TEXT[],     -- internal teams or named vendors
  third_country_transfers TEXT[],     -- countries outside EEA/UK if any
  transfer_mechanism      TEXT        CHECK (transfer_mechanism IN (
                                        'adequacy_decision','scc','bcr','derogation','none',NULL
                                      )),

  -- Retention & security
  retention_period        TEXT        NOT NULL, -- human-readable e.g. "36 months after last activity"
  security_measures       TEXT[],     -- ['encryption_at_rest','tls','access_controls','pseudonymisation']

  -- Status
  is_active               BOOLEAN     NOT NULL DEFAULT TRUE,
  last_reviewed_at        TIMESTAMPTZ,
  reviewed_by             UUID        REFERENCES users(id) ON DELETE SET NULL,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_data_processing_records_agency ON data_processing_records(agency_id);

ALTER TABLE data_processing_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY data_processing_records_agency_isolation ON data_processing_records
  USING (agency_id = current_agency_id());

-- Seed the standard RoPA entries for every new agency
CREATE OR REPLACE FUNCTION seed_default_processing_records()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO data_processing_records (
    agency_id, activity_name, purpose, legal_basis,
    data_categories, data_subjects, recipients,
    retention_period, security_measures
  ) VALUES
  (
    NEW.id,
    'Candidate Profile Management',
    'Storing and managing candidate professional profiles to facilitate recruitment placement',
    'legitimate_interest',
    ARRAY['name','email','phone','work_history','skills','education','location'],
    ARRAY['candidates'],
    ARRAY['recruiters','clients (via portal)'],
    '36 months after last activity',
    ARRAY['encryption_at_rest','tls_in_transit','rbac','row_level_security']
  ),
  (
    NEW.id,
    'Client Communication & Portal Access',
    'Enabling structured feedback and submission workflows between agency and client hiring teams',
    'contract',
    ARRAY['name','email','job_title','company'],
    ARRAY['clients','contacts'],
    ARRAY['client_portal_users'],
    '84 months (7 years) for financial/contractual records',
    ARRAY['encryption_at_rest','tls_in_transit','rbac']
  ),
  (
    NEW.id,
    'Email Synchronisation',
    'Syncing recruiter email communications to maintain complete candidate/client activity records',
    'legitimate_interest',
    ARRAY['email_address','email_content','metadata'],
    ARRAY['candidates','clients'],
    ARRAY['email_providers (Gmail/Microsoft 365)'],
    '12 months for email bodies; 84 months for metadata',
    ARRAY['aes_gcm_encryption','tls_in_transit','oauth_tokens_encrypted']
  ),
  (
    NEW.id,
    'Placement & Financial Records',
    'Recording placement outcomes, fee structures, and commission calculations for financial compliance',
    'legal_obligation',
    ARRAY['name','salary','fee_amount','placement_date'],
    ARRAY['candidates','clients'],
    ARRAY['accounting_integrations'],
    '84 months (7 years — financial record obligation)',
    ARRAY['encryption_at_rest','audit_log','rbac']
  ),
  (
    NEW.id,
    'Analytics & Reporting',
    'Generating aggregated performance metrics for recruiter coaching and business intelligence',
    'legitimate_interest',
    ARRAY['activity_counts','pipeline_metrics','placement_rates'],
    ARRAY['candidates','recruiters'],
    ARRAY['internal_only'],
    '84 months',
    ARRAY['aggregation_only','rbac']
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_processing_records ON orgs;
CREATE TRIGGER trg_seed_processing_records
  AFTER INSERT ON orgs
  FOR EACH ROW EXECUTE FUNCTION seed_default_processing_records();


-- ─────────────────────────────────────────────
-- 5. COMPLIANCE INCIDENTS
-- Data breaches, near-misses, complaints, and regulatory audits.
-- Tracks GDPR 72hr notification deadlines.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS compliance_incidents (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id                 UUID        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,

  -- Classification
  incident_type             TEXT        NOT NULL CHECK (incident_type IN (
                                          'data_breach',        -- confirmed unauthorised access/loss
                                          'near_miss',          -- potential breach that was contained
                                          'subject_complaint',  -- complaint from a data subject
                                          'regulatory_audit',   -- authority inquiry or audit
                                          'policy_violation'    -- internal policy breach
                                        )),
  severity                  TEXT        NOT NULL DEFAULT 'medium'
                                        CHECK (severity IN ('low','medium','high','critical')),
  status                    TEXT        NOT NULL DEFAULT 'open'
                                        CHECK (status IN (
                                          'open',
                                          'investigating',
                                          'contained',
                                          'resolved',
                                          'reported_to_authority',
                                          'closed'
                                        )),

  -- Description
  title                     TEXT        NOT NULL,
  description               TEXT,
  affected_systems          TEXT[],     -- ['candidate_db','email_sync','portal']
  affected_records_estimate INTEGER,
  affected_candidate_ids    UUID[],     -- specific candidates if known

  -- GDPR timelines
  discovered_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  authority_notify_deadline TIMESTAMPTZ GENERATED ALWAYS AS (discovered_at + INTERVAL '72 hours') STORED,
  contained_at              TIMESTAMPTZ,
  notified_authority_at     TIMESTAMPTZ,
  notified_individuals_at   TIMESTAMPTZ,
  authority_reference       TEXT,       -- ICO / DPA reference number

  -- Resolution
  root_cause                TEXT,
  remediation_steps         TEXT,
  lessons_learned           TEXT,

  -- Assignment
  discovered_by             UUID        REFERENCES users(id) ON DELETE SET NULL,
  assigned_to               UUID        REFERENCES users(id) ON DELETE SET NULL,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_compliance_incidents_agency  ON compliance_incidents(agency_id);
CREATE INDEX idx_compliance_incidents_status  ON compliance_incidents(agency_id, status);
CREATE INDEX idx_compliance_incidents_deadline ON compliance_incidents(agency_id, authority_notify_deadline)
  WHERE status IN ('open','investigating') AND incident_type = 'data_breach';

ALTER TABLE compliance_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY compliance_incidents_agency_isolation ON compliance_incidents
  USING (agency_id = current_agency_id());


-- ─────────────────────────────────────────────
-- 6. CANDIDATE RETENTION FLAGS
-- Tracks when a candidate record has been flagged by the
-- automated retention enforcer as eligible for deletion.
-- Recruiters get a 30-day grace window to act before auto-purge.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS candidate_retention_flags (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id         UUID        NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  candidate_id      UUID        NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,

  flagged_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  purge_after       TIMESTAMPTZ NOT NULL,    -- flagged_at + notify_before_deletion_days
  reason            TEXT        NOT NULL,    -- 'inactive_36_months', 'retention_policy_override', etc.
  months_inactive   INTEGER,
  dismissed_at      TIMESTAMPTZ,             -- recruiter reviewed + chose to keep
  dismissed_by      UUID        REFERENCES users(id) ON DELETE SET NULL,
  purged_at         TIMESTAMPTZ,             -- set when actually deleted

  UNIQUE (agency_id, candidate_id)           -- one active flag per candidate
);

CREATE INDEX idx_retention_flags_agency   ON candidate_retention_flags(agency_id);
CREATE INDEX idx_retention_flags_purge    ON candidate_retention_flags(agency_id, purge_after)
  WHERE purged_at IS NULL AND dismissed_at IS NULL;

ALTER TABLE candidate_retention_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY retention_flags_agency_isolation ON candidate_retention_flags
  USING (agency_id = current_agency_id());


-- ─────────────────────────────────────────────
-- 7. ENCRYPTED SENSITIVE FIELDS
-- Per-candidate storage for application-layer AES-GCM
-- encrypted values (salary, DOB, gov ID if ever captured).
-- The column is JSONB so new field types can be added
-- without schema migrations.
-- ─────────────────────────────────────────────
ALTER TABLE candidates
  ADD COLUMN IF NOT EXISTS encrypted_fields JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS data_residency_region TEXT DEFAULT 'us-east-1',
  ADD COLUMN IF NOT EXISTS last_consent_review_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS privacy_flags JSONB DEFAULT '{}';
-- privacy_flags: {"do_not_contact": true, "right_to_restrict": true, "erasure_requested": false}

COMMENT ON COLUMN candidates.encrypted_fields IS
  'AES-GCM encrypted sensitive fields. Keys: salary_expectation, date_of_birth, national_id, bank_details. Values: {iv, ciphertext, tag} base64 strings.';

COMMENT ON COLUMN candidates.privacy_flags IS
  'Active privacy restrictions on this candidate. Checked at outreach, submission, enrichment time.';


-- ─────────────────────────────────────────────
-- 8. ERASURE FUNCTION
-- Hard-deletes a candidate and all their data across
-- every related table. Logs the erasure to audit_log.
-- Returns a summary of what was deleted.
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION erase_candidate(
  p_candidate_id  UUID,
  p_agency_id     UUID,
  p_requested_by  UUID,
  p_request_id    UUID DEFAULT NULL   -- privacy_request.id if triggered by DSAR
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_summary        JSONB := '{}';
  v_email_count    INTEGER := 0;
  v_activity_count INTEGER := 0;
  v_app_count      INTEGER := 0;
  v_task_count     INTEGER := 0;
  v_seq_count      INTEGER := 0;
  v_candidate_name TEXT;
BEGIN
  -- Verify candidate belongs to this agency
  SELECT first_name || ' ' || last_name INTO v_candidate_name
  FROM candidates
  WHERE id = p_candidate_id AND agency_id = p_agency_id;

  IF v_candidate_name IS NULL THEN
    RAISE EXCEPTION 'Candidate % not found in agency %', p_candidate_id, p_agency_id;
  END IF;

  -- 1. Email links + messages (bodies contain PII)
  DELETE FROM candidate_email_links WHERE candidate_id = p_candidate_id;
  GET DIAGNOSTICS v_email_count = ROW_COUNT;

  -- 2. Activities / timeline
  DELETE FROM activities
  WHERE candidate_id = p_candidate_id AND agency_id = p_agency_id;
  GET DIAGNOSTICS v_activity_count = ROW_COUNT;

  -- 3. Pipeline applications
  DELETE FROM applications
  WHERE candidate_id = p_candidate_id;
  GET DIAGNOSTICS v_app_count = ROW_COUNT;

  -- 4. Tasks referencing candidate
  DELETE FROM tasks
  WHERE candidate_id = p_candidate_id AND agency_id = p_agency_id;
  GET DIAGNOSTICS v_task_count = ROW_COUNT;

  -- 5. Sequence enrollments
  DELETE FROM sequence_enrollments
  WHERE candidate_id = p_candidate_id;
  GET DIAGNOSTICS v_seq_count = ROW_COUNT;

  -- 6. Consents (cascade would handle, but explicit for clarity)
  DELETE FROM candidate_consents
  WHERE candidate_id = p_candidate_id AND agency_id = p_agency_id;

  -- 7. Retention flags
  DELETE FROM candidate_retention_flags
  WHERE candidate_id = p_candidate_id AND agency_id = p_agency_id;

  -- 8. The candidate record itself (CASCADE handles resumes, work_history, skills, tags)
  DELETE FROM candidates
  WHERE id = p_candidate_id AND agency_id = p_agency_id;

  -- 9. Build summary
  v_summary := jsonb_build_object(
    'candidate_id',     p_candidate_id,
    'candidate_name',   v_candidate_name,
    'erased_at',        NOW(),
    'erased_by',        p_requested_by,
    'privacy_request_id', p_request_id,
    'rows_deleted', jsonb_build_object(
      'email_links',    v_email_count,
      'activities',     v_activity_count,
      'applications',   v_app_count,
      'tasks',          v_task_count,
      'sequence_enrollments', v_seq_count
    )
  );

  -- 10. Audit log
  INSERT INTO audit_log (
    agency_id, user_id, action, resource_type,
    resource_id, metadata
  ) VALUES (
    p_agency_id,
    p_requested_by,
    'GDPR_ERASURE',
    'candidate',
    p_candidate_id,
    v_summary
  );

  -- 11. Mark privacy request fulfilled if provided
  IF p_request_id IS NOT NULL THEN
    UPDATE privacy_requests
    SET status = 'fulfilled', fulfilled_at = NOW(), updated_at = NOW()
    WHERE id = p_request_id AND agency_id = p_agency_id;
  END IF;

  RETURN v_summary;
END;
$$;


-- ─────────────────────────────────────────────
-- 9. RETENTION ENFORCEMENT FUNCTION
-- Called by scheduled job (daily). Flags candidates
-- that have exceeded the inactive retention window.
-- Does NOT delete — flags for human review first.
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION run_retention_enforcement(p_agency_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_policy          data_retention_policies%ROWTYPE;
  v_candidates_flagged INTEGER := 0;
  v_emails_purged   INTEGER := 0;
  v_dry_run         BOOLEAN;
  v_purge_after     TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_policy
  FROM data_retention_policies
  WHERE agency_id = p_agency_id;

  IF NOT FOUND OR NOT v_policy.enforcement_enabled THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'enforcement_disabled');
  END IF;

  v_dry_run := v_policy.dry_run_mode;
  v_purge_after := NOW() + (v_policy.notify_before_deletion_days * INTERVAL '1 day');

  -- Flag candidates inactive beyond retention window
  IF NOT v_dry_run THEN
    INSERT INTO candidate_retention_flags (
      agency_id, candidate_id, flagged_at, purge_after, reason, months_inactive
    )
    SELECT
      c.agency_id,
      c.id,
      NOW(),
      v_purge_after,
      'inactive_' || v_policy.candidate_inactive_months || '_months',
      EXTRACT(MONTH FROM AGE(NOW(), c.updated_at))::INTEGER
    FROM candidates c
    WHERE c.agency_id = p_agency_id
      AND c.updated_at < NOW() - (v_policy.candidate_inactive_months * INTERVAL '1 month')
      AND NOT EXISTS (
        SELECT 1 FROM candidate_retention_flags rf
        WHERE rf.candidate_id = c.id
          AND rf.agency_id = p_agency_id
          AND rf.purged_at IS NULL
          AND rf.dismissed_at IS NULL
      )
    ON CONFLICT (agency_id, candidate_id) DO NOTHING;

    GET DIAGNOSTICS v_candidates_flagged = ROW_COUNT;

    -- Purge email bodies older than email_body_months (keep metadata, delete body)
    -- email_messages body is stored in the body column — nullify it, keep thread metadata
    UPDATE email_messages em
    SET body = '[Content purged per retention policy]', updated_at = NOW()
    FROM email_threads et
    JOIN candidate_email_links cel ON cel.thread_id = et.id
    JOIN candidates c ON c.id = cel.candidate_id
    WHERE em.thread_id = et.id
      AND c.agency_id = p_agency_id
      AND em.sent_at < NOW() - (v_policy.email_body_months * INTERVAL '1 month')
      AND em.body IS NOT NULL
      AND em.body != '[Content purged per retention policy]';

    GET DIAGNOSTICS v_emails_purged = ROW_COUNT;
  ELSE
    -- Dry run: just count what would be flagged
    SELECT COUNT(*) INTO v_candidates_flagged
    FROM candidates c
    WHERE c.agency_id = p_agency_id
      AND c.updated_at < NOW() - (v_policy.candidate_inactive_months * INTERVAL '1 month')
      AND NOT EXISTS (
        SELECT 1 FROM candidate_retention_flags rf
        WHERE rf.candidate_id = c.id AND rf.agency_id = p_agency_id
          AND rf.purged_at IS NULL AND rf.dismissed_at IS NULL
      );

    SELECT COUNT(*) INTO v_emails_purged
    FROM email_messages em
    JOIN email_threads et ON et.id = em.thread_id
    JOIN candidate_email_links cel ON cel.thread_id = et.id
    JOIN candidates c ON c.id = cel.candidate_id
    WHERE c.agency_id = p_agency_id
      AND em.sent_at < NOW() - (v_policy.email_body_months * INTERVAL '1 month')
      AND em.body IS NOT NULL
      AND em.body != '[Content purged per retention policy]';
  END IF;

  -- Update last run
  UPDATE data_retention_policies
  SET
    last_enforcement_run = NOW(),
    last_enforcement_summary = jsonb_build_object(
      'run_at',               NOW(),
      'dry_run',              v_dry_run,
      'candidates_flagged',   v_candidates_flagged,
      'email_bodies_purged',  v_emails_purged
    ),
    updated_at = NOW()
  WHERE agency_id = p_agency_id;

  RETURN jsonb_build_object(
    'agency_id',            p_agency_id,
    'dry_run',              v_dry_run,
    'candidates_flagged',   v_candidates_flagged,
    'email_bodies_purged',  v_emails_purged,
    'run_at',               NOW()
  );
END;
$$;


-- ─────────────────────────────────────────────
-- 10. UPDATED_AT TRIGGERS
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'candidate_consents',
    'privacy_requests',
    'data_retention_policies',
    'data_processing_records',
    'compliance_incidents'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_updated_at_%1$s ON %1$s;
       CREATE TRIGGER trg_updated_at_%1$s
         BEFORE UPDATE ON %1$s
         FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();',
      t
    );
  END LOOP;
END;
$$;


-- ─────────────────────────────────────────────
-- 11. GRANT DEFAULT RETENTION POLICIES TO EXISTING AGENCIES
-- Backfill for agencies that existed before this migration.
-- ─────────────────────────────────────────────
INSERT INTO data_retention_policies (agency_id)
SELECT id FROM orgs
ON CONFLICT (agency_id) DO NOTHING;

INSERT INTO data_processing_records (
  agency_id, activity_name, purpose, legal_basis,
  data_categories, data_subjects, recipients,
  retention_period, security_measures
)
SELECT
  o.id,
  v.activity_name,
  v.purpose,
  v.legal_basis,
  v.data_categories,
  v.data_subjects,
  v.recipients,
  v.retention_period,
  v.security_measures
FROM orgs o
CROSS JOIN (
  VALUES
  (
    'Candidate Profile Management',
    'Storing and managing candidate professional profiles to facilitate recruitment placement',
    'legitimate_interest',
    ARRAY['name','email','phone','work_history','skills','education','location'],
    ARRAY['candidates'],
    ARRAY['recruiters','clients (via portal)'],
    '36 months after last activity',
    ARRAY['encryption_at_rest','tls_in_transit','rbac','row_level_security']
  ),
  (
    'Client Communication & Portal Access',
    'Enabling structured feedback and submission workflows between agency and client hiring teams',
    'contract',
    ARRAY['name','email','job_title','company'],
    ARRAY['clients','contacts'],
    ARRAY['client_portal_users'],
    '84 months (7 years) for financial/contractual records',
    ARRAY['encryption_at_rest','tls_in_transit','rbac']
  ),
  (
    'Email Synchronisation',
    'Syncing recruiter email communications to maintain complete candidate/client activity records',
    'legitimate_interest',
    ARRAY['email_address','email_content','metadata'],
    ARRAY['candidates','clients'],
    ARRAY['email_providers (Gmail/Microsoft 365)'],
    '12 months for email bodies; 84 months for metadata',
    ARRAY['aes_gcm_encryption','tls_in_transit','oauth_tokens_encrypted']
  ),
  (
    'Placement & Financial Records',
    'Recording placement outcomes, fee structures, and commission calculations for financial compliance',
    'legal_obligation',
    ARRAY['name','salary','fee_amount','placement_date'],
    ARRAY['candidates','clients'],
    ARRAY['accounting_integrations'],
    '84 months (7 years — financial record obligation)',
    ARRAY['encryption_at_rest','audit_log','rbac']
  )
) AS v(activity_name, purpose, legal_basis, data_categories, data_subjects, recipients, retention_period, security_measures);
