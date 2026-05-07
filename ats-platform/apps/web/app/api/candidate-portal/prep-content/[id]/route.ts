/**
 * PATCH  /api/candidate-portal/prep-content/[id]
 * DELETE /api/candidate-portal/prep-content/[id]
 * US-242: Update or delete a prep content item.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@/lib/supabase/server";
import { getAgencyContext }          from "@/lib/supabase/agency-cache";
import { checkCsrf }                 from "@/lib/csrf";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const ctx      = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};
  if (body.title       !== undefined) updates.title        = body.title;
  if (body.body        !== undefined) updates.body         = body.body;
  if (body.url         !== undefined) updates.url          = body.url;
  if (body.stageName   !== undefined) updates.stage_name   = body.stageName;
  if (body.sortOrder   !== undefined) updates.sort_order   = body.sortOrder;
  if (body.contentType !== undefined) updates.content_type = body.contentType;

  const { data, error } = await supabase
    .from("prep_content")
    .update(updates)
    .eq("id", params.id)
    .eq("agency_id", ctx.agencyId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ item: data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const ctx      = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("prep_content")
    .delete()
    .eq("id", params.id)
    .eq("agency_id", ctx.agencyId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return new Response(null, { status: 204 });
}
