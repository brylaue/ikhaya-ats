/*
  # Security Hardening

  Fixes all security advisor warnings:

  1. Mutable search_path — all 6 functions recreated with explicit SET search_path.
     Functions that use extension operators (vector <=> for pgvector, trgm ops)
     use SET search_path = public (their operators live in public schema).
     Pure SQL/plpgsql utility functions use SET search_path = '' with explicit
     schema qualification.

  2. SECURITY DEFINER functions exposed via RPC — REVOKE EXECUTE on
     current_agency_id and handle_new_auth_user from PUBLIC, anon, authenticated.
     These are only called internally by RLS policies and the auth trigger.
*/

-- ─── update_updated_at — no extension deps, use empty search_path ─────────────

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ─── current_agency_id — no extension deps ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.current_agency_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT agency_id FROM public.users WHERE id = auth.uid();
$$;

-- ─── handle_new_auth_user — no extension deps ────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_agency_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM public.users WHERE email = NEW.email) THEN
    UPDATE public.users SET id = NEW.id WHERE email = NEW.email AND id != NEW.id;
    RETURN NEW;
  END IF;

  INSERT INTO public.agencies (name, slug)
  VALUES (
    coalesce(NEW.raw_user_meta_data->>'agency_name', split_part(NEW.email, '@', 2)),
    regexp_replace(
      lower(coalesce(NEW.raw_user_meta_data->>'agency_name', split_part(NEW.email, '@', 2))),
      '[^a-z0-9]+', '-', 'g'
    ) || '-' || substr(replace(NEW.id::text, '-', ''), 1, 6)
  )
  RETURNING id INTO v_agency_id;

  INSERT INTO public.users (id, agency_id, email, full_name, role)
  VALUES (
    NEW.id, v_agency_id, NEW.email,
    coalesce(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    'owner'
  );

  RETURN NEW;
END;
$$;

-- ─── match_candidates — uses vector <=> operator (lives in public) ────────────
-- SET search_path = public so the vector operator is found without mutable path.

CREATE OR REPLACE FUNCTION public.match_candidates(
  query_embedding  vector(1536),
  p_agency_id      UUID,
  match_threshold  FLOAT   DEFAULT 0.5,
  match_count      INTEGER DEFAULT 10
)
RETURNS TABLE (
  id               UUID, first_name TEXT, last_name TEXT, email TEXT,
  current_title TEXT, current_company TEXT, location TEXT,
  status TEXT, skills TEXT[], years_experience NUMERIC, similarity FLOAT
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT c.id, c.first_name, c.last_name, c.email, c.current_title,
         c.current_company, c.location, c.status, c.skills, c.years_experience,
         1 - (c.embedding <=> query_embedding) AS similarity
  FROM candidates c
  WHERE c.agency_id = p_agency_id
    AND c.embedding IS NOT NULL
    AND 1 - (c.embedding <=> query_embedding) > match_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ─── search_candidates — uses trgm ILIKE, full-text; SET search_path = public ─

CREATE OR REPLACE FUNCTION public.search_candidates(
  p_agency_id UUID, p_query TEXT,
  p_status TEXT DEFAULT NULL, p_skills TEXT[] DEFAULT NULL,
  p_limit INTEGER DEFAULT 50, p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID, first_name TEXT, last_name TEXT, email TEXT,
  current_title TEXT, current_company TEXT, location TEXT,
  status TEXT, skills TEXT[], years_experience NUMERIC, rank FLOAT
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT c.id, c.first_name, c.last_name, c.email, c.current_title,
         c.current_company, c.location, c.status, c.skills, c.years_experience,
         CASE WHEN p_query = '' THEN 1.0
              ELSE ts_rank(
                to_tsvector('english',
                  coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'') || ' ' ||
                  coalesce(c.current_title,'') || ' ' || coalesce(c.current_company,'') || ' ' ||
                  coalesce(c.resume_text,'')),
                plainto_tsquery('english', p_query)
              )
         END::FLOAT AS rank
  FROM candidates c
  WHERE c.agency_id = p_agency_id
    AND (p_status IS NULL OR c.status = p_status)
    AND (p_skills IS NULL OR c.skills && p_skills)
    AND (p_query = ''
         OR to_tsvector('english',
              coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'') || ' ' ||
              coalesce(c.current_title,'') || ' ' || coalesce(c.current_company,'') || ' ' ||
              coalesce(c.resume_text,''))
            @@ plainto_tsquery('english', p_query)
         OR (c.first_name || ' ' || c.last_name) ILIKE '%' || p_query || '%')
  ORDER BY rank DESC
  LIMIT p_limit OFFSET p_offset;
$$;

-- ─── job_funnel_stats — no extension ops, use empty search_path ───────────────

CREATE OR REPLACE FUNCTION public.job_funnel_stats(p_agency_id UUID, p_job_id UUID)
RETURNS TABLE (
  stage_id UUID, stage_name TEXT, stage_position INTEGER, color TEXT,
  client_name TEXT, candidate_count BIGINT, avg_days_in_stage FLOAT
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT ps.id, ps.name, ps.position::INTEGER, ps.color, ps.client_name,
         COUNT(cpe.id),
         AVG(EXTRACT(EPOCH FROM (NOW() - cpe.entered_stage_at)) / 86400)
  FROM public.pipeline_stages ps
  LEFT JOIN public.candidate_pipeline_entries cpe
    ON cpe.stage_id = ps.id AND cpe.job_id = p_job_id AND cpe.status = 'active'
  WHERE ps.agency_id = p_agency_id
    AND (ps.job_id = p_job_id OR ps.is_default = TRUE)
  GROUP BY ps.id, ps.name, ps.position, ps.color, ps.client_name
  ORDER BY ps.position;
$$;

-- ─── Revoke EXECUTE on SECURITY DEFINER functions from public roles ───────────

REVOKE EXECUTE ON FUNCTION public.current_agency_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.current_agency_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.current_agency_id() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM authenticated;
