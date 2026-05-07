/**
 * GET  /api/intake-requests  — list intake requests for the agency
 * POST /api/intake-requests  — create a new intake link
 *
 * US-476: Recruiters create shareable intake forms for hiring managers.
 * The token in the returned URL is what the client uses — no auth required
 * to submit (handled by /api/intake-requests/[token] public route).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@/lib/supabase/server";
import { getAgencyContext }          from "@/lib/supabase/agency-cache";
import { checkCsrf }                 from "@/lib/csrf";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const ctx      = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get("companyId");

  let query = supabase
    .from("intake_requests")
    .select(`
      id, token, status, submitted_at, converted_job_id, expires_at,
      created_at, prefill,
      company:companies(id, name)
    `)
    .eq("agency_id", ctx.agencyId)
    .order("created_at", { ascending: false });

  if (companyId) {
    query = query.eq("company_id", companyId);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(
    data.map((r) => ({
      ...r,
      intakeUrl: `${APP_URL}/intake/${r.token}`,
    }))
  );
}

export async function POST(req: NextRequest) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const ctx      = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as {
    companyId?: string;
    prefill?:   Record<string, unknown>;
    expiresInDays?: number;
  };

  const expires = body.expiresInDays
    ? new Date(Date.now() + body.expiresInDays * 86_400_000).toISOString()
    : undefined;

  const insert: Record<string, unknown> = {
    agency_id:  ctx.agencyId,
    created_by: ctx.userId,
    prefill:    body.prefill ?? {},
  };
  if (body.companyId) insert.company_id = body.companyId;
  if (expires)        insert.expires_at  = expires;

  const { data, error } = await supabase
    .from("intake_requests")
    .insert(insert)
    .select("id, token, status, expires_at, prefill")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ...data,
    intakeUrl: `${APP_URL}/intake/${data.token}`,
  }, { status: 201 });
}
