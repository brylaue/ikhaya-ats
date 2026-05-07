/**
 * GET /api/super-admin/tenants/[id]
 * US-457: Per-tenant detail — org info, users, usage, integrations, recent audit events.
 * Uses service-role client to bypass RLS.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const SUPER_ADMIN_EMAILS = (process.env.SUPER_ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email || !SUPER_ADMIN_EMAILS.includes(user.email.toLowerCase())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = createServiceClient();
  const id = params.id;

  // Fetch agency + related data in parallel
  const [
    agencyRes,
    usersRes,
    jobsRes,
    candidatesRes,
    applicationsRes,
    placementsRes,
    connectionsRes,
    auditRes,
    dsarRes,
    supportTicketsRes,
    healthRes,
  ] = await Promise.all([
    db.from("agencies").select("id, name, domain, plan, created_at, plan_expires_at").eq("id", id).single(),
    db.from("users").select("id, first_name, last_name, email, role, last_login_at, is_active").eq("agency_id", id).order("last_login_at", { ascending: false }),
    db.from("jobs").select("id", { count: "exact", head: true }).eq("agency_id", id),
    db.from("candidates").select("id", { count: "exact", head: true }).eq("agency_id", id),
    db.from("applications").select("id", { count: "exact", head: true }).eq("agency_id", id),
    db.from("placements").select("id", { count: "exact", head: true }).eq("agency_id", id),
    db.from("provider_connections").select("provider, status").eq("agency_id", id).eq("is_active", true),
    db.from("audit_log").select("id, action, resource_type, performed_at, detail").eq("agency_id", id).order("performed_at", { ascending: false }).limit(10),
    db.from("dsars").select("id", { count: "exact", head: true }).eq("agency_id", id).not("status", "in", '("fulfilled","denied","withdrawn")'),
    // US-467: most recent open/pending support tickets
    db.from("support_tickets").select("id, subject, status, priority, opened_at, external_url")
      .eq("agency_id", id).in("status", ["open","pending"]).order("opened_at", { ascending: false }).limit(5),
    // US-465: latest health snapshot
    db.from("tenant_health_latest").select("overall_score, risk_band, computed_at").eq("agency_id", id).maybeSingle(),
  ]);

  if (agencyRes.error || !agencyRes.data) {
    return NextResponse.json({ error: "Agency not found" }, { status: 404 });
  }

  return NextResponse.json({
    agency:       agencyRes.data,
    users:        usersRes.data ?? [],
    jobCount:     jobsRes.count         ?? 0,
    candidateCount: candidatesRes.count ?? 0,
    applicationCount: applicationsRes.count ?? 0,
    placementCount: placementsRes.count ?? 0,
    integrations:  connectionsRes.data ?? [],
    auditEvents:   auditRes.data ?? [],
    openDsarCount: dsarRes.count ?? 0,
    supportTickets: supportTicketsRes.data ?? [],
    health:         healthRes.data ?? null,
  });
}
