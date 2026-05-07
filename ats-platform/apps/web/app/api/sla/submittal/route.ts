/**
 * /api/sla/submittal
 * US-221: Submittal SLA per client.
 *
 * Reads from client_sla_config (defined in migration 067) and evaluates
 * which submittals are at risk / overdue vs. the client's configured SLA.
 *
 * GET   — list SLA configs per company; optionally include breach counts.
 * POST  — upsert SLA for a company:
 *         { company_id, submittal_response_hours, interview_scheduling_hours?,
 *           offer_response_hours?, active? }
 *
 * Breach computation: for each submission where application.status is one of
 * the "awaiting client" states, we check (now - submitted_at) vs.
 * submittal_response_hours. Those over the threshold are breached; within
 * 80%+ are warning.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAgencyContext } from "@/lib/supabase/agency-cache";
import { checkCsrf } from "@/lib/csrf";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const ctx = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const includeBreach = req.nextUrl.searchParams.get("include_breaches") === "1";
  const companyId = req.nextUrl.searchParams.get("company_id");

  let q = supabase.from("client_sla_config")
    .select("id, company_id, submittal_response_hours, interview_scheduling_hours, offer_response_hours, active, updated_at")
    .eq("active", true);
  if (companyId) q = q.eq("company_id", companyId);

  const { data: slas, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!includeBreach) return NextResponse.json({ slas: slas ?? [] });

  // For each SLA, count applications in "awaiting client" states past the
  // threshold. We treat application.submitted_at as t0.
  const AWAITING = ["submitted_to_client", "awaiting_feedback"];
  const now = Date.now();
  const results = [];
  for (const sla of slas ?? []) {
    const hours = Number(sla.submittal_response_hours ?? 0);
    if (hours <= 0) { results.push({ ...sla, breaches: 0, warnings: 0 }); continue; }

    const thresholdMs = hours * 3600 * 1000;
    const warningMs   = thresholdMs * 0.8;
    const { data: apps } = await supabase
      .from("applications")
      .select("id, submitted_at, status, jobs:jobs(company_id)")
      .in("status", AWAITING)
      .not("submitted_at", "is", null);

    let breaches = 0, warnings = 0;
    for (const a of apps ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const companyOnApp = (a.jobs as any)?.company_id;
      if (companyOnApp !== sla.company_id) continue;
      const age = now - new Date(a.submitted_at as string).getTime();
      if (age >= thresholdMs) breaches += 1;
      else if (age >= warningMs) warnings += 1;
    }
    results.push({ ...sla, breaches, warnings });
  }
  return NextResponse.json({ slas: results });
}

export async function POST(req: NextRequest) {
  const csrfError = checkCsrf(req); if (csrfError) return csrfError;
  const supabase = await createClient();
  const ctx = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["admin", "owner"].includes(ctx.role)) {
    return NextResponse.json({ error: "Admin/owner only" }, { status: 403 });
  }

  const b = await req.json().catch(() => ({})) as Record<string, unknown>;
  if (typeof b.company_id !== "string") {
    return NextResponse.json({ error: "company_id required" }, { status: 400 });
  }
  const pick = (k: string) => typeof b[k] === "number" && (b[k] as number) >= 0 ? b[k] as number : null;

  const row = {
    agency_id:                  ctx.agencyId,
    company_id:                 b.company_id,
    submittal_response_hours:   pick("submittal_response_hours") ?? 48,
    interview_scheduling_hours: pick("interview_scheduling_hours"),
    offer_response_hours:       pick("offer_response_hours"),
    active:                     typeof b.active === "boolean" ? b.active : true,
    updated_by:                 ctx.userId,
    updated_at:                 new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("client_sla_config")
    .upsert(row, { onConflict: "agency_id,company_id" })
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sla: data });
}
