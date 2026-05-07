-- US-027: Submission Readiness Checklist
-- Three-tier inheritance: agency default → client override → per-req override
-- "block_mode" = true means must be checked before submission; false = warn only

-- ── Core table ──────────────────────────────────────────────────────────────────

CREATE TABLE submission_checklist_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id     uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,

  -- Scope: exactly one of these should be non-null (or none = agency default)
  client_id     uuid REFERENCES clients(id)  ON DELETE CASCADE,
  job_id        uuid REFERENCES jobs(id)      ON DELETE CASCADE,

  label         text NOT NULL,
  description   text,
  category      text NOT NULL DEFAULT 'general'
                  CHECK (category IN ('general','sourcing','screening','compensation','documents','references','compliance')),
  required      boolean NOT NULL DEFAULT true,  -- block (true) vs warn-only (false)
  sort_order    integer NOT NULL DEFAULT 0,
  active        boolean NOT NULL DEFAULT true,

  created_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- Prevent duplicate labels within the same scope
  CONSTRAINT unique_item_per_scope UNIQUE (agency_id, client_id, job_id, label)
);

-- ── Default items seeded for a new agency ───────────────────────────────────────
-- (application code calls a function to seed defaults on agency creation)
-- Default items are rows with client_id IS NULL AND job_id IS NULL

-- ── Audit log ───────────────────────────────────────────────────────────────────
-- Records which checklist items were incomplete when a submission was made

CREATE TABLE submission_checklist_audit (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id           uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  job_id              uuid NOT NULL REFERENCES jobs(id)     ON DELETE CASCADE,
  candidate_id        uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  submitted_by        uuid REFERENCES auth.users(id),
  submitted_at        timestamptz NOT NULL DEFAULT now(),

  -- Snapshot of checklist state at submission time
  total_items         integer NOT NULL DEFAULT 0,
  completed_items     integer NOT NULL DEFAULT 0,
  incomplete_required jsonb NOT NULL DEFAULT '[]',  -- [{id, label}]
  incomplete_optional jsonb NOT NULL DEFAULT '[]'
);

-- ── Completion state ─────────────────────────────────────────────────────────────
-- Tracks which items have been checked for a specific candidate+job combo

CREATE TABLE submission_checklist_completions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id      uuid NOT NULL REFERENCES submission_checklist_items(id) ON DELETE CASCADE,
  job_id       uuid NOT NULL REFERENCES jobs(id)       ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  agency_id    uuid NOT NULL REFERENCES agencies(id)   ON DELETE CASCADE,
  completed_by uuid REFERENCES auth.users(id),
  completed_at timestamptz NOT NULL DEFAULT now(),
  notes        text,
  UNIQUE (item_id, job_id, candidate_id)
);

-- ── Indexes ──────────────────────────────────────────────────────────────────────

CREATE INDEX idx_checklist_items_agency   ON submission_checklist_items(agency_id);
CREATE INDEX idx_checklist_items_client   ON submission_checklist_items(agency_id, client_id) WHERE client_id IS NOT NULL;
CREATE INDEX idx_checklist_items_job      ON submission_checklist_items(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX idx_checklist_completions    ON submission_checklist_completions(job_id, candidate_id);
CREATE INDEX idx_checklist_audit_job      ON submission_checklist_audit(job_id, candidate_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────────

ALTER TABLE submission_checklist_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission_checklist_audit       ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission_checklist_completions ENABLE ROW LEVEL SECURITY;

-- Items: agency members can read; managers/admins can write
CREATE POLICY "checklist_items_read" ON submission_checklist_items
  FOR SELECT USING (
    agency_id IN (
      SELECT agency_id FROM agency_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "checklist_items_write" ON submission_checklist_items
  FOR ALL USING (
    agency_id IN (
      SELECT agency_id FROM agency_members
      WHERE user_id = auth.uid() AND role IN ('owner','admin','manager')
    )
  );

-- Completions: any agency member can manage
CREATE POLICY "checklist_completions_all" ON submission_checklist_completions
  FOR ALL USING (
    agency_id IN (
      SELECT agency_id FROM agency_members WHERE user_id = auth.uid()
    )
  );

-- Audit: read-only for agency members
CREATE POLICY "checklist_audit_read" ON submission_checklist_audit
  FOR SELECT USING (
    agency_id IN (
      SELECT agency_id FROM agency_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "checklist_audit_insert" ON submission_checklist_audit
  FOR INSERT WITH CHECK (
    agency_id IN (
      SELECT agency_id FROM agency_members WHERE user_id = auth.uid()
    )
  );

-- ── Updated_at trigger ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION touch_checklist_item()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_checklist_item_updated
  BEFORE UPDATE ON submission_checklist_items
  FOR EACH ROW EXECUTE FUNCTION touch_checklist_item();

-- ── Seed function ─────────────────────────────────────────────────────────────────
-- Called from application when a new agency is created

CREATE OR REPLACE FUNCTION seed_default_checklist(p_agency_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO submission_checklist_items (agency_id, label, category, required, sort_order) VALUES
    (p_agency_id, 'Must-have skills verified',          'screening',     true,  10),
    (p_agency_id, 'Phone/video screen completed',       'screening',     true,  20),
    (p_agency_id, 'Salary expectations captured',       'compensation',  true,  30),
    (p_agency_id, 'Compensation approved by candidate', 'compensation',  true,  40),
    (p_agency_id, 'Resume reformatted / branded',       'documents',     false, 50),
    (p_agency_id, 'References secured (min 2)',         'references',    false, 60),
    (p_agency_id, 'LinkedIn profile reviewed',          'sourcing',      false, 70),
    (p_agency_id, 'Right-to-work / visa confirmed',     'compliance',    true,  80),
    (p_agency_id, 'Candidate notified of submission',   'compliance',    true,  90)
  ON CONFLICT DO NOTHING;
END;
$$;
