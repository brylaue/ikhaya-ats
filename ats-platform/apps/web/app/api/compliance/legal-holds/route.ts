/**
 * /api/compliance/legal-holds
 * US-414: Legal Hold / Compliance Hold.
 *
 * Applies a hold on a candidate / job / company — while active it blocks
 * auto-deletion (enforced by the `assert_not_legally_held` Postgres function
 * in migration 069). Designed to be called by the compliance officer UI.
 *
 * GET   — list (filter: entity_type, entity_id, active=1)
 * POST  — create a new hold
 *         body: { entity_type, entity_id, reason, case_ref?, holds_until?: 'YYYY-MM-DD' }
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAgencyContext } from "@/lib/supabase/agency-cache";
import { checkCsrf } from "@/lib/csrf";

const ENTITY_TYPES = ["candidate","job","company"] as const;
type EntityType = typeof ENTITY_TYPES[number];

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const ctx = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["admin","owner","compliance"].includes(ctx.role)) {
    return NextResponse.json({ error: "Compliance access required" }, { status: 403 });
  }

  const p = req.nextUrl.searchParams;
  let q = supabase.from("legal_holds").select("*").order("created_at", { ascending: false }).limit(500);
  if (p.get("entity_type"))  q = q.eq("entity_type", p.get("entity_type")!);
  if (p.get("entity_id"))    q = q.eq("entity_id",   p.get("entity_id")!);
  if (p.get("active") === "1") q = q.is("released_at", null);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ holds: data ?? [] });
}

export async function POST(req: NextRequest) {
  const csrfError = checkCsrf(req); if (csrfError) return csrfError;
  const supabase = await createClient();
  const ctx = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["admin","owner","compliance"].includes(ctx.role)) {
    return NextResponse.json({ error: "Compliance access required" }, { status: 403 });
  }

  const b = await req.json().catch(() => ({})) as Record<string, unknown>;
  if (typeof b.entity_type !== "string" || !(ENTITY_TYPES as readonly string[]).includes(b.entity_type))
    return NextResponse.json({ error: "Invalid entity_type" }, { status: 400 });
  if (typeof b.entity_id !== "string" || b.entity_id.length < 30)
    return NextResponse.json({ error: "Invalid entity_id" }, { status: 400 });
  if (typeof b.reason !== "string" || b.reason.trim().length < 3)
    return NextResponse.json({ error: "reason is required" }, { status: 400 });
  const holds_until = typeof b.holds_until === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.holds_until)
    ? b.holds_until : null;

  const { data, error } = await supabase
    .from("legal_holds")
    .insert({
      agency_id:   ctx.agencyId,
      entity_type: b.entity_type as EntityType,
      entity_id:   b.entity_id,
      reason:      (b.reason as string).slice(0, 4000),
      case_ref:    typeof b.case_ref === "string" ? (b.case_ref).slice(0, 200) : null,
      holds_until,
      created_by:  ctx.userId,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ hold: data });
}
