/**
 * GET /api/super-admin/stats
 * US-455: Platform-wide aggregate stats for the super admin overview.
 * Uses service-role client to bypass RLS.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const SUPER_ADMIN_EMAILS = (process.env.SUPER_ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email || !SUPER_ADMIN_EMAILS.includes(user.email.toLowerCase())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = createServiceClient();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { count: totalOrgs },
    { count: totalUsers },
    { count: totalJobs },
    { count: totalCandidates },
    { count: totalApplications },
    { count: totalPlacements },
    { count: mau },
  ] = await Promise.all([
    db.from("agencies").select("*", { count: "exact", head: true }),
    db.from("users").select("*", { count: "exact", head: true }),
    db.from("jobs").select("*", { count: "exact", head: true }),
    db.from("candidates").select("*", { count: "exact", head: true }),
    db.from("applications").select("*", { count: "exact", head: true }),
    db.from("placements").select("*", { count: "exact", head: true }),
    db.from("user_sessions")
      .select("*", { count: "exact", head: true })
      .gte("last_active", thirtyDaysAgo),
  ]);

  return NextResponse.json({
    totalOrgs:         totalOrgs         ?? 0,
    totalUsers:        totalUsers        ?? 0,
    totalJobs:         totalJobs         ?? 0,
    totalCandidates:   totalCandidates   ?? 0,
    totalApplications: totalApplications ?? 0,
    totalPlacements:   totalPlacements   ?? 0,
    mau:               mau               ?? 0,
  });
}
