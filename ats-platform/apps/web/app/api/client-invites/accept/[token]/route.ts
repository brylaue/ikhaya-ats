/**
 * GET /api/client-invites/accept/[token]
 *
 * US-475: Public endpoint — hiring manager clicks their invite email link.
 * Marks the invite as accepted and redirects to the client portal.
 *
 * No auth required — the token IS the credential.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as svc }       from "@supabase/supabase-js";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

const serviceDb = () =>
  svc(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const db = serviceDb();

  const { data: invite, error } = await db
    .from("client_portal_invites")
    .select(`
      id, accepted_at, revoked_at, expires_at,
      company:companies(portal_slug, id)
    `)
    .eq("token", token)
    .single();

  if (error || !invite) {
    return NextResponse.redirect(`${APP_URL}/?invite_error=not_found`);
  }

  if (invite.revoked_at) {
    return NextResponse.redirect(`${APP_URL}/?invite_error=revoked`);
  }

  if (new Date(invite.expires_at) < new Date()) {
    return NextResponse.redirect(`${APP_URL}/?invite_error=expired`);
  }

  // Mark accepted if not yet accepted
  if (!invite.accepted_at) {
    await db
      .from("client_portal_invites")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", invite.id);
  }

  // Redirect to the portal
  const rawCompany = invite.company as { portal_slug?: string; id: string } | { portal_slug?: string; id: string }[] | null;
  const company = Array.isArray(rawCompany) ? rawCompany[0] ?? null : rawCompany;
  const slug    = company?.portal_slug ?? company?.id ?? "";

  return NextResponse.redirect(`${APP_URL}/portal/${slug}`);
}
