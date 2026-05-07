/**
 * GET  /api/settings/prep-templates
 * POST /api/settings/prep-templates
 * US-243: Prep content template library — list and create.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@/lib/supabase/server";
import { getAgencyContext }          from "@/lib/supabase/agency-cache";
import { checkCsrf }                 from "@/lib/csrf";
import { requirePlan }               from "@/lib/api/require-plan";

export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const ctx      = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // US-513: prep template library is Pro-tier.
  const planGuard = await requirePlan(supabase, ctx.agencyId, "stage_prep_library");
  if (planGuard) return planGuard;

  const { data, error } = await supabase
    .from("prep_content_templates")
    .select("*")
    .eq("agency_id", ctx.agencyId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ templates: data ?? [] });
}

export async function POST(req: NextRequest) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const ctx      = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // US-513: prep template library is Pro-tier.
  const planGuard = await requirePlan(supabase, ctx.agencyId, "stage_prep_library");
  if (planGuard) return planGuard;

  const body = await req.json().catch(() => ({}));
  const { stageName, contentType, title, body: text, url, isGlobal } = body as {
    stageName?:   string;
    contentType?: string;
    title?:       string;
    body?:        string;
    url?:         string;
    isGlobal?:    boolean;
  };

  if (!title || !contentType) {
    return NextResponse.json({ error: "title and contentType are required" }, { status: 400 });
  }

  const insert: Record<string, unknown> = {
    agency_id:    ctx.agencyId,
    content_type: contentType,
    title,
    is_global:    isGlobal ?? true,
    created_by:   ctx.userId,
  };
  if (stageName) insert.stage_name = stageName;
  if (text)      insert.body       = text;
  if (url)       insert.url        = url;

  const { data, error } = await supabase
    .from("prep_content_templates")
    .insert(insert)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ template: data }, { status: 201 });
}
