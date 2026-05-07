-- ─── 014: Candidate merge support fields ─────────────────────────────────────
--
-- Adds `is_active` and `merged_into_id` to the candidates table so that when
-- a duplicate is merged, the losing record can be soft-deleted and linked back
-- to the record it was merged into.

-- is_active: false = deactivated / merged away (invisible in normal queries)
alter table candidates
  add column if not exists is_active boolean not null default true;

-- merged_into_id: set on the losing record after a merge
alter table candidates
  add column if not exists merged_into_id uuid references candidates(id) on delete set null;

-- Index for the common filter: is_active = true
create index if not exists candidates_is_active_idx on candidates (is_active);

-- Update existing RLS policies (if any) to filter out inactive candidates.
-- Most policies already rely on agency_id; we add is_active to the select policy.
-- NOTE: If your project uses a catch-all policy, adjust accordingly.

-- Example: add is_active filter to any existing select policy for candidates
-- (Run manually if your RLS policy names differ)
-- drop policy if exists "Users can read own agency candidates" on candidates;
-- create policy "Users can read own agency candidates"
--   on candidates for select
--   using (
--     agency_id = (select agency_id from users where id = auth.uid())
--     and is_active = true
--   );
