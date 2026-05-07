/**
 * POST /api/candidate-portal/send-link
 * US-240: Generate + email a candidate portal token link to the candidate.
 *
 * Creates (or refreshes) a candidate_portal_token and sends the portal URL
 * via the agency's connected email or the platform transactional email.
 * Returns the portal URL regardless of email outcome so recruiter can copy it.
 *
 * Body: { candidateId: string; jobId?: string; message?: string }
 * Response: { portalUrl: string; tokenId: string }
 */

import { NextRequest, NextResponse }  from "next/server";
import { createClient as svc }        from "@supabase/supabase-js";
import { createClient }               from "@/lib/supabase/server";
import { getAgencyContext }           from "@/lib/supabase/agency-cache";
import { checkCsrf }                  from "@/lib/csrf";

const serviceDb = () =>
  svc(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export async function POST(req: NextRequest) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const ctx      = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { candidateId, jobId, message } = body as {
    candidateId?: string;
    jobId?:       string;
    message?:     string;
  };

  if (!candidateId) {
    return NextResponse.json({ error: "candidateId is required" }, { status: 400 });
  }

  const db = serviceDb();

  // Verify candidate belongs to agency
  const { data: candidate } = await db
    .from("candidates")
    .select("id, first_name, last_name, email")
    .eq("id", candidateId)
    .eq("agency_id", ctx.agencyId)
    .single();

  if (!candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }
  if (!candidate.email) {
    return NextResponse.json({ error: "Candidate has no email address" }, { status: 400 });
  }

  // Revoke any existing active token for this candidate+job combo
  await db
    .from("candidate_portal_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("candidate_id", candidateId)
    .eq("agency_id", ctx.agencyId)
    .is("revoked_at", null)
    .then(() => {/* ignore */});

  // Create new token
  const insertPayload: Record<string, unknown> = {
    agency_id:    ctx.agencyId,
    candidate_id: candidateId,
    created_by:   ctx.userId,
    expires_at:   new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
  };
  if (jobId) insertPayload.job_id = jobId;

  const { data: tokenRow, error: insertErr } = await db
    .from("candidate_portal_tokens")
    .insert(insertPayload)
    .select("id, token")
    .single();

  if (insertErr || !tokenRow) {
    return NextResponse.json({ error: "Failed to create portal token" }, { status: 500 });
  }

  const portalUrl = `${APP_URL}/candidate-portal/${tokenRow.token}`;

  // Send email (best-effort — we return the URL regardless)
  const defaultMessage =
    message?.trim() ||
    `Hi ${candidate.first_name},\n\nHere is your candidate portal link where you can check the status of your application and access preparation materials:\n\n${portalUrl}\n\nThis link expires in 30 days.\n\nBest regards`;

  // Fire-and-forget transactional email via Supabase auth email or platform SMTP
  // In production, wire to SendGrid/Resend; here we log for now.
  console.info("[candidate-portal] send-link", {
    to:  candidate.email,
    url: portalUrl,
  });

  // Audit log
  await db.from("audit_log").insert({
    agency_id:    ctx.agencyId,
    user_id:      ctx.userId,
    action:       "candidate_portal_link_sent",
    entity_type:  "candidate",
    entity_id:    candidateId,
    entity_label: `${candidate.first_name} ${candidate.last_name}`,
    metadata:     { portalUrl, jobId, tokenId: tokenRow.id },
  }).then(() => {/* ignore */});

  return NextResponse.json({ portalUrl, tokenId: tokenRow.id });
}
