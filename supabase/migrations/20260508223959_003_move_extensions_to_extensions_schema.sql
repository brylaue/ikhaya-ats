/*
  # Move Extensions Out of Public Schema

  Moves pg_trgm, citext, and unaccent to the extensions schema.

  vector cannot be moved because the public.candidates.embedding column
  depends on the vector type — dropping it would require a destructive
  table rebuild. vector stays in public; its search_path exposure is
  already mitigated by SET search_path = public on the functions that use it.

  ## Changes
  - pg_trgm: drop dependent indexes → drop extension → recreate in extensions → recreate indexes
  - citext: no dependents, moved directly
  - unaccent: no dependents, moved directly
*/

-- ─── pg_trgm ──────────────────────────────────────────────────────────────────

DROP INDEX IF EXISTS public.companies_name_trgm_idx;
DROP INDEX IF EXISTS public.candidates_name_trgm_idx;

DROP EXTENSION pg_trgm;
CREATE EXTENSION pg_trgm WITH SCHEMA extensions;

-- Recreate indexes using schema-qualified operator class
CREATE INDEX companies_name_trgm_idx ON public.companies
  USING gin (name extensions.gin_trgm_ops);

CREATE INDEX candidates_name_trgm_idx ON public.candidates
  USING gin ((first_name || ' ' || last_name) extensions.gin_trgm_ops);

-- ─── citext ───────────────────────────────────────────────────────────────────

DROP EXTENSION citext;
CREATE EXTENSION citext WITH SCHEMA extensions;

-- ─── unaccent ─────────────────────────────────────────────────────────────────

DROP EXTENSION unaccent;
CREATE EXTENSION unaccent WITH SCHEMA extensions;
