/**
 * /api/bd/close-events
 * US-158: BD Win/Loss Event record.
 *
 * GET  — list close events, filterable by entity (company/job/prospect), kind
 *        (win|loss), date window; includes a rollup by reason_code when
 *        "rollup=1" so the dashboard can render "top 5 loss reasons this quarter"
 *        without a separate endpoint.
 *
 * POST — record one event:
 *        { entity_type, entity_id, kind, reason_code,
 *          competitor_name?, amount?, notes? }
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAgencyContext } from "@/lib/supabase/agency-cache";
import { checkCsrf } from "@/lib/csrf";
import { requirePlan } from "@/lib/api/require-plan";

const ENTITY_TYPES = new Set(["company", "job", "prospect", "candidate"]);

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const ctx = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // US-513: BD suite is Pro tier.
  const planGuard = await requirePlan(supabase, ctx.agencyId, "business_development");
  if (planGuard) return planGuard;

  const p = req.nextUrl.searchParams;
  let q = supabase.from("bd_close_events")
    .select("id, entity_type, entity_id, kind, reason_code, competitor_name, amount, notes, created_at, created_by")
    .order("created_at", { ascending: false })
    .limit(Math.min(500, Math.max(1, parseInt(p.get("limit") ?? "200", 10) || 200)));

  if (p.get("entity_type") && ENTITY_TYPES.has(p.get("entity_type")!)) q = q.eq("entity_type", p.get("entity_type")!);
  if (p.get("entity_id")) q = q.eq("entity_id", p.get("entity_id")!);
  if (p.get("kind") === "win" || p.get("kind") === "loss") q = q.eq("kind", p.get("kind")!);
  if (p.get("from") && /^\d{4}-\d{2}-\d{2}$/.test(p.get("from")!)) q = q.gte("created_at", p.get("from")!);
  if (p.get("to")   && /^\d{4}-\d{2}-\d{2}$/.test(p.get("to")!))   q = q.lte("created_at", `${p.get("to")}T23:59:59Z`);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (p.get("rollup") !== "1") return NextResponse.json({ events: data ?? [] });

  // Aggregate by (kind, reason_code) for dashboard tiles
  const bucket = new Map<string, { kind: string; reason_code: string; count: number; total_amount: number }>();
  for (const e of data ?? []) {
    const key = `${e.kind}|${e.reason_code}`;
    const cur = bucket.get(key) ?? { kind: e.kind as string, reason_code: e.reason_code as string, count: 0, total_amount: 0 };
    cur.count += 1;
    cur.total_amount += Number(e.amount ?? 0);
    bucket.set(key, cur);
  }
  return NextResponse.json({ events: data ?? [], rollup: Array.from(bucket.values()).sort((a, b) => b.count - a.count) });
}

export async function POST(req: NextRequest) {
  const csrfError = checkCsrf(req); if (csrfError) return csrfError;
  const supabase = await createClient();
  const ctx = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // US-513: BD suite is Pro tier.
  const planGuard = await requirePlan(supabase, ctx.agencyId, "business_development");
  if (planGuard) return planGuard;

  const b = await req.json().catch(() => ({})) as {
    entity_type?: unknown; entity_id?: unknown; kind?: unknown;
    reason_code?: unknown; competitor_name?: unknown; amount?: unknown; notes?: unknown;
  };
  if (typeof b.entity_type !== "string" || !ENTITY_TYPES.has(b.entity_type)) {
    return NextResponse.json({ error: "entity_type must be company|job|prospect|candidate" }, { status: 400 });
  }
  if (typeof b.entity_id !== "string") {
    return NextResponse.json({ error: "entity_id required" }, { status: 400 });
  }
  if (b.kind !== "win" && b.kind !== "loss") {
    return NextResponse.json({ error: "kind must be win|loss" }, { status: 400 });
  }
  if (typeof b.reason_code !== "string" || !b.reason_code.trim()) {
    return NextResponse.json({ error: "reason_code required" }, { status: 400 });
  }

  // Validate reason_code belongs to agency & matches kind.
  const { data: taxonomy } = await supabase
    .from("bd_close_reason_taxonomy")
    .select("code, kind")
    .eq("code", b.reason_code)
    .eq("kind", b.kind)
    .eq("active", true)
    .maybeSingle();
  if (!taxonomy) {
    return NextResponse.json({ error: "reason_code not found in active taxonomy for this kind" }, { status: 400 });
  }

  const row = {
    agency_id:        ctx.agencyId,
    entity_type:      b.entity_type,
    entity_id:        b.entity_id,
    kind:             b.kind,
    reason_code:      b.reason_code,
    competitor_name:  typeof b.competitor_name === "string" ? b.competitor_name.slice(0, 200) : null,
    amount:           typeof b.amount === "number" ? b.amount : null,
    notes:            typeof b.notes === "string" ? b.notes.slice(0, 2000) : null,
    created_by:       ctx.userId,
  };
  const { data, error } = await supabase
    .from("bd_close_events").insert(row).select().maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ event: data });
}
