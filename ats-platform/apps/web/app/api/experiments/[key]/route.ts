/**
 * GET /api/experiments/[key]
 * US-511: Resolve current user's variant for an experiment.
 *
 * Used by client `useExperiment(key)` hook. Reads agency context, sticky
 * assigns via lib/experiments/assign.ts, returns { variant }.
 *
 * Returns { variant: null } when the experiment doesn't exist or the user
 * isn't in scope — caller treats this as "control / not enrolled".
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAgencyContext } from "@/lib/supabase/agency-cache";
import { resolveExperiment } from "@/lib/experiments/assign";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  const supabase = await createClient();
  const ctx = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ variant: null }, { status: 200 });

  // Plan needed for targeting
  const { data: agency } = await supabase.from("agencies").select("plan").eq("id", ctx.agencyId).single();
  if (!agency) return NextResponse.json({ variant: null });

  const variant = await resolveExperiment(supabase, key, {
    agencyId: ctx.agencyId,
    userId:   ctx.userId,
    plan:     agency.plan,
  });

  return NextResponse.json({ variant });
}
