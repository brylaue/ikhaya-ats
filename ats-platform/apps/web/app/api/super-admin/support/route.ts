/**
 * GET /api/super-admin/support
 * US-467: Per-tenant support ticket linkage.
 *
 * Returns tickets joined to tenant name + aggregate counts. Tickets are
 * upserted into support_tickets via webhook from external CS tools
 * (Zendesk/Intercom/Linear) — see /api/webhooks/support.
 *
 * Optional ?status=open|pending|solved|closed (default: open + pending)
 *          ?agencyId={id}
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const SUPER_ADMIN_EMAILS = (process.env.SUPER_ADMIN_EMAILS ?? "")
  .split(",").map(e => e.trim().toLowerCase()).filter(Boolean);

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email || !SUPER_ADMIN_EMAILS.includes(user.email.toLowerCase())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const status   = req.nextUrl.searchParams.get("status");
  const agencyId = req.nextUrl.searchParams.get("agencyId");
  const db = createServiceClient();

  let q = db.from("support_tickets").select("*").order("opened_at", { ascending: false }).limit(500);
  if (status)   q = q.eq("status", status);
  else          q = q.in("status", ["open", "pending"]);
  if (agencyId) q = q.eq("agency_id", agencyId);

  const ticketsRes = await q;
  if (ticketsRes.error) return NextResponse.json({ error: ticketsRes.error.message }, { status: 500 });

  const tickets = ticketsRes.data ?? [];
  const agencyIds = Array.from(new Set(tickets.map(t => t.agency_id)));

  const { data: agencies } = agencyIds.length
    ? await db.from("agencies").select("id, name").in("id", agencyIds)
    : { data: [] };
  const nameMap = new Map((agencies ?? []).map((a: any) => [a.id, a.name]));

  // Aggregate counts (across ALL tickets, not just filtered) so the cards
  // remain stable when user changes filter.
  const allCountsRes = await db.from("support_tickets").select("status, agency_id");
  const all = allCountsRes.data ?? [];
  const totals = {
    open:    all.filter(t => t.status === "open").length,
    pending: all.filter(t => t.status === "pending").length,
    solved:  all.filter(t => t.status === "solved").length,
    closed:  all.filter(t => t.status === "closed").length,
    tenantsWithOpen: new Set(all.filter(t => ["open","pending"].includes(t.status)).map(t => t.agency_id)).size,
  };

  return NextResponse.json({
    tickets: tickets.map(t => ({
      ...t,
      tenantName: nameMap.get(t.agency_id) ?? "(unknown)",
    })),
    totals,
  });
}
