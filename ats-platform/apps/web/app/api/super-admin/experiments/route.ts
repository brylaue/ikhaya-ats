/**
 * GET   /api/super-admin/experiments        — list all experiments + assignment counts
 * POST  /api/super-admin/experiments        — create new experiment
 *
 * US-511: Admin CRUD for A/B tests / percentage rollouts.
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
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true as const, user };
}

export async function GET(_req: NextRequest) {
  const auth = await checkAdmin();
  if (!auth.ok) return auth.response;

  const db = createServiceClient();

  const [expsRes, assignRes] = await Promise.all([
    db.from("experiments").select("*").order("created_at", { ascending: false }),
    db.from("experiment_assignments").select("experiment_id, variant_key"),
  ]);
  if (expsRes.error) return NextResponse.json({ error: expsRes.error.message }, { status: 500 });

  // Group assignment counts per experiment + variant
  const counts: Record<string, Record<string, number>> = {};
  for (const a of assignRes.data ?? []) {
    counts[a.experiment_id] = counts[a.experiment_id] ?? {};
    counts[a.experiment_id][a.variant_key] = (counts[a.experiment_id][a.variant_key] ?? 0) + 1;
  }

  const rows = (expsRes.data ?? []).map((e: any) => ({
    ...e,
    assignmentsTotal: Object.values(counts[e.id] ?? {}).reduce((s: number, n) => s + (n as number), 0),
    assignmentsByVariant: counts[e.id] ?? {},
  }));

  return NextResponse.json({ experiments: rows });
}

export async function POST(req: NextRequest) {
  const auth = await checkAdmin();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const required = ["key", "name", "variants"];
  for (const k of required) if (!body[k]) return NextResponse.json({ error: `Missing field: ${k}` }, { status: 400 });

  // Sanity-check variants
  if (!Array.isArray(body.variants) || body.variants.length < 2) {
    return NextResponse.json({ error: "Need at least two variants" }, { status: 400 });
  }
  for (const v of body.variants) {
    if (!v.key || typeof v.weight !== "number") {
      return NextResponse.json({ error: "Each variant needs key + numeric weight" }, { status: 400 });
    }
  }

  const db = createServiceClient();
  const { data, error } = await db.from("experiments").insert({
    key:              body.key,
    name:             body.name,
    description:      body.description ?? null,
    variants:         body.variants,
    rollout_pct:      body.rollout_pct ?? 100,
    target_plans:     body.target_plans ?? null,
    agency_allowlist: body.agency_allowlist ?? null,
    agency_denylist:  body.agency_denylist ?? null,
    status:           body.status ?? "draft",
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ experiment: data });
}
