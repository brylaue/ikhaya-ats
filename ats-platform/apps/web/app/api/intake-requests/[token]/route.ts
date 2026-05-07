/**
 * GET  /api/intake-requests/[token]  — public: fetch form metadata (no auth)
 * POST /api/intake-requests/[token]  — public: submit the form (no auth)
 *
 * US-476: The token is embedded in the public /intake/[token] URL.
 * No session required — anyone with the link can submit once.
 * Submissions after expires_at or in non-pending status are rejected.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as svc }       from "@supabase/supabase-js";

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
  const db = serviceDb();

  const { data, error } = await db
    .from("intake_requests")
    .select(`
      id, token, status, prefill, expires_at,
      company:companies(id, name)
    `)
    .eq("token", params.token)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (new Date(data.expires_at) < new Date()) {
    return NextResponse.json({ error: "This link has expired" }, { status: 410 });
  }

  if (data.status !== "pending") {
    return NextResponse.json(
      { error: "This form has already been submitted" },
      { status: 409 }
    );
  }

  return NextResponse.json({
    id:         data.id,
    status:     data.status,
    prefill:    data.prefill,
    expiresAt:  data.expires_at,
    company:    data.company,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const db = serviceDb();

  // Verify the request still exists and is submittable
  const { data: intake, error: fetchErr } = await db
    .from("intake_requests")
    .select("id, status, expires_at")
    .eq("token", params.token)
    .single();

  if (fetchErr || !intake) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (new Date(intake.expires_at) < new Date()) {
    return NextResponse.json({ error: "This link has expired" }, { status: 410 });
  }
  if (intake.status !== "pending") {
    return NextResponse.json(
      { error: "This form has already been submitted" },
      { status: 409 }
    );
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;

  // Require at minimum a job title
  if (!body.jobTitle || typeof body.jobTitle !== "string" || !body.jobTitle.trim()) {
    return NextResponse.json({ error: "Job title is required" }, { status: 400 });
  }

  const { error: updateErr } = await db
    .from("intake_requests")
    .update({
      status:       "submitted",
      submitted_at: new Date().toISOString(),
      submission:   body,
    })
    .eq("id", intake.id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
