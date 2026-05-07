/**
 * /api/bd/close-reasons
 * US-158: BD Win/Loss Reason taxonomy (per-agency).
 *
 * GET   — list all reason codes for the agency (both win and loss).
 * POST  — upsert a reason code: { code, label, kind: "win"|"loss", sort_order?, active? }
 *
 * Reason codes are short machine tokens (e.g. "price", "no_exclusivity",
 * "better_relationship"). Agencies tune these to fit how they actually lose
 * deals so the analytics views have decent signal.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAgencyContext } from "@/lib/supabase/agency-cache";
import { checkCsrf } from "@/lib/csrf";
import { requirePlan } from "@/lib/api/require-plan";

export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const ctx = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // US-513: BD suite is Pro tier.
  const planGuard = await requirePlan(supabase, ctx.agencyId, "business_development");
  if (planGuard) return planGuard;

  const { data, error } = await supabase
    .from("bd_close_reason_taxonomy")
    .select("id, code, label, kind, sort_order, active, created_at")
    .order("kind", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reasons: data ?? [] });
}

export async function POST(req: NextRequest) {
  const csrfError = checkCsrf(req); if (csrfError) return csrfError;
  const supabase = await createClient();
  const ctx = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // US-513: BD suite is Pro tier.
  const planGuard = await requirePlan(supabase, ctx.agencyId, "business_development");
  if (planGuard) return planGuard;

  if (!["admin", "owner"].includes(ctx.role)) {
    return NextResponse.json({ error: "Admin/owner only" }, { status: 403 });
  }

  const b = await req.json().catch(() => ({})) as {
    code?: unknown; label?: unknown; kind?: unknown;
    sort_order?: unknown; active?: unknown;
  };
  const code  = typeof b.code === "string"  ? b.code.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 40) : "";
  const label = typeof b.label === "string" ? b.label.trim().slice(0, 200) : "";
  const kind  = b.kind === "win" || b.kind === "loss" ? b.kind : null;
  if (!code || !label || !kind) {
    return NextResponse.json({ error: "code, label, and kind (win|loss) are required" }, { status: 400 });
  }

  const row = {
    agency_id:  ctx.agencyId,
    code,
    label,
    kind,
    sort_order: typeof b.sort_order === "number" ? b.sort_order : 100,
    active:     typeof b.active === "boolean" ? b.active : true,
  };

  const { data, error } = await supabase
    .from("bd_close_reason_taxonomy")
    .upsert(row, { onConflict: "agency_id,code" })
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reason: data });
}
