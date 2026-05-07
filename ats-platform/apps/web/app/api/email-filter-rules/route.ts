/**
 * /api/email-filter-rules
 * US-053: Email Rules & Filters.
 *
 * GET   — list rules for the caller's agency (agency-wide + the caller's personal rules)
 * POST  — create rule { name, priority?, match, action, tag?, user_scope? }
 *
 * `user_scope` = 'me' creates a personal rule; otherwise agency-wide (admin-only).
 * `action` ∈ 'ignore' | 'log' | 'log_with_tag' — ingestion code in
 * `/lib/email/ingestion.ts` reads these on every incoming message.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAgencyContext } from "@/lib/supabase/agency-cache";
import { checkCsrf } from "@/lib/csrf";

const ACTIONS = ["ignore","log","log_with_tag"] as const;

export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const ctx = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("email_filter_rules")
    .select("*")
    .or(`user_id.is.null,user_id.eq.${ctx.userId}`)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rules: data ?? [] });
}

export async function POST(req: NextRequest) {
  const csrfError = checkCsrf(req); if (csrfError) return csrfError;
  const supabase = await createClient();
  const ctx = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const b = await req.json().catch(() => ({})) as Record<string, unknown>;
  if (typeof b.name !== "string" || b.name.trim().length === 0)
    return NextResponse.json({ error: "name required" }, { status: 400 });
  if (typeof b.action !== "string" || !(ACTIONS as readonly string[]).includes(b.action))
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  if (typeof b.match !== "object" || b.match === null)
    return NextResponse.json({ error: "match object required" }, { status: 400 });

  const personal = b.user_scope === "me";
  if (!personal && !["admin","owner"].includes(ctx.role)) {
    return NextResponse.json({ error: "Only admins can create agency-wide rules" }, { status: 403 });
  }

  const priority = typeof b.priority === "number" && b.priority >= 0 && b.priority < 10_000
    ? b.priority : 100;
  const tag = b.action === "log_with_tag" && typeof b.tag === "string" ? b.tag.slice(0, 80) : null;

  const { data, error } = await supabase
    .from("email_filter_rules")
    .insert({
      agency_id: ctx.agencyId,
      user_id:   personal ? ctx.userId : null,
      name:      (b.name as string).slice(0, 200),
      priority,
      match:     b.match as Record<string, unknown>,
      action:    b.action,
      tag,
      created_by: ctx.userId,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rule: data });
}

/**
 * POST preview — given a rule AND an array of recent messages, return which
 * would match. Lets the UI offer a "try this rule before I save it" flow.
 * Re-uses the GET route's auth, but via ?preview=1 on POST is arguably weird;
 * instead we key on an explicit preview field in the body.
 */
