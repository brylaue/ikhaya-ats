-- ── Migration 059: Skill Taxonomy & Auto-Tag (US-381) ────────────────────────
--
-- Canonical skill taxonomy — lets the app map "js", "JavaScript", "Java
-- Script", "ECMAScript" → the single canonical "JavaScript" row without
-- a Claude call on every save. Each agency can add its own overrides
-- (e.g. internal tooling names) without polluting the global taxonomy.
--
-- The normaliseSkills() TS helper (apps/web/lib/ai/skills.ts) looks up
-- local matches first, only falling back to Claude for unknown terms.
-- That cuts the per-candidate AI cost dramatically once the taxonomy
-- is warm.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS skill_taxonomy (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL agency_id = global row (shared across all tenants).
  -- Agency-scoped rows (agency_id set) override the global entry.
  agency_id      uuid REFERENCES agencies(id) ON DELETE CASCADE,
  canonical_name text NOT NULL,
  canonical_slug text GENERATED ALWAYS AS (lower(regexp_replace(canonical_name, '\s+', '_', 'g'))) STORED,
  aliases        text[] NOT NULL DEFAULT '{}',  -- all lower-cased
  category       text,                           -- "Languages" | "Frameworks" | "Cloud" | ...
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS skill_taxonomy_agency_slug_uniq
  ON skill_taxonomy (COALESCE(agency_id, '00000000-0000-0000-0000-000000000000'::uuid), canonical_slug);

-- Fast alias lookup: index each alias entry
CREATE INDEX IF NOT EXISTS skill_taxonomy_aliases_gin
  ON skill_taxonomy USING GIN (aliases);

CREATE INDEX IF NOT EXISTS skill_taxonomy_agency_idx
  ON skill_taxonomy (agency_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
--
-- Global rows (agency_id IS NULL) are readable by everyone. Agency-scoped
-- rows are readable only by their own agency. Writes are restricted:
-- INSERT/UPDATE of agency-scoped rows require matching agency; global rows
-- can only be maintained by the service role (seeds).

ALTER TABLE skill_taxonomy ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'skill_taxonomy' AND policyname = 'skill_taxonomy_read'
  ) THEN
    CREATE POLICY skill_taxonomy_read ON skill_taxonomy
      FOR SELECT
      USING (agency_id IS NULL OR agency_id = current_agency_id());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'skill_taxonomy' AND policyname = 'skill_taxonomy_write_agency'
  ) THEN
    CREATE POLICY skill_taxonomy_write_agency ON skill_taxonomy
      FOR INSERT
      WITH CHECK (agency_id IS NOT NULL AND agency_id = current_agency_id());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'skill_taxonomy' AND policyname = 'skill_taxonomy_update_agency'
  ) THEN
    CREATE POLICY skill_taxonomy_update_agency ON skill_taxonomy
      FOR UPDATE
      USING (agency_id = current_agency_id())
      WITH CHECK (agency_id = current_agency_id());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'skill_taxonomy' AND policyname = 'skill_taxonomy_delete_agency'
  ) THEN
    CREATE POLICY skill_taxonomy_delete_agency ON skill_taxonomy
      FOR DELETE
      USING (agency_id = current_agency_id());
  END IF;
END $$;

-- ── Helpers ─────────────────────────────────────────────────────────────────
--
-- Normalise a raw skill to the canonical name by looking it up in the
-- taxonomy. Returns the input unchanged if no mapping is found.
-- Respects agency override: if an agency row maps "gcp" → "Google Cloud
-- Platform" it wins over a global row mapping "gcp" → "GCP".

CREATE OR REPLACE FUNCTION normalise_skill_name(
  p_agency_id uuid,
  p_raw       text
) RETURNS text
LANGUAGE sql STABLE
AS $$
  WITH agency_hit AS (
    SELECT canonical_name
    FROM   skill_taxonomy
    WHERE  agency_id = p_agency_id
      AND  (lower(canonical_name) = lower(p_raw) OR lower(p_raw) = ANY(aliases))
    LIMIT  1
  ),
  global_hit AS (
    SELECT canonical_name
    FROM   skill_taxonomy
    WHERE  agency_id IS NULL
      AND  (lower(canonical_name) = lower(p_raw) OR lower(p_raw) = ANY(aliases))
    LIMIT  1
  )
  SELECT COALESCE(
    (SELECT canonical_name FROM agency_hit),
    (SELECT canonical_name FROM global_hit),
    p_raw
  );
$$;

COMMENT ON FUNCTION normalise_skill_name IS
  'US-381: canonical skill lookup with agency-override precedence. Safe to inline from app queries.';

-- ── Seed: global taxonomy of common technical skills ─────────────────────────
--
-- Kept deliberately small — expand via admin UI or seeded migrations.
-- All aliases are lowercase; the lookup normalises the input too.

