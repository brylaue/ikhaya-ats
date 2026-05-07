/**
 * /api/invoices
 * US-105: A/R & DSO Dashboard.
 *
 * GET  — list invoices with filters (status, company, from, to, overdue_only).
 * POST — create invoice { company_id, placement_id?, invoice_number, issued_at,
 *                        due_at, amount, currency?, notes? }
 *
 * This is the recruiter-facing list. The aging dashboard is served from
 * /api/invoices/aging (uses the invoices_aging_view built in migration 069).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAgencyContext } from "@/lib/supabase/agency-cache";
import { checkCsrf } from "@/lib/csrf";

const STATUSES = new Set(["draft", "sent", "partial", "paid", "void"]);

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const ctx = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const p = req.nextUrl.searchParams;
  let q = supabase.from("invoices")
    .select("id, invoice_number, company_id, placement_id, status, issued_at, due_at, amount, paid_amount, currency, notes, created_at")
    .order("due_at", { ascending: true })
    .limit(Math.min(500, Math.max(1, parseInt(p.get("limit") ?? "200", 10) || 200)));

  if (p.get("status") && STATUSES.has(p.get("status")!)) q = q.eq("status", p.get("status")!);
  if (p.get("company_id"))    q = q.eq("company_id", p.get("company_id")!);
  if (p.get("from") && /^\d{4}-\d{2}-\d{2}$/.test(p.get("from")!)) q = q.gte("issued_at", p.get("from")!);
  if (p.get("to")   && /^\d{4}-\d{2}-\d{2}$/.test(p.get("to")!))   q = q.lte("issued_at", p.get("to")!);
  if (p.get("overdue_only") === "1") {
    const today = new Date().toISOString().slice(0, 10);
    q = q.lt("due_at", today).in("status", ["sent", "partial"]);
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ invoices: data ?? [] });
}

export async function POST(req: NextRequest) {
  const csrfError = checkCsrf(req); if (csrfError) return csrfError;
  const supabase = await createClient();
  const ctx = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const b = await req.json().catch(() => ({})) as Record<string, unknown>;
  const required = ["company_id", "invoice_number", "issued_at", "due_at", "amount"];
  for (const k of required) {
    if (b[k] === undefined || b[k] === null || b[k] === "") {
      return NextResponse.json({ error: `${k} required` }, { status: 400 });
    }
  }
  const amount = Number(b.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    return NextResponse.json({ error: "amount must be a non-negative number" }, { status: 400 });
  }

  const row = {
    agency_id:       ctx.agencyId,
    company_id:      b.company_id as string,
    placement_id:    typeof b.placement_id === "string" ? b.placement_id : null,
    invoice_number:  (b.invoice_number as string).slice(0, 60),
    status:          "draft",
    issued_at:       b.issued_at as string,
    due_at:          b.due_at as string,
    amount,
    paid_amount:     0,
    currency:        typeof b.currency === "string" ? (b.currency as string).toUpperCase().slice(0, 3) : "USD",
    notes:           typeof b.notes === "string" ? (b.notes as string).slice(0, 2000) : null,
    created_by:      ctx.userId,
  };

  const { data, error } = await supabase.from("invoices").insert(row).select().maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ invoice: data });
}
