/**
 * Super-admin data hooks — US-455–US-462
 *
 * Server-side only. All functions use the service-role client so they
 * bypass RLS and can query across all tenant agencies.
 *
 * NEVER import this file into client components or edge functions.
 * It relies on SUPABASE_SERVICE_ROLE_KEY which must stay server-side.
 */

import { createServiceClient } from "./service";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TenantSummary {
  id:             string;
  name:           string;
  domain:         string | null;
  plan:           string;
  userCount:      number;
  jobCount:       number;
  candidateCount: number;
  lastActivityAt: string | null;
  createdAt:      string;
}

export interface PlatformStats {
  totalOrgs:         number;
  totalUsers:        number;
  totalJobs:         number;
  totalCandidates:   number;
  totalApplications: number;
  totalPlacements:   number;
  mau:               number;
}

export interface UsageRow {
  id:          string;
  name:        string;
  plan:        string;
  seats:       number;
  seatLimit:   number;
  seatPct:     number | null;
  activeJobs:  number;
  jobLimit:    number;
  jobPct:      number | null;
  candidates:  number;
  mau30:       number;
  mau60:       number;
}

export interface AuditEvent {
  id:            string;
  agency_id:     string;
  user_id:       string | null;
  action:        string;
  resource_type: string | null;
  resource_id:   string | null;
  detail:        Record<string, unknown> | null;
  performed_at:  string;
}

// ─── Plan limits ──────────────────────────────────────────────────────────────

export const SEAT_LIMITS: Record<string, number> = {
  starter:    5,
  growth:     15,
  pro:        50,
  enterprise: 999,
};

