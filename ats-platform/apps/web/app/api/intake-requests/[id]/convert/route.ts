/**
 * POST /api/intake-requests/[id]/convert
 *
 * US-476: Recruiter converts a submitted intake form into a job draft.
 * US-480: Dispatches job.created webhook after successful conversion.
 * Creates a job row pre-populated with submission data, marks the intake
 * request as "converted", and returns the new job ID for redirect.
 *
 * Requires: intake must be in "submitted" status.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@/lib/supabase/server";
import { createClient as svc }       from "@supabase/supabase-js";
import { getAgencyContext }          from "@/lib/supabase/agency-cache";
import { checkCsrf }                 from "@/lib/csrf";
import { dispatchWebhook }           from "@/lib/webhooks/deliver";

const serviceDb = () =>
  svc(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const ctx      = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch the intake request — RLS ensures agency scoping
  const { data: intake, error: fetchErr } = await supabase
    .from("intake_requests")
    .select("id, status, submission, company_id, agency_id")
    .eq("id", params.id)
    .single();

  if (fetchErr || !intake) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (intake.status !== "submitted") {
    return NextResponse.json(
      { error: `Cannot convert: status is "${intake.status}"` },
      { status: 409 }
    );
  }

  const sub = (intake.submission ?? {}) as Record<string, unknown>;

  // Build a job row from submission data
  const jobInsert: Record<string, unknown> = {
    agency_id:   ctx.agencyId,
    company_id:  intake.company_id ?? null,
    title:       (sub.jobTitle as string) ?? "Untitled Role",
    status:      "draft",
    description: (sub.description as string) ?? null,
    location:    (sub.location as string) ?? null,
    work_type:   (sub.workType as string) ?? null,
    salary_min:  (sub.salaryMin as number) ?? null,
    salary_max:  (sub.salaryMax as number) ?? null,
    created_by:  ctx.userId,
  };

  // Department/function if provided
  if (sub.department) jobInsert.department = sub.department;

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .insert(jobInsert)
    .select("id")
    .single();

  if (jobErr) {
    return NextResponse.json({ error: jobErr.message }, { status: 500 });
  }

  // Mark intake as converted
  const { error: convErr } = await supabase
    .from("intake_requests")
    .update({
      status:           "converted",
      converted_job_id: job.id,
    })
    .eq("id", intake.id);

  if (convErr) {
    // Non-fatal — job was created; log but don't fail
    console.error("Failed to mark intake as converted:", convErr.message);
  }

  // US-480: Dispatch job.created webhook (fire-and-forget)
  const db = serviceDb();
  dispatchWebhook(db, ctx.agencyId, "job.created", {
    jobId:     job.id,
    title:     jobInsert.title,
    companyId: jobInsert.company_id ?? null,
    status:    "draft",
    source:    "intake_form",
    intakeId:  intake.id,
    createdBy: ctx.userId,
    createdAt: new Date().toISOString(),
  }).catch(() => {/* ignore */});

  return NextResponse.json({ jobId: job.id }, { status: 201 });
}
