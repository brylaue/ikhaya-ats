/**
 * DELETE /api/keys/[id] — Revoke an API key
 * POST   /api/keys/[id]/rotate — Rotate (revoke + create new) — handled in route below
 * US-401
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@/lib/supabase/server";
import { createClient as svc }       from "@supabase/supabase-js";
import { getAgencyContext }          from "@/lib/supabase/agency-cache";
import { checkCsrf }                 from "@/lib/csrf";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // US-326: key revocation must be same-origin
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getAgencyContext(supabase, user.id);
  if (!ctx || !["owner", "admin"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = svc(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  const body = await req.json().catch(() => ({}));
  const reason = body?.reason ?? "manual_revocation";

  // Verify key belongs to this agency
  const { data: key } = await db
    .from("api_keys")
    .select("id, name")
    .eq("id", id)
    .eq("agency_id", ctx.agencyId)
    .is("revoked_at", null)
    .single();

  if (!key) {
    return NextResponse.json({ error: "Key not found" }, { status: 404 });
  }

  await db.from("api_keys").update({
    revoked_at:   new Date().toISOString(),
    revoke_reason: reason,
  }).eq("id", id);

  await db.from("audit_events").insert({
    actor_id:   user.id,
    action:     "api_key.revoked",
    resource:   `api_key:${id}`,
    metadata:   { key_name: key.name, reason },
    api_key_id: id,
  }).maybeSingle();

  return NextResponse.json({ ok: true });
}
