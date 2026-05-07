-- ─── 024: Alerts & Escalations Engine ───────────────────────────────────────

-- alert_rules: configurable rules that trigger notifications/escalations
create table if not exists alert_rules (
  id            uuid        primary key default gen_random_uuid(),
  agency_id     uuid        not null references agencies(id) on delete cascade,
  name          text        not null,
  description   text,
  trigger_type  text        not null check (trigger_type in (
    'candidate_stale',        -- no activity on candidate for N days
    'sla_breach',             -- pipeline stage exceeded target days
    'no_submission',          -- job open N days without submission
    'approaching_fill_date',  -- latestFillDate within N days
    'interview_no_feedback',  -- interview passed, no feedback after N days
    'offer_expiring',         -- offer letter expires in N days
    'no_new_candidates',      -- job has <N candidates after opening N days
    'placement_guarantee_expiring' -- guarantee period ends in N days
  )),
  conditions    jsonb       not null default '{}',
  -- conditions shape varies by trigger_type, e.g.:
  --   candidate_stale: { days: 7 }
  --   sla_breach: { stage: "submitted", multiplier: 1.5 }
  --   approaching_fill_date: { days_before: 14 }
  severity      text        not null check (severity in ('info','warning','critical')) default 'warning',
  notify_roles  text[]      not null default '{}',  -- e.g. ['owner','admin']
  notify_assignee boolean   not null default true,
  is_active     boolean     not null default true,
  created_by    uuid        references users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists alert_rules_agency_idx on alert_rules(agency_id);
create index if not exists alert_rules_active_idx  on alert_rules(agency_id, is_active) where is_active = true;

-- alert_events: fired instances of alert rules
create table if not exists alert_events (
  id          uuid        primary key default gen_random_uuid(),
  agency_id   uuid        not null references agencies(id) on delete cascade,
  rule_id     uuid        not null references alert_rules(id) on delete cascade,
  entity_type text        not null check (entity_type in ('candidate','job','placement','pipeline_entry')),
  entity_id   uuid        not null,
  severity    text        not null,
  message     text        not null,
  metadata    jsonb       not null default '{}',
  dismissed   boolean     not null default false,
  dismissed_by uuid       references users(id) on delete set null,
  dismissed_at timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists alert_events_agency_idx    on alert_events(agency_id, created_at desc);
create index if not exists alert_events_entity_idx    on alert_events(entity_type, entity_id);
create index if not exists alert_events_active_idx    on alert_events(agency_id, dismissed) where dismissed = false;

-- ── RLS ───────────────────────────────────────────────────────────────────────

alter table alert_rules  enable row level security;
alter table alert_events enable row level security;

create policy "agency members read alert rules"
  on alert_rules for select
  using (agency_id = (select agency_id from users where id = auth.uid()));

create policy "agency admins manage alert rules"
  on alert_rules for all
  using (agency_id = (select agency_id from users where id = auth.uid()));

create policy "agency members read alert events"
  on alert_events for select
  using (agency_id = (select agency_id from users where id = auth.uid()));

create policy "agency members insert alert events"
  on alert_events for insert
  with check (agency_id = (select agency_id from users where id = auth.uid()));

create policy "agency members dismiss alert events"
  on alert_events for update
  using (agency_id = (select agency_id from users where id = auth.uid()));
