-- Migration: 030_candidate_consent_erasure
-- US-344: Candidate consent capture & management
-- US-346: Cascading right-to-erasure (GDPR Art. 17)
-- US-345: DSAR workflow (data subject access requests)

-- ─── Consent types ────────────────────────────────────────────────────────────

CREATE TYPE consent_type AS ENUM (
  'data_processing',
  'marketing_email',
  'sms',
  'portal_sharing',
  'enrichment',
  'ai_processing',
  'third_party_ats'
);

CREATE TYPE consent_legal_basis AS ENUM (
  'consent',
  'legitimate_interests',
  'contract',
  'legal_obligation'
);

-- ─── candidate_consents ───────────────────────────────────────────────────────
-- One row per (candidate, consent_type) — replaces on new grant/withdraw.

CREATE TABLE candidate_consents (
  id                UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id      UUID               NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  agency_id         UUID               NOT NULL REFERENCES agencies(id)   ON DELETE CASCADE,
  consent_type      consent_type       NOT NULL,
  granted           BOOLEAN            NOT NULL,                         -- true=granted, false=withdrawn
  legal_basis       consent_legal_basis,
  evidence_text     TEXT,                                                -- optional: source of consent
  granted_by        UUID               REFERENCES users(id),             -- recruiter who recorded
  granted_at        TIMESTAMPTZ        NOT NULL DEFAULT now(),
  withdrawn_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ        NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ        NOT NULL DEFAULT now(),

  UNIQUE (candidate_id, consent_type)  -- one active record per type
);

CREATE INDEX candidate_consents_candidate_idx ON candidate_consents(candidate_id);
CREATE INDEX candidate_consents_agency_idx    ON candidate_consents(agency_id);

ALTER TABLE candidate_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY candidate_consents_agency ON candidate_consents
  USING (agency_id = current_agency_id());

CREATE TRIGGER trg_candidate_consents_updated_at
  BEFORE UPDATE ON candidate_consents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── DSAR (Data Subject Access Request) table ─────────────────────────────────

CREATE TYPE dsar_type AS ENUM (
  'access',          -- provide a copy of all data
  'rectification',   -- correct inaccurate data
  'erasure',         -- right to be forgotten
  'restriction',     -- restrict processing
  'portability',     -- export in machine-readable format
  'objection'        -- object to processing
);

CREATE TYPE dsar_status AS ENUM (
  'pending',
  'in_progress',
  'fulfilled',
  'denied',
  'withdrawn'
);

CREATE TYPE dsar_verification_method AS ENUM (
  'email_token',
  'document',
  'knowledge',
  'manual'
);

CREATE TABLE dsars (
  id                    UUID                      PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id             UUID                      NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  candidate_id          UUID                      REFERENCES candidates(id) ON DELETE SET NULL,
  request_type          dsar_type                 NOT NULL,
  status                dsar_status               NOT NULL DEFAULT 'pending',
  requester_name        TEXT                      NOT NULL,
  requester_email       TEXT                      NOT NULL,
  verification_method   dsar_verification_method,
  verified_at           TIMESTAMPTZ,
  sla_deadline          TIMESTAMPTZ               NOT NULL GENERATED ALWAYS AS
                          (created_at + INTERVAL '30 days') STORED,
  internal_notes        TEXT,
  denial_reason         TEXT,
  assigned_to           UUID                      REFERENCES users(id),
  fulfilled_at          TIMESTAMPTZ,
  fulfilled_by          UUID                      REFERENCES users(id),
  created_at            TIMESTAMPTZ               NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ               NOT NULL DEFAULT now()
);

CREATE INDEX dsars_agency_status_idx ON dsars(agency_id, status);
CREATE INDEX dsars_sla_deadline_idx  ON dsars(sla_deadline) WHERE status NOT IN ('fulfilled','denied','withdrawn');

ALTER TABLE dsars ENABLE ROW LEVEL SECURITY;

CREATE POLICY dsars_agency ON dsars
  USING (agency_id = current_agency_id());

CREATE TRIGGER trg_dsars_updated_at
  BEFORE UPDATE ON dsars
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── US-346: erase_candidate() stored procedure ───────────────────────────────
-- Hard-deletes all PII for a candidate. ON DELETE CASCADE handles most FKs;
-- this function explicitly cleans up the remaining tables and writes an
-- immutable GDPR_ERASURE row to audit_log.
--
-- Returns a JSON summary of what was deleted.

CREATE OR REPLACE FUNCTION erase_candidate(
  p_candidate_id  UUID,
  p_agency_id     UUID,
  p_erased_by     UUID   DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_email    TEXT;
  v_summary  JSONB;
BEGIN
  -- Verify the candidate belongs to this agency
  SELECT email INTO v_email
  FROM candidates
  WHERE id = p_candidate_id AND agency_id = p_agency_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate % not found in agency %', p_candidate_id, p_agency_id;
  END IF;

  -- ── Explicit deletions (tables without full CASCADE to candidates) ─────────
  DELETE FROM candidate_email_links  WHERE candidate_id = p_candidate_id;
  DELETE FROM activities             WHERE candidate_id = p_candidate_id;
  DELETE FROM candidate_consents     WHERE candidate_id = p_candidate_id;
  DELETE FROM dsars                  WHERE candidate_id = p_candidate_id;

  -- ON DELETE CASCADE handles: applications, tasks, sequence_enrollments,
  -- candidate_pipeline_entries, work_experiences, education_entries,
  -- candidate_tags, custom_field_values, saved_searches (if linked), etc.

  -- ── Delete the candidate row (triggers CASCADE) ───────────────────────────
  DELETE FROM candidates WHERE id = p_candidate_id AND agency_id = p_agency_id;

  -- ── Write immutable GDPR erasure audit record ─────────────────────────────
  INSERT INTO audit_log (
    agency_id,
    performed_by,
    action,
    resource_type,
    resource_id,
    detail
  ) VALUES (
    p_agency_id,
    p_erased_by,
    'GDPR_ERASURE',
    'candidate',
    p_candidate_id,
    jsonb_build_object(
      'erased_email_hash', encode(sha256(v_email::bytea), 'hex'),
      'erased_at', now(),
      'erased_by', p_erased_by
    )
  );

  -- Mark any open DSAR erasure requests as fulfilled
  UPDATE dsars
  SET status = 'fulfilled', fulfilled_at = now(), fulfilled_by = p_erased_by
  WHERE candidate_id = p_candidate_id
    AND request_type = 'erasure'
    AND status NOT IN ('fulfilled','denied','withdrawn');

  v_summary := jsonb_build_object(
    'candidate_id',   p_candidate_id,
    'erased_at',      now(),
    'erased_by',      p_erased_by
  );

  RETURN v_summary;
END;
$$;

COMMENT ON FUNCTION erase_candidate IS
  'US-346: Hard-deletes all PII for a candidate and writes an immutable '
  'GDPR_ERASURE audit record. Call only after obtaining irreversible confirmation.';
