/**
 * GET /api/invoices/aging
 * US-105: A/R & DSO Dashboard — aggregate summary.
 *
 * Reads invoices_aging_view (defined in migration 069) and returns:
 *  - buckets: { current, 1_30, 31_60, 61_90, 91_plus } totals (unpaid)
 *  - dso:     days-sales-outstanding estimate
 *  - top_overdue: top 10 oldest unpaid invoices
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAgencyContext } from "@/lib/supabase/agency-cache";

export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const ctx = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("invoices_aging_view")
    .select("id, invoice_number, company_id, issued_at, due_at, amount, paid_amount, outstanding, age_days, bucket, currency");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const buckets: Record<string, number> = { current: 0, "1_30": 0, "31_60": 0, "61_90": 0, "91_plus": 0 };
  let totalSent = 0;
  let totalOutstanding = 0;
  const rows = data ?? [];

  for (const r of rows) {
    const bucket = r.bucket as string;
    const outstanding = Number(r.outstanding ?? 0);
    if (bucket in buckets) buckets[bucket] += outstanding;
    totalOutstanding += outstanding;
    totalSent += Number(r.amount ?? 0);
  }

  // DSO ≈ (avg outstanding) * (days in period) / (billings in period).
  // Approximate using last 90 days of invoices.
  const since = new Date(Date.now() - 90 * 86400 * 1000);
  const recent = rows.filter((r) => new Date(r.issued_at as string) >= since);
  const recentBillings = recent.reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const dso = recentBillings > 0 ? Math.round((totalOutstanding * 90) / recentBillings) : null;

  const topOverdue = rows
    .filter((r) => Number(r.outstanding ?? 0) > 0)
    .sort((a, b) => Number(b.age_days ?? 0) - Number(a.age_days ?? 0))
    .slice(0, 10);

  return NextResponse.json({
    buckets,
    totals: { outstanding: totalOutstanding, billed: totalSent, invoice_count: rows.length },
    dso_days: dso,
    top_overdue: topOverdue,
  });
}