export const JOB_LIMITS: Record<string, number> = {
  starter:    10,
  growth:     50,
  pro:        200,
  enterprise: 999,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function countBy(rows: Array<{ agency_id: string }>): Record<string, number> {
  const m: Record<string, number> = {};
  for (const r of rows) m[r.agency_id] = (m[r.agency_id] ?? 0) + 1;
  return m;
}

function latestBy(
  rows: Array<{ agency_id: string; last_active: string }>
): Record<string, string> {
  const m: Record<string, string> = {};
  for (const r of rows) {
    if (!m[r.agency_id] || r.last_active > m[r.agency_id]) {
      m[r.agency_id] = r.last_active;
    }
  }
  return m;
}

// ─── getPlatformStats (US-455) ────────────────────────────────────────────────

export async function getPlatformStats(): Promise<PlatformStats> {
  const db = createServiceClient();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

  const [
    { count: totalOrgs },
    { count: totalUsers },
    { count: totalJobs },
    { count: totalCandidates },
    { count: totalApplications },
    { count: totalPlacements },
    { count: mau },
  ] = await Promise.all([
    db.from("agencies").select("*",      { count: "exact", head: true }),
    db.from("users").select("*",         { count: "exact", head: true }),
    db.from("jobs").select("*",          { count: "exact", head: true }),
    db.from("candidates").select("*",    { count: "exact", head: true }),
    db.from("applications").select("*",  { count: "exact", head: true }),
    db.from("placements").select("*",    { count: "exact", head: true }),
    db.from("user_sessions").select("*", { count: "exact", head: true }).gte("last_active", thirtyDaysAgo),
  ]);

  return {
    totalOrgs:         totalOrgs         ?? 0,
    totalUsers:        totalUsers        ?? 0,
    totalJobs:         totalJobs         ?? 0,
    totalCandidates:   totalCandidates   ?? 0,
    totalApplications: totalApplications ?? 0,
    totalPlacements:   totalPlacements   ?? 0,
    mau:               mau               ?? 0,
  };
}

// ─── getAllTenants (US-456) ───────────────────────────────────────────────────

export async function getAllTenants(): Promise<TenantSummary[]> {
  const db = createServiceClient();

  const { data: agencies } = await db
    .from("agencies")
    .select("id, name, domain, plan, created_at")
    .order("created_at", { ascending: false });

  if (!agencies || agencies.length === 0) return [];

  const ids = agencies.map((a: { id: string }) => a.id);

  const [usersRes, jobsRes, candidatesRes, activityRes] = await Promise.all([
    db.from("users").select("agency_id").in("agency_id", ids),
    db.from("jobs").select("agency_id").in("agency_id", ids),
    db.from("candidates").select("agency_id").in("agency_id", ids),
    db.from("user_sessions").select("agency_id, last_active").in("agency_id", ids).order("last_active", { ascending: false }),
  ]);

  const userCounts      = countBy(usersRes.data ?? []);
  const jobCounts       = countBy(jobsRes.data ?? []);
  const candidateCounts = countBy(candidatesRes.data ?? []);
  const lastActivity    = latestBy(activityRes.data ?? []);

  return agencies.map((a: { id: string; name: string; domain: string | null; plan: string; created_at: string }) => ({
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
}

// ─── getUsageMetrics (US-459) ─────────────────────────────────────────────────

export async function getUsageMetrics(): Promise<UsageRow[]> {
  const db  = createServiceClient();
  const now = Date.now();
  const d30 = new Date(now - 30 * 24 * 3600 * 1000).toISOString();
  const d60 = new Date(now - 60 * 24 * 3600 * 1000).toISOString();

  const { data: agencies } = await db
    .from("agencies")
    .select("id, name, plan, created_at")
    .order("created_at", { ascending: false });

  if (!agencies || agencies.length === 0) return [];

  const ids = agencies.map((a: { id: string }) => a.id);

  const [usersRes, jobsRes, candidatesRes, mau30Res, mau60Res] = await Promise.all([
    db.from("users").select("agency_id").in("agency_id", ids),
    db.from("jobs").select("agency_id, status").in("agency_id", ids),
    db.from("candidates").select("agency_id").in("agency_id", ids),
    db.from("user_sessions").select("agency_id").in("agency_id", ids).gte("last_active", d30),
    db.from("user_sessions").select("agency_id").in("agency_id", ids).gte("last_active", d60).lt("last_active", d30),
  ]);

  const userCounts      = countBy(usersRes.data ?? []);
  const candidateCounts = countBy(candidatesRes.data ?? []);
  const mau30           = countBy(mau30Res.data ?? []);
  const mau60           = countBy(mau60Res.data ?? []);

  const activeJobCounts: Record<string, number> = {};
  for (const j of jobsRes.data ?? []) {
    if (j.status === "open" || j.status === "active") {
      activeJobCounts[j.agency_id] = (activeJobCounts[j.agency_id] ?? 0) + 1;
    }
  }

  return agencies.map((a: { id: string; name: string; plan: string }) => {
    const seats     = userCounts[a.id]     ?? 0;
    const seatLimit = SEAT_LIMITS[a.plan]  ?? 999;
    const activeJobs = activeJobCounts[a.id] ?? 0;
    const jobLimit  = JOB_LIMITS[a.plan]   ?? 999;
    return {
      id:         a.id,
      name:       a.name,
      plan:       a.plan,
      seats,
      seatLimit,
      seatPct:    seatLimit < 999 ? Math.round((seats / seatLimit) * 100) : null,
      activeJobs,
      jobLimit,
      jobPct:     jobLimit < 999 ? Math.round((activeJobs / jobLimit) * 100) : null,
      candidates: candidateCounts[a.id] ?? 0,
      mau30:      mau30[a.id] ?? 0,
      mau60:      mau60[a.id] ?? 0,
    };
  });
}

// ─── getAuditEvents (US-461) ──────────────────────────────────────────────────

export async function getAuditEvents(opts: {
  agencyId?: string;
  action?:   string;
  page?:     number;
  limit?:    number;
}): Promise<{ events: AuditEvent[]; total: number }> {
  const db    = createServiceClient();
  const page  = opts.page  ?? 0;
  const limit = Math.min(200, opts.limit ?? 50);
  const from  = page * limit;
  const to    = from + limit - 1;

  let q = db
    .from("audit_log")
    .select("id, agency_id, user_id, action, resource_type, resource_id, detail, performed_at", { count: "exact" })
    .order("performed_at", { ascending: false })
    .range(from, to);

  if (opts.agencyId) q = q.eq("agency_id", opts.agencyId);
  if (opts.action)   q = q.ilike("action", `%${opts.action}%`);

  const { data: events, count } = await q;
  return { events: (events as AuditEvent[]) ?? [], total: count ?? 0 };
}

// ─── updateFeatureOverride (US-460) ──────────────────────────────────────────

export async function updateFeatureOverride(
  agencyId: string,
  feature:  string,
  enabled:  boolean | null,
  actorId:  string
): Promise<Record<string, boolean | null>> {
  const db = createServiceClient();

  const { data: agency } = await db
    .from("agencies")
    .select("feature_overrides, name")
    .eq("id", agencyId)
    .single();

  if (!agency) throw new Error("Agency not found");

  const overrides = { ...(agency.feature_overrides ?? {}) } as Record<string, boolean | null>;

  if (enabled === null) {
    delete overrides[feature];
  } else {
    overrides[feature] = enabled;
  }

  await db.from("agencies").update({ feature_overrides: overrides }).eq("id", agencyId);

  await db.from("audit_log").insert({
    agency_id:     agencyId,
    user_id:       actorId,
    action:        "super_admin.feature_flag_update",
    resource_type: "agency",
    resource_id:   agencyId,
    detail:        { feature, enabled, agencyName: agency.name },
    performed_at:  new Date().toISOString(),
  });

  return overrides;
}

// ─── writeSuperAdminAudit (US-458/461) ───────────────────────────────────────

export async function writeSuperAdminAudit(opts: {
  agencyId:    string;
  actorId:     string;
  action:      string;
  resourceType?: string;
  resourceId?:  string;
  detail?:      Record<string, unknown>;
}): Promise<void> {
  const db = createServiceClient();
  await db.from("audit_log").insert({
    agency_id:     opts.agencyId,
    user_id:       opts.actorId,
    action:        opts.action,
    resource_type: opts.resourceType ?? null,
    resource_id:   opts.resourceId   ?? null,
    detail:        opts.detail        ?? null,
    performed_at:  new Date().toISOString(),
  });
}
