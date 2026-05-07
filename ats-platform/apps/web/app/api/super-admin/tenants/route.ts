/**
 * GET /api/super-admin/tenants
 * US-456: Returns all agencies with usage stats (service-role, bypasses RLS).
 * Middleware guards this to SUPER_ADMIN_EMAILS.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const SUPER_ADMIN_EMAILS = (process.env.SUPER_ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export async function GET(req: NextRequest) {
  // Verify caller is a super admin
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email || !SUPER_ADMIN_EMAILS.includes(user.email.toLowerCase())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = createServiceClient();

  // Fetch all agencies
  const { data: agencies, error } = await db
    .from("agencies")
    .select("id, name, domain, plan, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!agencies || agencies.length === 0) {
    return NextResponse.json({ tenants: [] });
  }

  const agencyIds = agencies.map((a: { id: string }) => a.id);

  // Parallel counts per agency
  const [usersRes, jobsRes, candidatesRes, activityRes] = await Promise.all([
    db.from("users").select("agency_id").in("agency_id", agencyIds),
    db.from("jobs").select("agency_id").in("agency_id", agencyIds),
    db.from("candidates").select("agency_id").in("agency_id", agencyIds),
    db.from("user_sessions")
      .select("agency_id, last_active")
      .in("agency_id", agencyIds)
      .order("last_active", { ascending: false }),
  ]);

  // Build per-agency maps
  const userCounts      = countByAgency(usersRes.data ?? []);
  const jobCounts       = countByAgency(jobsRes.data ?? []);
  const candidateCounts = countByAgency(candidatesRes.data ?? []);
  const lastActivity    = latestByAgency(activityRes.data ?? []);

  const tenants = agencies.map((a: { id: string; name: string; domain: string | null; plan: string; created_at: string }) => ({
    id:             a.id,
    name:           a.name,
    domain:         a.domain ?? null,
    plan:           a.plan,
    userCount:      userCounts[a.id]      ?? 0,
    jobCount:       jobCounts[a.id]       ?? 0,
    candidateCount: candidateCounts[a.id] ?? 0,
    lastActivityAt: lastActivity[a.id]    ?? null,
    createdAt:      a.created_at,
  }));

  return NextResponse.json({ tenants });
}

function countByAgency(rows: Array<{ agency_id: string }>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.agency_id] = (counts[row.agency_id] ?? 0) + 1;
  }
  return counts;
}

function latestByAgency(rows: Array<{ agency_id: string; last_active: string }>): Record<string, string> {
  const latest: Record<string, string> = {};
  for (const row of rows) {
    if (!latest[row.agency_id] || row.last_active > latest[row.agency_id]) {
      latest[row.agency_id] = row.last_active;
    }
  }
  return latest;
}