INSERT INTO skill_taxonomy (agency_id, canonical_name, category, aliases) VALUES
  (NULL, 'JavaScript',      'Languages', ARRAY['js', 'javascript', 'ecmascript', 'java script']),
  (NULL, 'TypeScript',      'Languages', ARRAY['ts', 'typescript']),
  (NULL, 'Python',          'Languages', ARRAY['py', 'python', 'python3']),
  (NULL, 'Go',              'Languages', ARRAY['golang']),
  (NULL, 'Rust',            'Languages', ARRAY['rustlang']),
  (NULL, 'Java',            'Languages', ARRAY['java']),
  (NULL, 'C#',              'Languages', ARRAY['csharp', 'c sharp', 'c-sharp', '.net', 'dotnet']),
  (NULL, 'C++',             'Languages', ARRAY['cpp', 'c plus plus', 'cplusplus']),
  (NULL, 'Ruby',            'Languages', ARRAY['ruby', 'rb']),
  (NULL, 'PHP',             'Languages', ARRAY['php']),
  (NULL, 'Swift',           'Languages', ARRAY['swift']),
  (NULL, 'Kotlin',          'Languages', ARRAY['kotlin']),

  (NULL, 'React',           'Frameworks', ARRAY['react', 'reactjs', 'react.js']),
  (NULL, 'Next.js',         'Frameworks', ARRAY['next', 'nextjs', 'next.js']),
  (NULL, 'Vue',             'Frameworks', ARRAY['vue', 'vuejs', 'vue.js']),
  (NULL, 'Angular',         'Frameworks', ARRAY['angular', 'angularjs']),
  (NULL, 'Svelte',          'Frameworks', ARRAY['svelte', 'sveltekit']),
  (NULL, 'Node.js',         'Frameworks', ARRAY['node', 'nodejs', 'node.js']),
  (NULL, 'Django',          'Frameworks', ARRAY['django']),
  (NULL, 'FastAPI',         'Frameworks', ARRAY['fastapi']),
  (NULL, 'Flask',           'Frameworks', ARRAY['flask']),
  (NULL, 'Ruby on Rails',   'Frameworks', ARRAY['rails', 'ror']),
  (NULL, 'Spring Boot',     'Frameworks', ARRAY['spring', 'springboot', 'spring boot']),
  (NULL, 'Express',         'Frameworks', ARRAY['express', 'expressjs']),

  (NULL, 'AWS',             'Cloud & Infra', ARRAY['amazon web services', 'aws']),
  (NULL, 'Google Cloud Platform', 'Cloud & Infra', ARRAY['gcp', 'google cloud']),
  (NULL, 'Microsoft Azure', 'Cloud & Infra', ARRAY['azure']),
  (NULL, 'Kubernetes',      'Cloud & Infra', ARRAY['k8s', 'kube']),
  (NULL, 'Docker',          'Cloud & Infra', ARRAY['docker']),
  (NULL, 'Terraform',       'Cloud & Infra', ARRAY['terraform', 'tf']),

  (NULL, 'PostgreSQL',      'Data',      ARRAY['postgres', 'pg', 'postgresql']),
  (NULL, 'MySQL',           'Data',      ARRAY['mysql']),
  (NULL, 'MongoDB',         'Data',      ARRAY['mongo', 'mongodb']),
  (NULL, 'Redis',           'Data',      ARRAY['redis']),
  (NULL, 'Elasticsearch',   'Data',      ARRAY['elastic', 'elasticsearch', 'es']),

  (NULL, 'Machine Learning', 'Data & AI', ARRAY['ml', 'machine learning']),
  (NULL, 'Deep Learning',   'Data & AI', ARRAY['dl', 'deep learning']),
  (NULL, 'Natural Language Processing', 'Data & AI', ARRAY['nlp']),
  (NULL, 'TensorFlow',      'Data & AI', ARRAY['tf', 'tensorflow']),
  (NULL, 'PyTorch',         'Data & AI', ARRAY['pytorch', 'torch']),
  (NULL, 'LangChain',       'Data & AI', ARRAY['langchain']),

  (NULL, 'GraphQL',         'APIs',      ARRAY['graphql', 'gql']),
  (NULL, 'REST API',        'APIs',      ARRAY['rest', 'restful', 'rest api']),
  (NULL, 'gRPC',            'APIs',      ARRAY['grpc']),

  (NULL, 'Git',             'Tools',     ARRAY['git']),
  (NULL, 'Figma',           'Tools',     ARRAY['figma']),
  (NULL, 'Jira',             'Tools',     ARRAY['jira']),

  (NULL, 'Agile',           'Methodologies', ARRAY['agile', 'scrum']),
  (NULL, 'DevOps',          'Methodologies', ARRAY['devops'])
ON CONFLICT DO NOTHING;
