/**
 * DELETE /api/client-invites/[id]  — revoke a portal invite
 *
 * US-475: Revoking an invite sets `revoked_at`. The invite link becomes
 * invalid and the recruiter can re-invite if needed.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@/lib/supabase/server";
import { getAgencyContext }          from "@/lib/supabase/agency-cache";
import { checkCsrf }                 from "@/lib/csrf";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const ctx      = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("client_portal_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", params.id)
    .eq("agency_id", ctx.agencyId); // RLS + extra check

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
