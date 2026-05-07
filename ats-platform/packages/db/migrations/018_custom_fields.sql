-- ─── 015: Custom Fields ───────────────────────────────────────────────────────
--
-- Two tables:
--   custom_field_definitions  — the schema (what fields exist, their type, etc.)
--   custom_field_values       — the per-record values

create type custom_field_type as enum (
  'text', 'textarea', 'number', 'date', 'boolean', 'select', 'url', 'email'
);

create type custom_field_entity as enum (
  'candidate', 'job', 'company', 'placement'
);

-- ── Definitions ───────────────────────────────────────────────────────────────

create table if not exists custom_field_definitions (
  id           uuid                primary key default gen_random_uuid(),
  agency_id    uuid                not null references agencies(id) on delete cascade,
  entity       custom_field_entity not null,
  name         text                not null,
  key          text                not null,            -- snake_case programmatic key
  field_type   custom_field_type   not null default 'text',
  options      jsonb,                                   -- for "select" type: ["Option A","Option B"]
  required     boolean             not null default false,
  searchable   boolean             not null default false,
  client_visible boolean           not null default false, -- show on client portal
  sort_order   integer             not null default 0,
  created_at   timestamptz         not null default now(),

  unique (agency_id, entity, key)
);

create index if not exists custom_field_definitions_agency_entity_idx
  on custom_field_definitions (agency_id, entity);

-- ── Values ────────────────────────────────────────────────────────────────────

create table if not exists custom_field_values (
  id            uuid        primary key default gen_random_uuid(),
  agency_id     uuid        not null references agencies(id) on delete cascade,
  definition_id uuid        not null references custom_field_definitions(id) on delete cascade,
  entity        custom_field_entity not null,
  record_id     uuid        not null,   -- the candidate / job / company / placement id
  value_text    text,
  value_number  numeric,
  value_date    date,
  value_boolean boolean,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (definition_id, record_id)
);

create index if not exists custom_field_values_record_idx
  on custom_field_values (entity, record_id);
create index if not exists custom_field_values_definition_idx
  on custom_field_values (definition_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────

alter table custom_field_definitions enable row level security;
alter table custom_field_values      enable row level security;

-- All agency members can read definitions for their agency
create policy "agency members read custom field definitions"
  on custom_field_definitions for select
  using (agency_id = (select agency_id from users where id = auth.uid()));

-- Only admins/owners can insert/update/delete definitions
create policy "agency admins manage custom field definitions"
  on custom_field_definitions for all
  using (
    agency_id = (select agency_id from users where id = auth.uid()
                 and role in ('owner','admin'))
  );

-- All agency members can read/write field values for their agency
create policy "agency members read custom field values"
  on custom_field_values for select
  using (agency_id = (select agency_id from users where id = auth.uid()));

create policy "agency members upsert custom field values"
  on custom_field_values for insert
  with check (agency_id = (select agency_id from users where id = auth.uid()));

create policy "agency members update custom field values"
  on custom_field_values for update
  using (agency_id = (select agency_id from users where id = auth.uid()));
