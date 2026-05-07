/**
 * GET  /api/client-invites?companyId=…  — list portal invites for a company
 * POST /api/client-invites              — invite a hiring manager by email
 *
 * US-475: Recruiter-issued invitations for client users (hiring managers)
 * to access the shortlist review portal at /portal/[portalSlug].
 * Sends an invitation email with the accept token link.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@/lib/supabase/server";
import { getAgencyContext }          from "@/lib/supabase/agency-cache";
import { checkCsrf }                 from "@/lib/csrf";
import { sendEmail }                 from "@/lib/email/send";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const ctx      = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const companyId = new URL(req.url).searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("client_portal_invites")
    .select("id, email, name, can_feedback, accepted_at, revoked_at, expires_at, created_at")
    .eq("agency_id", ctx.agencyId)
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const ctx      = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as {
    companyId:   string;
    email:       string;
    name?:       string;
    canFeedback?: boolean;
  };

  if (!body.companyId || !body.email?.includes("@")) {
    return NextResponse.json({ error: "companyId and a valid email are required" }, { status: 400 });
  }

  // Fetch company name + portal slug for the invite email
  const { data: company } = await supabase
    .from("companies")
    .select("name, portal_slug")
    .eq("id", body.companyId)
    .eq("agency_id", ctx.agencyId)
    .single();

  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  // Fetch agency name for email branding
  const { data: agency } = await supabase
    .from("agencies")
    .select("name")
    .eq("id", ctx.agencyId)
    .single();

  const { data: invite, error: insertErr } = await supabase
    .from("client_portal_invites")
    .insert({
      agency_id:   ctx.agencyId,
      company_id:  body.companyId,
      email:       body.email.toLowerCase().trim(),
      name:        body.name?.trim() || null,
      can_feedback: body.canFeedback ?? true,
      invited_by:  ctx.userId,
    })
    .select("id, token")
    .single();

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  // Send invitation email (best-effort — don't fail the request if email fails)
  const acceptUrl = `${APP_URL}/api/client-invites/accept/${invite.token}`;
  const portalUrl = `${APP_URL}/portal/${company.portal_slug ?? body.companyId}`;
  const firstName = body.name?.split(" ")[0] ?? "there";

  try {
    await sendEmail({
      to:      body.email,
      subject: `You've been invited to review candidates — ${company.name}`,
      html: `
        <p>Hi ${firstName},</p>
        <p>${agency?.name ?? "Your recruiting partner"} has invited you to review candidate shortlists for <strong>${company.name}</strong>.</p>
        <p>Click below to accept your invitation and access the portal:</p>
        <p style="margin:24px 0">
          <a href="${acceptUrl}" style="background:#7c3aed;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">
            Accept Invitation
          </a>
        </p>
        <p style="color:#6b7280;font-size:13px">
          This link expires in 14 days. Once accepted, you can access the portal directly at:<br/>
          <a href="${portalUrl}">${portalUrl}</a>
        </p>
        <p style="color:#6b7280;font-size:13px">
          If you weren't expecting this invitation, you can safely ignore this email.
        </p>
      `,
    });
  } catch (emailErr) {
    console.error("Failed to send client invite email:", emailErr);
    // Invite was created — return it but note email failed
    return NextResponse.json(
      { id: invite.id, warning: "Invite created but email delivery failed" },
      { status: 201 }
    );
  }

  return NextResponse.json({ id: invite.id }, { status: 201 });
}
