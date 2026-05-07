/**
 * PATCH/DELETE /api/email-filter-rules/[id]
 * US-053. Admins can edit any rule; users can only edit their own personal
 * rules (RLS on the table already blocks cross-agency edits; we add the
 * "personal-vs-agency" check here).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAgencyContext } from "@/lib/supabase/agency-cache";
import { checkCsrf } from "@/lib/csrf";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfError = checkCsrf(req); if (csrfError) return csrfError;
  const { id } = await params;
  const supabase = await createClient();
  const ctx = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Load the rule to see ownership
  const { data: existing } = await supabase
    .from("email_filter_rules").select("id, user_id").eq("id", id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const isMine = existing.user_id === ctx.userId;
  if (!isMine && !["admin","owner"].includes(ctx.role)) {
    return NextResponse.json({ error: "Not allowed to edit agency-wide rules" }, { status: 403 });
  }

  const b = await req.json().catch(() => ({})) as Record<string, unknown>;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof b.name === "string")     patch.name = b.name.slice(0, 200);
  if (typeof b.priority === "number") patch.priority = b.priority;
  if (typeof b.enabled === "boolean") patch.enabled = b.enabled;
  if (b.match && typeof b.match === "object") patch.match = b.match;
  if (typeof b.tag === "string")      patch.tag = b.tag.slice(0, 80);

  const { data, error } = await supabase
    .from("email_filter_rules").update(patch).eq("id", id).select().maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rule: data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfError = checkCsrf(req); if (csrfError) return csrfError;
  const { id } = await params;
  const supabase = await createClient();
  const ctx = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: existing } = await supabase
    .from("email_filter_rules").select("id, user_id").eq("id", id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.user_id !== ctx.userId && !["admin","owner"].includes(ctx.role)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  const { error } = await supabase.from("email_filter_rules").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
