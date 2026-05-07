/**
 * POST /api/webhooks/support
 * US-467: Inbound webhook from Zendesk / Intercom / Linear → support_tickets.
 *
 * Idempotent: upserts on UNIQUE(external_source, external_id).
 *
 * Bearer-token auth via SUPPORT_WEBHOOK_TOKEN. Each external tool gets the
 * same token in env (rotate by changing env var); we don't multi-tenant the
 * token because this is platform-wide ops infra.
 *
 * Expected body shape (normalised at the source via the tool's webhook
 * configuration so we keep one canonical payload):
 *   {
 *     external_source: "zendesk" | "intercom" | "linear",
 *     external_id:     "12345",
 *     external_url:    "https://...",
 *     agency_domain:   "acme.com"  // mapped → agency_id
 *     subject:         "...",
 *     status:          "open" | "pending" | "solved" | "closed",
 *     priority?:       "low" | "normal" | "high" | "urgent",
 *     requester_email?, assignee_email?,
 *     opened_at?:      ISO,
 *     last_updated_at?: ISO,
 *     closed_at?:      ISO,
 *     detail?:         {}
 *   }
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

const SUPPORT_WEBHOOK_TOKEN = process.env.SUPPORT_WEBHOOK_TOKEN ?? "";

export async function POST(req: NextRequest) {
  // Auth
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!SUPPORT_WEBHOOK_TOKEN || token !== SUPPORT_WEBHOOK_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const required = ["external_source","external_id","subject","status","agency_domain"];
  for (const k of required) {
    if (!body[k]) return NextResponse.json({ error: `Missing field: ${k}` }, { status: 400 });
  }
  if (!["zendesk","intercom","linear","manual"].includes(body.external_source)) {
    return NextResponse.json({ error: "Bad external_source" }, { status: 400 });
  }
  if (!["open","pending","solved","closed"].includes(body.status)) {
    return NextResponse.json({ error: "Bad status" }, { status: 400 });
  }

  const db = createServiceClient();

  // Resolve agency by domain
  const { data: agency } = await db.from("agencies").select("id").eq("domain", body.agency_domain).maybeSingle();
  if (!agency?.id) return NextResponse.json({ error: "Unknown agency_domain" }, { status: 404 });

  const row = {
    agency_id:        agency.id,
    external_source:  body.external_source,
    external_id:      body.external_id,
    external_url:     body.external_url ?? null,
    subject:          body.subject,
    status:           body.status,
    priority:         body.priority ?? null,
    requester_email:  body.requester_email ?? null,
    assignee_email:   body.assignee_email ?? null,
    opened_at:        body.opened_at ?? new Date().toISOString(),
    last_updated_at:  body.last_updated_at ?? new Date().toISOString(),
    closed_at:        body.closed_at ?? (["solved","closed"].includes(body.status) ? new Date().toISOString() : null),
    detail:           body.detail ?? {},
  };

  const { data, error } = await db.from("support_tickets")
    .upsert(row, { onConflict: "external_source,external_id" })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data?.id });
}
