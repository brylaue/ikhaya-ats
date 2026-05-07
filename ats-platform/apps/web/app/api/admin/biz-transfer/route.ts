/**
 * POST /api/admin/biz-transfer — US-093: Book-of-Business Transfer
 *
 * Bulk-reassigns all records owned by one user to another within the same agency.
 * Admin/owner gated. Creates an audit record in biz_transfers.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAgencyContext } from "@/lib/supabase/agency-cache";
import { checkCsrf } from "@/lib/csrf";

export async function POST(req: NextRequest) {
  try {
    const csrfErr = checkCsrf(req);
    if (csrfErr) return csrfErr;

    const supabase = await createClient();
    const ctx = await getAgencyContext(supabase);
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!["admin", "owner"].includes(ctx.role)) {
      return NextResponse.json({ error: "Admin required" }, { status: 403 });
    }

    const { fromUserId, toUserId, dualOwnerDays } = await req.json();
    if (!fromUserId || !toUserId || fromUserId === toUserId) {
      return NextResponse.json({ error: "Invalid user IDs" }, { status: 400 });
    }

    // Verify both users belong to this agency
    const { count: memberCount } = await supabase
      .from("agency_users")
      .select("*", { count: "exact", head: true })
      .eq("agency_id", ctx.agencyId)
      .in("user_id", [fromUserId, toUserId]);

    if ((memberCount ?? 0) < 2) {
      return NextResponse.json({ error: "Users must belong to same agency" }, { status: 403 });
    }

    // Create transfer record
    const { data: transfer, error: createErr } = await supabase
      .from("biz_transfers")
      .insert({
        agency_id:        ctx.agencyId,
        from_user_id:     fromUserId,
        to_user_id:       toUserId,
        initiated_by:     ctx.userId,
        status:           "executing",
        dual_owner_days:  dualOwnerDays ?? null,
        dual_owner_until: dualOwnerDays
          ? new Date(Date.now() + dualOwnerDays * 86_400_000).toISOString()
          : null,
      })
      .select()
      .single();

    if (createErr) throw createErr;

    // Execute bulk reassignment — all parallel, all scoped to agency.
    // Count rows via .data?.length since count option isn't accepted after .update().
    const [candRes, jobRes, clientRes, taskRes] = await Promise.all([
      supabase.from("candidates")
        .update({ owner_id: toUserId })
        .eq("agency_id", ctx.agencyId).eq("owner_id", fromUserId)
        .select("id"),

      supabase.from("jobs")
        .update({ owner_id: toUserId })
        .eq("agency_id", ctx.agencyId).eq("owner_id", fromUserId)
        .select("id"),

      supabase.from("companies")
        .update({ owner_id: toUserId })
        .eq("agency_id", ctx.agencyId).eq("owner_id", fromUserId)
        .select("id"),

      supabase.from("tasks")
        .update({ assignee_id: toUserId })
        .eq("org_id", ctx.agencyId).eq("assignee_id", fromUserId)
        .select("id"),
    ]);

    // Mark completed with final counts
    await supabase.from("biz_transfers").update({
      status:                 "completed",
      completed_at:           new Date().toISOString(),
      candidates_transferred: candRes.data?.length ?? 0,
      jobs_transferred:       jobRes.data?.length ?? 0,
      clients_transferred:    clientRes.data?.length ?? 0,
      tasks_transferred:      taskRes.data?.length ?? 0,
    }).eq("id", transfer.id);

    return NextResponse.json({
      transferId:  transfer.id,
      candidates:  candRes.count ?? 0,
      jobs:        jobRes.count ?? 0,
      clients:     clientRes.count ?? 0,
      tasks:       taskRes.count ?? 0,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** GET /api/admin/biz-transfer — list recent transfers */
export async function GET() {
  try {
    const supabase = await createClient();
    const ctx = await getAgencyContext(supabase);
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!["admin", "owner"].includes(ctx.role)) {
      return NextResponse.json({ error: "Admin required" }, { status: 403 });
    }
    const { data } = await supabase
      .from("biz_transfers")
      .select("*")
      .eq("agency_id", ctx.agencyId)
      .order("created_at", { ascending: false })
      .limit(20);
    return NextResponse.json(data ?? []);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
