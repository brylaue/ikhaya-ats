-- ─── 013: Team Invitations ────────────────────────────────────────────────────
--
-- Tracks pending (and historically accepted) invitations sent by agency admins
-- to prospective team members.
--
-- The actual auth invite is sent via supabase.auth.admin.inviteUserByEmail and
-- carries agency_id + role in user_metadata. This table lets us:
--   • Show pending invites in the Settings → Team UI
--   • Rate-limit re-invites (24-hour cooldown per email per agency)
--   • Revoke an invite before it is accepted
--   • Record when/if an invite was accepted

create table if not exists team_invitations (
  id           uuid        primary key default gen_random_uuid(),
  agency_id    uuid        not null references agencies(id) on delete cascade,
  email        text        not null,
  role         text        not null default 'recruiter',
  invited_by   uuid        references users(id) on delete set null,
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  expires_at   timestamptz not null default (now() + interval '7 days')
);

-- Index for the common lookups: pending invites per agency, invite by email
create index if not exists team_invitations_agency_id_idx on team_invitations (agency_id);
create index if not exists team_invitations_email_idx     on team_invitations (email);

-- ─── RLS ──────────────────────────────────────────────────────────────────────

alter table team_invitations enable row level security;

-- Agency owners and admins can read all invitations for their agency
create policy "agency admins can read invitations"
  on team_invitations for select
  using (
    agency_id = (
      select agency_id from users
      where id = auth.uid()
        and role in ('owner', 'admin')
    )
  );

-- Agency owners and admins can insert invitations for their agency
create policy "agency admins can insert invitations"
  on team_invitations for insert
  with check (
    agency_id = (
      select agency_id from users
      where id = auth.uid()
        and role in ('owner', 'admin')
    )
  );

-- Agency owners and admins can delete invitations for their agency
create policy "agency admins can delete invitations"
  on team_invitations for delete
  using (
    agency_id = (
      select agency_id from users
      where id = auth.uid()
        and role in ('owner', 'admin')
    )
  );

-- Service role (used by API routes) bypasses RLS — no extra policy needed.
