/**
 * GET /api/payouts/export
 * US-106: Admin-only CSV export of recruiter payouts.
 *
 * Query params:
 *   - from=YYYY-MM-DD           (inclusive; default = first day of prior month)
 *   - to=YYYY-MM-DD             (inclusive; default = last day of prior month)
 *   - status=approved,paid      (comma-separated allowlist; default 'approved,paid')
 *   - include_pending=1         (shorthand for status=pending,approved,paid — a PREVIEW)
 *   - grouping=split|recruiter  (default 'split' = row per commission_split;
 *                                'recruiter' = one row per user with aggregate totals)
 *
 * **Approval gate**: by default only splits in `approved` or `paid` status ship to
 * the CSV. Finance teams want a clean "payable" file; anything pending or held
 * needs explicit inclusion via `include_pending=1` (clearly labeled "Preview" in
 * the UI). `held` rows are never included — held means "stop the payout, issue
 * under dispute". If an admin really needs to inspect them they can approve the
 * hold first.
 *
 * Output is streamed as text/csv with a sensible download filename. Returned
 * period matches the caller's request so the filename and file content stay in
 * lockstep.
 */

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAgencyContext } from "@/lib/supabase/agency-cache";
import { requirePlan } from "@/lib/api/require-plan";

type PayoutStatus = "pending" | "approved" | "paid" | "held";

const ALLOWED_STATUSES: readonly PayoutStatus[] = ["pending", "approved", "paid"] as const;
// 'held' is deliberately NOT in ALLOWED_STATUSES — held splits are disputed and
// must never ride through an "export & pay" workflow without deliberate action.

function csvQuote(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * US-507: deterministic split-amount computation in integer cents.
 * JS floats don't round-trip common commission maths (e.g. $33,333.33 × 33%
 * gives $11,000.000000000002 which then sums incorrectly across many rows).
 * We keep totals as integer cents internally and only format once for display.
 */
function splitAmountCents(
  feeAmount: unknown,
  splitPct:  unknown,
  explicitAmount: unknown,
): number {
  if (explicitAmount != null && explicitAmount !== "") {
    return Math.round(Number(explicitAmount) * 100);
  }
  const feeCents = Math.round(Number(feeAmount ?? 0) * 100);
  const pct      = Number(splitPct ?? 0);
  // Round to nearest cent after applying percentage so each row is stable.
  return Math.round((feeCents * pct) / 100);
}

function centsToDollars(cents: number): string {
  // Integer division → deterministic "12345.67" regardless of sum ordering.
  const sign = cents < 0 ? "-" : "";
  const abs  = Math.abs(cents);
  const whole = Math.trunc(abs / 100);
  const frac  = (abs % 100).toString().padStart(2, "0");
  return `${sign}${whole}.${frac}`;
}

// US-506: payouts exports previously relied on PostgREST's default 1000-row
// cap and silently truncated for larger agencies. Cap the response at a
// generous but finite size and abort with 413 if exceeded so the user sees
// the truncation instead of a surreptitiously short CSV.
const EXPORT_ROW_LIMIT = 50_000;

function firstDayOfPriorMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
}
function lastDayOfPriorMonth(): string {
  const d = new Date();
  d.setDate(0); // sets to last day of previous month
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const ctx      = await getAgencyContext(supabase);
  if (!ctx) return new Response("Unauthorized", { status: 401 });

  // US-513: commission tracking is Pro-tier — returns 402 with upgrade copy.
  const planGuard = await requirePlan(supabase, ctx.agencyId, "commission_split_tracking");
  if (planGuard) return planGuard;

  // Only admins/owners can pull payout data — it contains aggregated
  // compensation across the whole agency.
  if (!["admin", "owner"].includes(ctx.role)) {
    return new Response("Admin role required", { status: 403 });
  }

  const p = req.nextUrl.searchParams;
  const from = p.get("from") ?? firstDayOfPriorMonth();
  const to   = p.get("to")   ?? lastDayOfPriorMonth();

  // Validate date format — we feed these into SQL via parameterised query but
  // also use them in the filename; reject obvious junk early.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return new Response("Invalid date format — use YYYY-MM-DD", { status: 400 });
  }
  if (from > to) {
    return new Response("'from' must be on or before 'to'", { status: 400 });
  }

  // Status allowlist — default 'approved,paid' (the approval gate).
  const includePending = p.get("include_pending") === "1";
  let statuses: PayoutStatus[];
  if (includePending) {
    statuses = ["pending", "approved", "paid"];
  } else {
    const raw = (p.get("status") ?? "approved,paid").split(",").map((s) => s.trim()) as PayoutStatus[];
    statuses = raw.filter((s): s is PayoutStatus => (ALLOWED_STATUSES as readonly string[]).includes(s));
    if (statuses.length === 0) statuses = ["approved", "paid"];
  }

  const grouping = p.get("grouping") === "recruiter" ? "recruiter" : "split";

  // Join via PostgREST — placements gives us fee context, users gives name/email.
  // We filter on placements.placed_at since "date payable" follows the placement
  // event, not the (frequently-back-dated) start_date.
  const { data, error } = await supabase
    .from("commission_splits")
    .select(`
      id, split_pct, amount, role, payout_status, paid_at, notes, created_at,
      placement_id,
      user:users(id, full_name, email),
      placement:placements(id, placed_at, start_date, fee_amount, fee_currency, fee_type, fee_percentage,
        candidate:candidates(first_name, last_name),
        job:jobs(title, company:companies(name))
      )
    `)
    .in("payout_status", statuses)
    .gte("placement.placed_at", from)
    .lte("placement.placed_at", to)
    .order("placement(placed_at)", { ascending: true })
    // US-506: explicit high cap — we surface 413 below if we actually
    // hit it rather than silently truncating the payable file.
    .limit(EXPORT_ROW_LIMIT + 1);

  if (error) {
    console.error("[payouts/export] query error:", error);
    return new Response("Query failed", { status: 500 });
  }

  if ((data?.length ?? 0) > EXPORT_ROW_LIMIT) {
    return new Response(
      `Export would exceed ${EXPORT_ROW_LIMIT.toLocaleString()} rows — narrow the date window or split by status.`,
      { status: 413 }
    );
  }

  // PostgREST returns rows even when the nested filter doesn't match; drop
  // those client-side (placement will be null for filtered-out placements).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []).filter((r: any) => r.placement != null);

  // ── Per-split CSV ──
  if (grouping === "split") {
    const headers = [
      "placement_id", "placed_at", "start_date",
      "candidate", "company", "job_title",
      "recruiter_name", "recruiter_email", "role",
      "split_pct", "placement_fee", "currency", "split_amount",
      "payout_status", "paid_at", "notes",
    ];
    const body = rows.map((r: Record<string, unknown>) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const u = r.user as any | null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pl = r.placement as any | null;
      const cand  = pl?.candidate;
      const job   = pl?.job;
      const fee   = pl?.fee_amount ?? 0;
      // US-507: integer-cents computation, formatted once at the edge.
      const splitCents = splitAmountCents(fee, r.split_pct, r.amount);
      return [
        r.placement_id, pl?.placed_at?.slice(0, 10) ?? "", pl?.start_date ?? "",
        `${cand?.first_name ?? ""} ${cand?.last_name ?? ""}`.trim(),
        job?.company?.name ?? "", job?.title ?? "",
        u?.full_name ?? "", u?.email ?? "", r.role,
        r.split_pct, fee, pl?.fee_currency ?? "USD", centsToDollars(splitCents),
        r.payout_status,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (r.paid_at as any)?.slice(0, 10) ?? "",
        r.notes ?? "",
      ].map(csvQuote).join(",");
    });
    const csv = [headers.join(","), ...body].join("\r\n") + "\r\n";
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type":        "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="payouts_${from}_to_${to}.csv"`,
        "Cache-Control":       "no-store",
      },
    });
  }

  // ── Per-recruiter aggregate CSV ──
  // Reduces to one row per (user, currency) with summed amounts by status —
  // the shape finance typically wants for payroll upload.
  // US-507: aggregate in integer cents so sums don't drift. Float addition
  // across thousands of splits accumulates rounding error visible in the
  // "total_payable" column — the old code formatted per-row with toFixed(2)
  // but summed in floats, producing $x,xxx.01 discrepancies over large runs.
  interface Agg {
    userId:          string;
    name:            string;
    email:           string;
    currency:        string;
    splitsCount:     number;
    approvedCents:   number;
    paidCents:       number;
    pendingCents:    number;
    oldestPlacedAt:  string | null;
    latestPlacedAt:  string | null;
  }
  const byUser = new Map<string, Agg>();
  for (const r of rows as Record<string, unknown>[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const u  = r.user as any | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pl = r.placement as any | null;
    if (!u) continue;
    const currency = pl?.fee_currency ?? "USD";
    const key = `${u.id}::${currency}`;
    const cents = splitAmountCents(pl?.fee_amount, r.split_pct, r.amount);
    const entry = byUser.get(key) ?? {
      userId: u.id, name: u.full_name ?? "", email: u.email ?? "",
      currency, splitsCount: 0,
      approvedCents: 0, paidCents: 0, pendingCents: 0,
      oldestPlacedAt: null, latestPlacedAt: null,
    };
    entry.splitsCount += 1;
    if (r.payout_status === "approved") entry.approvedCents += cents;
    if (r.payout_status === "paid")     entry.paidCents     += cents;
    if (r.payout_status === "pending")  entry.pendingCents  += cents;
    const placedAt = pl?.placed_at?.slice(0, 10) ?? null;
    if (placedAt) {
      if (!entry.oldestPlacedAt || placedAt < entry.oldestPlacedAt) entry.oldestPlacedAt = placedAt;
      if (!entry.latestPlacedAt || placedAt > entry.latestPlacedAt) entry.latestPlacedAt = placedAt;
    }
    byUser.set(key, entry);
  }

  const headers = [
    "recruiter_name", "recruiter_email", "currency",
    "splits_count", "total_approved", "total_paid", "total_pending",
    "total_payable", "period_from_placed", "period_to_placed",
  ];
  const body = Array.from(byUser.values())
    .sort((a, b) => (b.approvedCents + b.paidCents) - (a.approvedCents + a.paidCents))
    .map((a) => [
      a.name, a.email, a.currency,
      a.splitsCount,
      centsToDollars(a.approvedCents),
      centsToDollars(a.paidCents),
      centsToDollars(a.pendingCents),
      centsToDollars(a.approvedCents + a.paidCents),
      a.oldestPlacedAt ?? "", a.latestPlacedAt ?? "",
    ].map(csvQuote).join(","));

  const csv = [headers.join(","), ...body].join("\r\n") + "\r\n";
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type":        "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="payouts_by_recruiter_${from}_to_${to}.csv"`,
      "Cache-Control":       "no-store",
    },
  });
}
