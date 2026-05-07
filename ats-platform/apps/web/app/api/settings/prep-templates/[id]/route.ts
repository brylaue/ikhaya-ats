/**
 * PATCH  /api/settings/prep-templates/[id]
 * DELETE /api/settings/prep-templates/[id]
 * US-243: Prep template library — update and delete.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@/lib/supabase/server";
import { getAgencyContext }          from "@/lib/supabase/agency-cache";
import { checkCsrf }                 from "@/lib/csrf";
import { requirePlan }               from "@/lib/api/require-plan";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const ctx      = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // US-513: prep template library is Pro-tier.
  const planGuard = await requirePlan(supabase, ctx.agencyId, "stage_prep_library");
  if (planGuard) return planGuard;

  const body = await req.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};
  if (body.title       !== undefined) updates.title        = body.title;
  if (body.body        !== undefined) updates.body         = body.body;
  if (body.url         !== undefined) updates.url          = body.url;
  if (body.stageName   !== undefined) updates.stage_name   = body.stageName;
  if (body.contentType !== undefined) updates.content_type = body.contentType;
  if (body.isGlobal    !== undefined) updates.is_global    = body.isGlobal;

  const { data, error } = await supabase
    .from("prep_content_templates")
    .update(updates)
    .eq("id", params.id)
    .eq("agency_id", ctx.agencyId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ template: data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const ctx      = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // US-513: prep template library is Pro-tier.
  const planGuard = await requirePlan(supabase, ctx.agencyId, "stage_prep_library");
  if (planGuard) return planGuard;

  const { error } = await supabase
    .from("prep_content_templates")
    .delete()
    .eq("id", params.id)
    .eq("agency_id", ctx.agencyId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return new Response(null, { status: 204 });
}
