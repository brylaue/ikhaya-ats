/**
 * POST /api/playbooks/[id]/read
 * US-094: Mark a playbook as read by the current user.
 *
 * Idempotent — reading the same playbook twice in a session doesn't inflate
 * counts. read_count on the playbooks row is maintained by a trigger on
 * playbook_reads (defined in migration 069).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAgencyContext } from "@/lib/supabase/agency-cache";
import { checkCsrf } from "@/lib/csrf";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfError = checkCsrf(req); if (csrfError) return csrfError;
  const { id } = await params;
  const supabase = await createClient();
  const ctx = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("playbook_reads")
    .upsert({
      agency_id:   ctx.agencyId,
      playbook_id: id,
      user_id:     ctx.userId,
    }, { onConflict: "playbook_id,user_id", ignoreDuplicates: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
