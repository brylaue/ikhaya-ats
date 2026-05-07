/**
 * /api/playbooks
 * US-094: Situational Playbooks.
 *
 * GET  — list; filter by context_key (e.g. "stage:debrief", "industry:saas")
 * POST — create { title, body_md, context_keys?: string[], tags?: string[] }
 *
 * Context keys let the pipeline UI pull the right playbook cards when a
 * recruiter is on a particular stage / job type. The GIN index in migration
 * 069 makes `?context_key=stage:debrief` fast even on large libraries.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAgencyContext } from "@/lib/supabase/agency-cache";
import { checkCsrf } from "@/lib/csrf";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const ctx = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const p = req.nextUrl.searchParams;
  let q = supabase.from("playbooks")
    .select("id, title, body_md, context_keys, tags, read_count, created_at, updated_at, created_by")
    .order("updated_at", { ascending: false })
    .limit(Math.min(200, Math.max(1, parseInt(p.get("limit") ?? "100", 10) || 100)));
  if (p.get("context_key")) q = q.contains("context_keys", [p.get("context_key")!]);
  if (p.get("search"))      q = q.ilike("title", `%${p.get("search")}%`);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ playbooks: data ?? [] });
}

export async function POST(req: NextRequest) {
  const csrfError = checkCsrf(req); if (csrfError) return csrfError;
  const supabase = await createClient();
  const ctx = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const b = await req.json().catch(() => ({})) as {
    title?: unknown; body_md?: unknown; context_keys?: unknown; tags?: unknown;
  };
  const title = typeof b.title === "string" ? b.title.trim().slice(0, 200) : "";
  const body_md = typeof b.body_md === "string" ? b.body_md.slice(0, 50000) : "";
  if (!title || !body_md) return NextResponse.json({ error: "title and body_md required" }, { status: 400 });

  const ctxKeys = Array.isArray(b.context_keys)
    ? b.context_keys.filter((x): x is string => typeof x === "string").slice(0, 50)
    : [];
  const tags = Array.isArray(b.tags)
    ? b.tags.filter((x): x is string => typeof x === "string").slice(0, 20)
    : [];

  const { data, error } = await supabase
    .from("playbooks")
    .insert({
      agency_id:    ctx.agencyId,
      title, body_md,
      context_keys: ctxKeys,
      tags,
      created_by:   ctx.userId,
    })
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ playbook: data });
}
