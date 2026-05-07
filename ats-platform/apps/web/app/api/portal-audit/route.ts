/**
 * GET /api/portal-audit
 * US-046: Client Portal Audit Trail — recruiter-facing read.
 *
 * Query: from, to, job_id?, company_id?, event_type?, limit (max 500, default 200)
 * Returns: events + aggregate avg response time per event_type.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAgencyContext } from "@/lib/supabase/agency-cache";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const ctx = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const p = req.nextUrl.searchParams;
  const limit = Math.min(500, Math.max(1, parseInt(p.get("limit") ?? "200", 10) || 200));
  const from = p.get("from");
  const to   = p.get("to");

  let q = supabase.from("client_portal_events")
    .select("id, created_at, event_type, decision, duration_seconds, portal_user_email, company_id, job_id, candidate_id, metadata")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) q = q.gte("created_at", from);
  if (to   && /^\d{4}-\d{2}-\d{2}$/.test(to))   q = q.lte("created_at", `${to}T23:59:59Z`);
  if (p.get("job_id"))      q = q.eq("job_id",     p.get("job_id")!);
  if (p.get("company_id"))  q = q.eq("company_id", p.get("company_id")!);
  if (p.get("event_type"))  q = q.eq("event_type", p.get("event_type")!);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Aggregate — avg duration by event type (for "how long does the client
  // usually look at a candidate before deciding?")
  const byType = new Map<string, { count: number; sum_dur: number }>();
  for (const e of (data ?? [])) {
    const key = e.event_type as string;
    const agg = byType.get(key) ?? { count: 0, sum_dur: 0 };
    agg.count += 1;
    agg.sum_dur += (e.duration_seconds ?? 0);
    byType.set(key, agg);
  }
  const aggregates = Array.from(byType.entries()).map(([event_type, v]) => ({
    event_type,
    count: v.count,
    avg_duration_seconds: v.count > 0 ? Math.round(v.sum_dur / v.count) : null,
  }));

  return NextResponse.json({ events: data ?? [], aggregates });
}
