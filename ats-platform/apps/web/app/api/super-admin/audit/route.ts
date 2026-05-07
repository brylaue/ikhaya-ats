/**
 * GET /api/super-admin/audit
 * US-461: Cross-org audit log — paginated, filterable by agency / action.
 *
 * Query params:
 *   agencyId  – filter to one org (optional)
 *   action    – partial match on action string (optional)
 *   page      – 0-indexed page (default 0)
 *   limit     – page size (default 50, max 200)
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !SUPER_ADMIN_EMAILS.includes(user.email.toLowerCase())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const agencyId = searchParams.get("agencyId") ?? undefined;
  const action   = searchParams.get("action")   ?? undefined;
  const page     = Math.max(0, parseInt(searchParams.get("page")  ?? "0", 10));
  const limit    = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));
  const from     = page * limit;
  const to       = from + limit - 1;

  const db = createServiceClient();

  let query = db
    .from("audit_log")
    .select(
      "id, agency_id, user_id, action, resource_type, resource_id, detail, performed_at, agencies(name)",
      { count: "exact" }
    )
    .order("performed_at", { ascending: false })
    .range(from, to);

  if (agencyId) query = query.eq("agency_id", agencyId);
  if (action)   query = query.ilike("action", `%${action}%`);

  const { data: events, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    events: events ?? [],
    total:  count  ?? 0,
    page,
    limit,
  });
}
