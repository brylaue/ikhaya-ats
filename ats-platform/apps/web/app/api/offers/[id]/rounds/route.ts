/**
 * /api/offers/[id]/rounds
 * US-201: Offer Negotiation Tracker.
 *
 * Tracks back-and-forth rounds between the agency, the client, and the
 * candidate. Each round captures what was offered, what was countered, and
 * eventually what was accepted or declined.
 *
 * GET  — list rounds for the offer (ordered chronologically).
 * POST — record a new round: { round_type, offered_base_salary?,
 *        offered_equity?, offered_bonus?, countered_base_salary?, notes? }
 *
 * When `round_type = "accepted"`, caller should include accepted_base_salary
 * and we stamp accepted_at. When `round_type = "declined"`, caller should
 * include decline_reason.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAgencyContext } from "@/lib/supabase/agency-cache";
import { checkCsrf } from "@/lib/csrf";

const ROUND_TYPES = new Set(["initial", "counter_candidate", "counter_client", "revised", "accepted", "declined", "withdrawn"]);

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: offerId } = await params;
  const supabase = await createClient();
  const ctx = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("offer_rounds")
    .select(`
      id, round_type, round_index, created_at,
      offered_base_salary, offered_equity, offered_bonus, offered_signing_bonus,
      countered_base_salary, countered_equity, countered_bonus,
      accepted_base_salary, accepted_at, decline_reason,
      notes, created_by
    `)
    .eq("offer_id", offerId)
    .order("round_index", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rounds: data ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfError = checkCsrf(req); if (csrfError) return csrfError;
  const { id: offerId } = await params;
  const supabase = await createClient();
  const ctx = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const b = await req.json().catch(() => ({})) as Record<string, unknown>;
  if (typeof b.round_type !== "string" || !ROUND_TYPES.has(b.round_type)) {
    return NextResponse.json({ error: `round_type must be one of ${[...ROUND_TYPES].join("|")}` }, { status: 400 });
  }

  // Compute next round_index — one monotonically increasing number per offer.
  const { data: last } = await supabase
    .from("offer_rounds")
    .select("round_index")
    .eq("offer_id", offerId)
    .order("round_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextIdx = ((last?.round_index as number | undefined) ?? 0) + 1;

  const n = (k: string) => typeof b[k] === "number" ? b[k] as number : null;
  const row: Record<string, unknown> = {
    agency_id:             ctx.agencyId,
    offer_id:              offerId,
    round_type:            b.round_type,
    round_index:           nextIdx,
    offered_base_salary:   n("offered_base_salary"),
    offered_equity:        n("offered_equity"),
    offered_bonus:         n("offered_bonus"),
    offered_signing_bonus: n("offered_signing_bonus"),
    countered_base_salary: n("countered_base_salary"),
    countered_equity:      n("countered_equity"),
    countered_bonus:       n("countered_bonus"),
    accepted_base_salary:  n("accepted_base_salary"),
    decline_reason:        typeof b.decline_reason === "string" ? (b.decline_reason as string).slice(0, 500) : null,
    notes:                 typeof b.notes === "string" ? (b.notes as string).slice(0, 2000) : null,
    created_by:            ctx.userId,
  };
  if (b.round_type === "accepted") row.accepted_at = new Date().toISOString();

  const { data, error } = await supabase.from("offer_rounds").insert(row).select().maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ round: data });
}
