/**
 * /api/applications/[id]/stage-visibility
 * US-241: Per-candidate stage visibility override.
 *
 * Context: pipeline_stages has `visible_to_candidate` as a default, but the
 * recruiter sometimes wants to hide or reveal a stage for ONE specific
 * application (e.g. "show them we're in the debrief stage on this one because
 * the hiring manager told the candidate directly").
 *
 * GET — return merged view: for each stage, compute effective_visible using
 *       override if present, else the stage default.
 * PUT — set/clear override: { stage_id, visible?: boolean|null }  (null clears)
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAgencyContext } from "@/lib/supabase/agency-cache";
import { checkCsrf } from "@/lib/csrf";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: applicationId } = await params;
  const supabase = await createClient();
  const ctx = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Find which pipeline this application uses
  const { data: app } = await supabase
    .from("applications")
    .select("id, job_id, jobs:jobs(pipeline_id)")
    .eq("id", applicationId)
    .maybeSingle();
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pipelineId = (app.jobs as any)?.pipeline_id;
  if (!pipelineId) return NextResponse.json({ stages: [] });

  const [{ data: stages }, { data: overrides }] = await Promise.all([
    supabase.from("pipeline_stages")
      .select("id, name, order_index, visible_to_candidate")
      .eq("pipeline_id", pipelineId)
      .order("order_index", { ascending: true }),
    supabase.from("application_stage_visibility")
      .select("stage_id, visible")
      .eq("application_id", applicationId),
  ]);

  const overrideMap = new Map<string, boolean>();
  for (const o of overrides ?? []) overrideMap.set(o.stage_id as string, o.visible as boolean);

  const merged = (stages ?? []).map((s) => {
    const ov = overrideMap.get(s.id as string);
    return {
      id: s.id,
      name: s.name,
      order_index: s.order_index,
      default_visible: s.visible_to_candidate,
      override: ov === undefined ? null : ov,
      effective_visible: ov === undefined ? s.visible_to_candidate : ov,
    };
  });

  return NextResponse.json({ stages: merged });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfError = checkCsrf(req); if (csrfError) return csrfError;
  const { id: applicationId } = await params;
  const supabase = await createClient();
  const ctx = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const b = await req.json().catch(() => ({})) as { stage_id?: unknown; visible?: unknown };
  if (typeof b.stage_id !== "string") {
    return NextResponse.json({ error: "stage_id required" }, { status: 400 });
  }

  // null/undefined → clear the override (fall back to stage default)
  if (b.visible === null || b.visible === undefined) {
    const { error } = await supabase
      .from("application_stage_visibility")
      .delete()
      .eq("application_id", applicationId)
      .eq("stage_id", b.stage_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, cleared: true });
  }

  if (typeof b.visible !== "boolean") {
    return NextResponse.json({ error: "visible must be boolean or null" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("application_stage_visibility")
    .upsert({
      agency_id:      ctx.agencyId,
      application_id: applicationId,
      stage_id:       b.stage_id,
      visible:        b.visible,
      set_by:         ctx.userId,
    }, { onConflict: "application_id,stage_id" })
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ override: data });
}
