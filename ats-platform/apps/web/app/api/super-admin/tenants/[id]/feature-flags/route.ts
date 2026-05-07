/**
 * GET  /api/super-admin/tenants/[id]/feature-flags
 * PATCH /api/super-admin/tenants/[id]/feature-flags
 * US-460: Read and update per-tenant feature flag overrides.
 *
 * Feature overrides are stored in agencies.feature_overrides jsonb:
 *   { "ai_match_scoring": true, "advanced_reporting": false, ... }
 * A null value means "use plan default".
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { checkCsrf } from "@/lib/csrf";

const SUPER_ADMIN_EMAILS = (process.env.SUPER_ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

async function guard(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !SUPER_ADMIN_EMAILS.includes(user.email.toLowerCase())) {
    return { user: null, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user, error: null };
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { error } = await guard(req);
  if (error) return error;

  const db = createServiceClient();
  const { data: agency, error: dbErr } = await db
    .from("agencies")
    .select("id, name, plan, feature_overrides")
    .eq("id", params.id)
    .single();

  if (dbErr || !agency) {
    return NextResponse.json({ error: "Agency not found" }, { status: 404 });
  }

  return NextResponse.json({
    agencyId: agency.id,
    agencyName: agency.name,
    plan: agency.plan,
    overrides: agency.feature_overrides ?? {},
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const { user, error } = await guard(req);
  if (error || !user) return error!;

  const body = await req.json().catch(() => ({}));
  const { feature, enabled } = body as { feature: string; enabled: boolean | null };

  if (!feature || typeof feature !== "string") {
    return NextResponse.json({ error: "feature is required" }, { status: 400 });
  }

  const db = createServiceClient();

  // Fetch current overrides
  const { data: agency } = await db
    .from("agencies")
    .select("id, name, feature_overrides")
    .eq("id", params.id)
    .single();

  if (!agency) {
    return NextResponse.json({ error: "Agency not found" }, { status: 404 });
  }

  const current = (agency.feature_overrides as Record<string, boolean | null>) ?? {};

  // null = remove override (fall back to plan default)
  if (enabled === null) {
    delete current[feature];
  } else {
    current[feature] = enabled;
  }

  const { error: updateErr } = await db
    .from("agencies")
    .update({ feature_overrides: current })
    .eq("id", params.id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Audit
  await db.from("audit_log").insert({
    agency_id:     params.id,
    user_id:       user.id,
    action:        "super_admin.feature_flag_update",
    resource_type: "agency",
    resource_id:   params.id,
    detail:        { feature, enabled, agencyName: agency.name, updatedBy: user.email },
    performed_at:  new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, overrides: current });
}
