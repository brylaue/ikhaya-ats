/**
 * GET /api/compliance/external-ai-audit
 * US-444: External AI access audit (admin/compliance only).
 *
 * When recruiters use external MCP/OAuth clients (Claude Desktop, custom
 * Claude Agent SDK jobs, etc.) to drive our API, each call writes to audit_log
 * with oauth_client_id, tool_name, prompt_hash, model_name (columns added in
 * migration 069). This endpoint slices that data for compliance:
 *   - Which external clients touched which data?
 *   - Most-used tools, most-common models
 *   - Daily call counts
 *
 * Filters: from, to, oauth_client_id, tool_name, model_name.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAgencyContext } from "@/lib/supabase/agency-cache";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const ctx = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["admin", "owner", "compliance"].includes(ctx.role)) {
    return NextResponse.json({ error: "Admin/owner/compliance only" }, { status: 403 });
  }

  const p = req.nextUrl.searchParams;
  let q = supabase.from("audit_log")
    .select("id, created_at, actor_user_id, oauth_client_id, oauth_client_name, tool_name, prompt_hash, model_name, action, entity_type, entity_id")
    .not("oauth_client_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(Math.min(1000, Math.max(1, parseInt(p.get("limit") ?? "500", 10) || 500)));

  if (p.get("from") && /^\d{4}-\d{2}-\d{2}$/.test(p.get("from")!)) q = q.gte("created_at", p.get("from")!);
  if (p.get("to")   && /^\d{4}-\d{2}-\d{2}$/.test(p.get("to")!))   q = q.lte("created_at", `${p.get("to")}T23:59:59Z`);
  if (p.get("oauth_client_id")) q = q.eq("oauth_client_id", p.get("oauth_client_id")!);
  if (p.get("tool_name"))       q = q.eq("tool_name",       p.get("tool_name")!);
  if (p.get("model_name"))      q = q.eq("model_name",      p.get("model_name")!);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Rollups
  const byClient = new Map<string, { name: string | null; calls: number }>();
  const byTool   = new Map<string, number>();
  const byModel  = new Map<string, number>();
  const byDay    = new Map<string, number>();

  for (const r of data ?? []) {
    const cid = (r.oauth_client_id as string) || "unknown";
    const cur = byClient.get(cid) ?? { name: (r.oauth_client_name as string | null) ?? null, calls: 0 };
    cur.calls += 1;
    byClient.set(cid, cur);
    if (r.tool_name)  byTool.set(r.tool_name  as string, (byTool.get(r.tool_name  as string) ?? 0) + 1);
    if (r.model_name) byModel.set(r.model_name as string, (byModel.get(r.model_name as string) ?? 0) + 1);
    const day = (r.created_at as string).slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }

  return NextResponse.json({
    events: data ?? [],
    rollups: {
      by_client: Array.from(byClient.entries())
        .map(([id, v]) => ({ oauth_client_id: id, oauth_client_name: v.name, calls: v.calls }))
        .sort((a, b) => b.calls - a.calls),
      by_tool:  Array.from(byTool.entries()) .map(([k, v]) => ({ tool_name:  k, calls: v })).sort((a, b) => b.calls - a.calls),
      by_model: Array.from(byModel.entries()).map(([k, v]) => ({ model_name: k, calls: v })).sort((a, b) => b.calls - a.calls),
      by_day:   Array.from(byDay.entries())  .map(([k, v]) => ({ day: k, calls: v })).sort((a, b) => a.day.localeCompare(b.day)),
    },
  });
}
