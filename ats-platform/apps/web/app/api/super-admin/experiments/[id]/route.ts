/**
 * PATCH  /api/super-admin/experiments/[id]  — update status / rollout / variants
 * DELETE /api/super-admin/experiments/[id]
 *
 * US-511.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const SUPER_ADMIN_EMAILS = (process.env.SUPER_ADMIN_EMAILS ?? "")
  .split(",").map(e => e.trim().toLowerCase()).filter(Boolean);

async function checkAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email || !SUPER_ADMIN_EMAILS.includes(user.email.toLowerCase())) {
    return null;
  }
  return user;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await checkAdmin();
  if (!u) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const allowed: Record<string, any> = {};
  for (const k of ["name","description","variants","rollout_pct","target_plans","agency_allowlist","agency_denylist","status"]) {
    if (k in body) allowed[k] = body[k];
  }
  // Status transitions stamp lifecycle dates
  if (body.status === "running") allowed.started_at = new Date().toISOString();
  if (body.status === "completed" || body.status === "paused") allowed.ended_at = new Date().toISOString();

  const db = createServiceClient();
  const { data, error } = await db.from("experiments").update(allowed).eq("id", params.id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ experiment: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await checkAdmin();
  if (!u) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = createServiceClient();
  const { error } = await db.from("experiments").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
