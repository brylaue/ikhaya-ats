-- ─── 023: Team / Pod Hierarchy ───────────────────────────────────────────────

-- pods: named groups of recruiters (e.g. "Finance Pod", "Tech Pod")
create table if not exists pods (
  id          uuid        primary key default gen_random_uuid(),
  agency_id   uuid        not null references agencies(id) on delete cascade,
  name        text        not null,
  description text,
  color       text        default '#6366f1',
  lead_id     uuid        references users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (agency_id, name)
);

create index if not exists pods_agency_idx on pods(agency_id);

-- pod_members: many-to-many users ↔ pods
create table if not exists pod_members (
  pod_id     uuid        not null references pods(id) on delete cascade,
  user_id    uuid        not null references users(id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (pod_id, user_id)
);

create index if not exists pod_members_user_idx on pod_members(user_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────

alter table pods        enable row level security;
alter table pod_members enable row level security;

create policy "agency members read pods"
  on pods for select
  using (agency_id = (select agency_id from users where id = auth.uid()));

create policy "agency admins manage pods"
  on pods for all
  using (agency_id = (select agency_id from users where id = auth.uid()))
  with check (agency_id = (select agency_id from users where id = auth.uid()));

create policy "agency members read pod_members"
  on pod_members for select
  using (
    pod_id in (
      select id from pods
      where agency_id = (select agency_id from users where id = auth.uid())
    )
  );

create policy "agency admins manage pod_members"
  on pod_members for all
  using (
    pod_id in (
      select id from pods
      where agency_id = (select agency_id from users where id = auth.uid())
    )
  );
