/**
 * GET /api/payouts/summary
 * US-106: Backs the admin payouts page. Returns:
 *   - rows: per-split data enriched with candidate / company / recruiter
 *   - perRecruiter: aggregated totals by user+currency for the filtered window
 *   - totals: grand totals across all rows
 *
 * Same date-window defaults as /export (prior month). No grouping switch —
 * the UI does the pivoting; this endpoint gives it the raw payable splits.
 *
 * Unlike /export, this one DOES include `held` when explicitly asked via
 * `status=held` — the UI surfaces them in a separate tab so admins can
 * resolve disputes (release the hold or confirm cancellation).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAgencyContext } from "@/lib/supabase/agency-cache";
import { requirePlan } from "@/lib/api/require-plan";

type PayoutStatus = "pending" | "approved" | "paid" | "held";
const ALL_STATUSES: readonly PayoutStatus[] = ["pending", "approved", "paid", "held"] as const;

function firstDayOfPriorMonth(): string {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
}
function lastDayOfPriorMonth(): string {
  const d = new Date(); d.setDate(0);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const ctx      = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // US-513: commission tracking is Pro-tier.
  const planGuard = await requirePlan(supabase, ctx.agencyId, "commission_split_tracking");
  if (planGuard) return planGuard;

  if (!["admin", "owner"].includes(ctx.role)) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const p = req.nextUrl.searchParams;
  const from = p.get("from") ?? firstDayOfPriorMonth();
  const to   = p.get("to")   ?? lastDayOfPriorMonth();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
  }

  const statusParam = p.get("status");
  const statuses: PayoutStatus[] = statusParam
    ? statusParam.split(",").map((s) => s.trim()).filter((s): s is PayoutStatus => (ALL_STATUSES as readonly string[]).includes(s))
    : ["pending", "approved", "paid"]; // default hides held from the main view

  if (statuses.length === 0) {
    return NextResponse.json({ error: "No valid statuses" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("commission_splits")
    .select(`
      id, split_pct, amount, role, payout_status, paid_at, notes, created_at,
      placement_id,
      user:users(id, full_name, email),
      placement:placements(id, placed_at, start_date, fee_amount, fee_currency,
        candidate:candidates(id, first_name, last_name),
        job:jobs(id, title, company:companies(id, name))
      )
    `)
    .in("payout_status", statuses)
    .gte("placement.placed_at", from)
    .lte("placement.placed_at", to)
    .order("placement(placed_at)", { ascending: false })
    .limit(2000);

  if (error) {
    console.error("[payouts/summary] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = (data ?? []).filter((r: any) => r.placement != null) as Record<string, unknown>[];

  // Flatten to the shape the UI wants.
  const rows = raw.map((r) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const u  = r.user as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pl = r.placement as any;
    const fee   = Number(pl?.fee_amount ?? 0);
    const split = Number(r.amount ?? (fee * Number(r.split_pct ?? 0) / 100));
    return {
      id:              r.id,
      placementId:     r.placement_id,
      placedAt:        pl?.placed_at ?? null,
      startDate:       pl?.start_date ?? null,
      candidateName:   `${pl?.candidate?.first_name ?? ""} ${pl?.candidate?.last_name ?? ""}`.trim(),
      candidateId:     pl?.candidate?.id ?? null,
      companyName:     pl?.job?.company?.name ?? "",
      companyId:       pl?.job?.company?.id ?? null,
      jobTitle:        pl?.job?.title ?? "",
      jobId:           pl?.job?.id ?? null,
      recruiterId:     u?.id ?? null,
      recruiterName:   u?.full_name ?? "",
      recruiterEmail:  u?.email ?? "",
      role:            r.role,
      splitPct:        Number(r.split_pct ?? 0),
      splitAmount:     split,
      feeAmount:       fee,
      currency:        pl?.fee_currency ?? "USD",
      payoutStatus:    r.payout_status as PayoutStatus,
      paidAt:          r.paid_at ?? null,
      notes:           r.notes ?? null,
    };
  });

  // Aggregate by (recruiter, currency) — the only cut finance actually pays on.
  const map = new Map<string, {
    userId: string; name: string; email: string; currency: string;
    splitsCount: number;
    pending: number; approved: number; paid: number; held: number;
  }>();
  for (const row of rows) {
    if (!row.recruiterId) continue;
    const key = `${row.recruiterId}::${row.currency}`;
    const entry = map.get(key) ?? {
      userId: row.recruiterId, name: row.recruiterName, email: row.recruiterEmail,
      currency: row.currency, splitsCount: 0,
      pending: 0, approved: 0, paid: 0, held: 0,
    };
    entry.splitsCount += 1;
    entry[row.payoutStatus] += row.splitAmount;
    map.set(key, entry);
  }
  const perRecruiter = Array.from(map.values())
    .sort((a, b) => (b.approved + b.paid + b.pending) - (a.approved + a.paid + a.pending));

  // Totals (use the first currency observed — mixed-currency tables are rare
  // and the UI highlights them separately; for a first cut this is fine).
  const totals = rows.reduce((acc, r) => {
    acc.splitsCount += 1;
    acc[r.payoutStatus] += r.splitAmount;
    acc.currencies.add(r.currency);
    return acc;
  }, {
    splitsCount: 0, pending: 0, approved: 0, paid: 0, held: 0,
    currencies: new Set<string>() as Set<string>,
  });

  return NextResponse.json({
    window: { from, to },
    statuses,
    rows,
    perRecruiter,
    totals: {
      splitsCount: totals.splitsCount,
      pending:     totals.pending,
      approved:    totals.approved,
      paid:        totals.paid,
      held:        totals.held,
      currencies:  Array.from(totals.currencies),
    },
  });
}
