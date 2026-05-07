/**
 * /api/jobs/[id]/exclusivity
 * US-026: Requisition Exclusivity Windows.
 *
 * GET   — list windows on a job (most recent first)
 * POST  — create a new window { starts_on, ends_on, contract_ref?, reason? }
 *
 * Alerts 14 days before expiry are driven by the existing alert-scheduling
 * cron (US-095). This file just manages the record.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAgencyContext } from "@/lib/supabase/agency-cache";
import { checkCsrf } from "@/lib/csrf";

function isDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const ctx = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("job_exclusivity_windows")
    .select("id, starts_on, ends_on, contract_ref, reason, created_at")
    .eq("job_id", id)
    .order("ends_on", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const windows = (data ?? []).map((w) => ({
    ...w,
    active:           w.starts_on <= today && w.ends_on >= today,
    days_to_expiry:   Math.max(0, Math.floor((+new Date(w.ends_on) - +new Date(today)) / 86400000)),
    expiring_soon:    w.ends_on >= today && (+new Date(w.ends_on) - +new Date(today)) <= 14 * 86400000,
  }));
  return NextResponse.json({ windows });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfError = checkCsrf(req); if (csrfError) return csrfError;
  const { id } = await params;
  const supabase = await createClient();
  const ctx = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  if (!isDate(body.starts_on) || !isDate(body.ends_on)) {
    return NextResponse.json({ error: "starts_on and ends_on must be YYYY-MM-DD" }, { status: 400 });
  }
  if (body.ends_on < body.starts_on) {
    return NextResponse.json({ error: "ends_on must be on/after starts_on" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("job_exclusivity_windows")
    .insert({
      agency_id:    ctx.agencyId,
      job_id:       id,
      starts_on:    body.starts_on,
      ends_on:      body.ends_on,
      contract_ref: typeof body.contract_ref === "string" ? body.contract_ref.slice(0, 200) : null,
      reason:       typeof body.reason       === "string" ? body.reason.slice(0, 2000)      : null,
      created_by:   ctx.userId,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ window: data });
}
