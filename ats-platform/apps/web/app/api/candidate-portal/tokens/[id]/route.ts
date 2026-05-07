/**
 * PATCH /api/candidate-portal/tokens/[id]
 *
 * US-241: Recruiter updates a portal token's stage gate setting.
 * `unlockedFromStageOrder` = minimum pipeline stage order at which
 * the candidate can see prep content. 0 = always visible (default).
 *
 * Also supports: revoke (sets revoked_at) and extension of expires_at.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as svc }       from "@supabase/supabase-js";
import { createClient }              from "@/lib/supabase/server";
import { getAgencyContext }          from "@/lib/supabase/agency-cache";
import { checkCsrf }                 from "@/lib/csrf";

const serviceDb = () =>
  svc(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const ctx      = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as {
    unlockedFromStageOrder?: number;
    revoke?:                 boolean;
    expiresAt?:              string;
  };

  const db     = serviceDb();
  const update: Record<string, unknown> = {};

  if (typeof body.unlockedFromStageOrder === "number") {
    update.unlocked_from_stage_order = Math.max(0, Math.floor(body.unlockedFromStageOrder));
  }
  if (body.revoke) {
    update.revoked_at = new Date().toISOString();
  }
  if (body.expiresAt) {
    update.expires_at = body.expiresAt;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true });
  }

  // Verify the token belongs to this agency before updating
  const { data: token } = await db
    .from("candidate_portal_tokens")
    .select("id, agency_id")
    .eq("id", params.id)
    .single();

  if (!token || token.agency_id !== ctx.agencyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { error } = await db
    .from("candidate_portal_tokens")
    .update(update)
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
