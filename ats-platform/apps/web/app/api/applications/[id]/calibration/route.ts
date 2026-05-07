/**
 * POST /api/applications/[id]/calibration
 * US-124: Toggle an application's `is_calibration` flag.
 *
 * Calibration submissions are early "pressure-test" candidates — we want the
 * feedback flowing into US-190 intake refinement but NOT counted toward
 * submittal metrics (conversion, time-to-submit, SLA).
 *
 * Body: { is_calibration: boolean }
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAgencyContext } from "@/lib/supabase/agency-cache";
import { checkCsrf } from "@/lib/csrf";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfError = checkCsrf(req); if (csrfError) return csrfError;
  const { id } = await params;
  const supabase = await createClient();
  const ctx = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { is_calibration?: unknown };
  if (typeof body.is_calibration !== "boolean") {
    return NextResponse.json({ error: "is_calibration must be boolean" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("applications")
    .update({ is_calibration: body.is_calibration })
    .eq("id", id)
    .select("id, is_calibration")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: "Not found" },   { status: 404 });
  return NextResponse.json({ ok: true, application: data });
}
