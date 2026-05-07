-- ─── Migration 059: Client Portal Invites ────────────────────────────────────
-- US-475: Recruiters invite specific hiring managers to view shortlists
-- via the existing client portal (/portal/[portalSlug]).
-- Invites are token-gated emails; accepting marks them "accepted" and
-- redirects to the portal. Recruiters can revoke access at any time.

CREATE TABLE IF NOT EXISTS client_portal_invites (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id     UUID        NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  company_id    UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Invitee details
  email         TEXT        NOT NULL,
  name          TEXT,

  -- Granular permission — what the invitee can do in the portal
  can_feedback  BOOLEAN     NOT NULL DEFAULT TRUE,

  -- One-time acceptance token embedded in the invite email
  token         TEXT        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),

  -- Lifecycle
  invited_by    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at   TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '14 days'),

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cpi_agency_company_idx ON client_portal_invites (agency_id, company_id);
CREATE INDEX IF NOT EXISTS cpi_token_idx          ON client_portal_invites (token);
CREATE INDEX IF NOT EXISTS cpi_email_idx          ON client_portal_invites (email);

ALTER TABLE client_portal_invites ENABLE ROW LEVEL SECURITY;

-- Recruiters can manage invites for their own agency
CREATE POLICY "client_portal_invites_agency_own" ON client_portal_invites FOR ALL
  USING (agency_id = (SELECT agency_id FROM agency_users WHERE user_id = auth.uid() LIMIT 1));

CREATE TRIGGER client_portal_invites_updated_at
  BEFORE UPDATE ON client_portal_invites
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE client_portal_invites IS
  'Recruiter-issued invitations for hiring managers to access the client shortlist portal. '
  'Token-gated; the invitee clicks the link in their email to gain portal access.';

COMMENT ON COLUMN client_portal_invites.token IS
  'One-time token in the invite email URL. Marks accepted_at on first use. '
  'Portal URL is /portal/[companyPortalSlug] — this invite proves the person was authorized.';
