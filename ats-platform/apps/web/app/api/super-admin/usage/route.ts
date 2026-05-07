/**
 * GET /api/super-admin/usage
 * US-459: Cross-tenant usage metrics & quota utilisation.
 *
 * Returns per-agency breakdowns: seat usage vs plan limit,
 * job slot utilisation, candidate volume, integrations active,
 * and 30/60/90-day activity trends.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const SUPER_ADMIN_EMAILS = (process.env.SUPER_ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

// Plan seat limits (mirrors feature-flags.ts plan tiers)
const SEAT_LIMITS: Record<string, number> = {
  starter:    5,
  growth:     15,
  pro:        50,
  enterprise: 999,
};

const JOB_LIMITS: Record<string, number> = {
  starter:    10,
  growth:     50,
  pro:        200,
  enterprise: 999,
};

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !SUPER_ADMIN_EMAILS.includes(user.email.toLowerCase())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = createServiceClient();

  const { data: agencies } = await db
    .from("agencies")
    .select("id, name, plan, created_at")
    .order("created_at", { ascending: false });

  if (!agencies || agencies.length === 0) {
    return NextResponse.json({ rows: [] });
  }

  const ids = agencies.map((a: { id: string }) => a.id);
  const now = Date.now();
  const d30 = new Date(now - 30 * 24 * 3600 * 1000).toISOString();
  const d60 = new Date(now - 60 * 24 * 3600 * 1000).toISOString();

  // US-377: rolling 30-day AI spend per agency
  const [usersRes, jobsRes, candidatesRes, sessionsRes30, sessionsRes60, aiUsageRes] = await Promise.all([
    db.from("users").select("agency_id").in("agency_id", ids),
    db.from("jobs").select("agency_id, status").in("agency_id", ids),
    db.from("candidates").select("agency_id").in("agency_id", ids),
    db.from("user_sessions").select("agency_id").in("agency_id", ids).gte("last_active", d30),
    db.from("user_sessions").select("agency_id").in("agency_id", ids).gte("last_active", d60).lt("last_active", d30),
    db
      .from("ai_usage_daily")
      .select("agency_id, total_cost_usd, call_count")
      .in("agency_id", ids)
      .gte("day", d30.slice(0, 10)),
  ]);

  function countBy(rows: Array<{ agency_id: string }>) {
    const m: Record<string, number> = {};
    for (const r of rows ?? []) m[r.agency_id] = (m[r.agency_id] ?? 0) + 1;
    return m;
  }

  const userCounts      = countBy(usersRes.data ?? []);
  const candidateCounts = countBy(candidatesRes.data ?? []);
  const mau30           = countBy(sessionsRes30.data ?? []);
  const mau60           = countBy(sessionsRes60.data ?? []);

  // Active job counts per agency
  const activeJobCounts: Record<string, number> = {};
  for (const j of jobsRes.data ?? []) {
    if (j.status === "open" || j.status === "active") {
      activeJobCounts[j.agency_id] = (activeJobCounts[j.agency_id] ?? 0) + 1;
    }
  }

  // US-377: sum rolling 30d AI spend + call counts per agency
  const aiCostByAgency:  Record<string, number> = {};
  const aiCallsByAgency: Record<string, number> = {};
  for (const r of (aiUsageRes.data ?? []) as Array<{
    agency_id: string; total_cost_usd: number | string; call_count: number;
  }>) {
    aiCostByAgency[r.agency_id]  = (aiCostByAgency[r.agency_id]  ?? 0) + Number(r.total_cost_usd ?? 0);
    aiCallsByAgency[r.agency_id] = (aiCallsByAgency[r.agency_id] ?? 0) + Number(r.call_count     ?? 0);
  }

  const rows = agencies.map((a: { id: string; name: string; plan: string; created_at: string }) => {
    const seats      = userCounts[a.id]       ?? 0;
    const seatLimit  = SEAT_LIMITS[a.plan]    ?? 999;
    const activeJobs = activeJobCounts[a.id]  ?? 0;
    const jobLimit   = JOB_LIMITS[a.plan]     ?? 999;

    return {
      id:            a.id,
      name:          a.name,
      plan:          a.plan,
      seats,
      seatLimit,
      seatPct:       seatLimit < 999 ? Math.round((seats / seatLimit) * 100) : null,
      activeJobs,
      jobLimit,
      jobPct:        jobLimit < 999 ? Math.round((activeJobs / jobLimit) * 100) : null,
      candidates:    candidateCounts[a.id] ?? 0,
      mau30:         mau30[a.id] ?? 0,
      mau60:         mau60[a.id] ?? 0,
      // US-377: AI cost visibility (rolling 30d)
      aiCost30dUsd:  Math.round((aiCostByAgency[a.id]  ?? 0) * 10000) / 10000,
      aiCalls30d:    aiCallsByAgency[a.id] ?? 0,
      createdAt:     a.created_at,
    };
  });

  return NextResponse.json({ rows });
}
