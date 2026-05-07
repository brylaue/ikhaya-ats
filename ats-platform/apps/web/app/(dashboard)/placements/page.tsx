"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  BadgeCheck,
  TrendingUp,
  DollarSign,
  Clock,
  Loader2,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  BarChart2,
  List,
  FileText,
  Plus,
  ArrowUpRight,
  Calendar,
  Building2,
  Briefcase,
  Download,
} from "lucide-react";
import { cn, formatSalary, getInitials, generateAvatarColor } from "@/lib/utils";
import { usePlacements, type PlacementRecord } from "@/lib/supabase/hooks";
import { toast } from "sonner";
import { PlacementAnniversariesCard } from "@/components/alerts/placement-anniversaries-card"; // US-231
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

// Re-use the shared PlacementRecord type from hooks; alias Placement locally for readability
type Placement = PlacementRecord;
type InvoiceStatus = PlacementRecord["invoiceStatus"];

interface PaymentLogModal {
  placementId: string;
  feeAmount: number;
  amountCollected: number;
  currency: string;
}


const MONTHLY_REVENUE = [
  { month: "Nov",  fees: 28000, collected: 28000 },
  { month: "Dec",  fees: 41000, collected: 41000 },
  { month: "Jan",  fees: 41000, collected: 41000 },
  { month: "Feb",  fees: 83000, collected: 83000 },
  { month: "Mar",  fees: 110500, collected: 62500 },
  { month: "Apr",  fees: 127000, collected: 0 },
];

// ─── Config ───────────────────────────────────────────────────────────────────

const INVOICE_CFG: Record<InvoiceStatus, { label: string; bg: string; text: string; dot: string }> = {
  pending:  { label: "Pending",   bg: "bg-slate-100",   text: "text-slate-600",  dot: "bg-slate-400"   },
  invoiced: { label: "Invoiced",  bg: "bg-amber-100",   text: "text-amber-700",  dot: "bg-amber-500"   },
  partial:  { label: "Partial",   bg: "bg-brand-100",    text: "text-brand-700",   dot: "bg-brand-500"    },
  paid:     { label: "Paid",      bg: "bg-emerald-100", text: "text-emerald-700",dot: "bg-emerald-500" },
};

// ─── Payment log modal ────────────────────────────────────────────────────────

function PaymentModal({
  placement,
  onLog,
  onClose,
}: {
  placement: PaymentLogModal;
  onLog: (amount: number, date: string) => void;
  onClose: () => void;
}) {
  const outstanding = placement.feeAmount - placement.amountCollected;
  const [amount, setAmount] = useState(outstanding.toString());
  const [date, setDate]     = useState(new Date().toISOString().split("T")[0]);

  const parsed = parseFloat(amount) || 0;
  const isFullPayment = parsed >= outstanding;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-card shadow-2xl p-5">
        <h2 className="text-sm font-semibold text-foreground mb-1">Log Payment</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Outstanding: {formatSalary(outstanding, placement.currency)}
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Amount Received</label>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
              <input
                autoFocus
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-lg border border-border bg-background pl-6 pr-3 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Payment Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>

        {isFullPayment && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
            <p className="text-xs font-medium text-emerald-700">This will mark the placement as fully paid.</p>
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-lg border border-border py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors">
            Cancel
          </button>
          <button
            onClick={() => { onLog(parsed, date); onClose(); }}
            disabled={parsed <= 0}
            className="flex-1 rounded-lg bg-brand-600 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            Log Payment
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Invoice status modal ─────────────────────────────────────────────────────

function MarkInvoicedModal({
  placement,
  onMark,
  onClose,
}: {
  placement: { id: string; feeAmount: number; currency: string; clientName: string };
  onMark: (invoiceNumber: string, invoiceDate: string) => void;
  onClose: () => void;
}) {
  const today = new Date().toISOString().split("T")[0];
  const [invoiceNumber, setInvoiceNumber] = useState(`INV-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 900) + 100)}`);
  const [invoiceDate, setInvoiceDate]     = useState(today);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-card shadow-2xl p-5">
        <h2 className="text-sm font-semibold text-foreground mb-1">Mark as Invoiced</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Invoice {formatSalary(placement.feeAmount, placement.currency)} to {placement.clientName}
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Invoice Number</label>
            <input
              autoFocus
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-1 block">Invoice Date</label>
            <input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-lg border border-border py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors">
            Cancel
          </button>
          <button
            onClick={() => { onMark(invoiceNumber, invoiceDate); onClose(); }}
            className="flex-1 rounded-lg bg-brand-600 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
          >
            Mark Invoiced
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Placement row ────────────────────────────────────────────────────────────

function PlacementRow({
  p,
  onMarkInvoiced,
  onLogPayment,
}: {
  p: Placement;
  onMarkInvoiced: (id: string) => void;
  onLogPayment: (id: string) => void;
}) {
  const cfg        = INVOICE_CFG[p.invoiceStatus];
  const outstanding = p.feeAmount - p.amountCollected;
  const daysSince  = Math.floor((Date.now() - new Date(p.placedAt).getTime()) / 86_400_000);
  const startFmt   = new Date(p.startDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="grid grid-cols-[1fr_1fr_140px_120px_160px] items-center gap-4 border-b border-border px-5 py-3.5 hover:bg-accent/30 transition-colors">
      {/* Candidate + job */}
      <div className="flex items-center gap-3 min-w-0">
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white", generateAvatarColor(p.candidateId))}>
          {getInitials(p.candidateName)}
        </div>
        <div className="min-w-0">
          <Link href={`/candidates/${p.candidateId}`} className="text-sm font-semibold text-foreground hover:text-brand-600 transition-colors truncate block">
            {p.candidateName}
          </Link>
          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
            <Link href={`/jobs/${p.jobId}`} className="truncate hover:text-foreground transition-colors">{p.jobTitle}</Link>
          </div>
        </div>
      </div>

      {/* Client + start */}
      <div className="min-w-0">
        <p className="text-sm text-foreground truncate flex items-center gap-1">
          <Building2 className="h-3 w-3 shrink-0 text-muted-foreground" />
          {p.clientName}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
          <Calendar className="h-3 w-3 shrink-0" />
          Start {startFmt} · {daysSince}d ago
        </p>
      </div>

      {/* Fee */}
      <div>
        <p className="text-sm font-semibold text-foreground">{formatSalary(p.feeAmount, p.currency)}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {p.feeType === "percentage" ? `${p.feePercentage}% of salary` : "Flat fee"}
          {p.invoiceNumber ? ` · ${p.invoiceNumber}` : ""}
        </p>
      </div>

      {/* Invoice status */}
      <div>
        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold", cfg.bg, cfg.text)}>
          <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
          {cfg.label}
        </span>
        {p.invoiceStatus === "partial" && (
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {formatSalary(outstanding, p.currency)} outstanding
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2">
        {p.invoiceStatus === "pending" && (
          <button
            onClick={() => onMarkInvoiced(p.id)}
            className="flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-100 transition-colors"
          >
            <FileText className="h-3 w-3" />
            Invoice
          </button>
        )}
        {(p.invoiceStatus === "invoiced" || p.invoiceStatus === "partial") && (
          <button
            onClick={() => onLogPayment(p.id)}
            className="flex items-center gap-1 rounded-md border border-brand-200 bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700 hover:bg-brand-100 transition-colors"
          >
            <DollarSign className="h-3 w-3" />
            Log Payment
          </button>
        )}
        {p.invoiceStatus === "paid" && (
          <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Paid in full
          </span>
        )}
        <Link
          href={`/candidates/${p.candidateId}`}
          className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}

// ─── Custom tooltip for chart ─────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string; fill: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card p-2.5 shadow-lg text-xs">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="text-muted-foreground">
          {p.name === "fees" ? "Fees billed" : "Collected"}: <span className="font-semibold text-foreground">{formatSalary(p.value, "USD", true)}</span>
        </p>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = "placements" | "analytics";

export default function PlacementsPage() {
  const { placements, loading, markInvoiced, logPayment } = usePlacements();
  const [activeTab, setActiveTab]   = useState<Tab>("placements");
  const [filterStatus, setFilterStatus] = useState<InvoiceStatus | "all">("all");
  const [invoicingId, setInvoicingId]   = useState<string | null>(null);
  const [paymentId, setPaymentId]       = useState<string | null>(null);

  // ── KPIs ─────────────────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const totalFees      = placements.reduce((s, p) => s + p.feeAmount, 0);
    const totalCollected = placements.reduce((s, p) => s + p.amountCollected, 0);
    const outstanding    = totalFees - totalCollected;
    const pending        = placements.filter((p) => p.invoiceStatus === "pending").reduce((s, p) => s + p.feeAmount, 0);
    return { totalFees, totalCollected, outstanding, pending };
  }, [placements]);

  // ── Filtered list ─────────────────────────────────────────────────────────────

  const filtered = useMemo(
    () => filterStatus === "all" ? placements : placements.filter((p) => p.invoiceStatus === filterStatus),
    [placements, filterStatus]
  );

  // ── Analytics ─────────────────────────────────────────────────────────────────

  const byClient = useMemo(() => {
    const map: Record<string, { name: string; fees: number; count: number }> = {};
    placements.forEach((p) => {
      if (!map[p.clientId]) map[p.clientId] = { name: p.clientName, fees: 0, count: 0 };
      map[p.clientId].fees  += p.feeAmount;
      map[p.clientId].count += 1;
    });
    return Object.values(map).sort((a, b) => b.fees - a.fees);
  }, [placements]);

  const byRecruiter = useMemo(() => {
    const map: Record<string, { name: string; fees: number; count: number }> = {};
    placements.forEach((p) => {
      if (!map[p.recruiterName]) map[p.recruiterName] = { name: p.recruiterName, fees: 0, count: 0 };
      map[p.recruiterName].fees  += p.feeAmount;
      map[p.recruiterName].count += 1;
    });
    return Object.values(map).sort((a, b) => b.fees - a.fees);
  }, [placements]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  async function handleMarkInvoiced(id: string, invoiceNumber: string, invoiceDate: string) {
    await markInvoiced(id, invoiceNumber, invoiceDate);
    toast.success("Invoice recorded");
  }

  async function handleLogPayment(id: string, amount: number, _date: string) {
    await logPayment(id, amount);
    toast.success("Payment logged");
  }

  function handleExportCSV() {
    const rows = filtered;
    const headers = ["Candidate","Title","Client","Job","Placed On","Start Date","Fee Amount","Currency","Fee Type","Invoice Status","Amount Collected","Recruiter"];
    const csvRows = rows.map((p) => [
      p.candidateName, p.candidateTitle, p.clientName, p.jobTitle,
      p.placedAt.slice(0, 10), p.startDate ?? "",
      p.feeAmount, p.currency, p.feeType,
      p.invoiceStatus, p.amountCollected, p.recruiterName,
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const csv = [headers.join(","), ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `placements-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV downloaded");
  }

  const invoicingPlacement = placements.find((p) => p.id === invoicingId);
  const paymentPlacement   = placements.find((p) => p.id === paymentId);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">Placements</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Fee tracking and revenue management</p>
          </div>
          <button onClick={handleExportCSV} className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors">
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-4 gap-4 mb-4">
          {[
            {
              label: "Total Fees (YTD)",
              value: formatSalary(kpis.totalFees, "USD"),
              sub: `${placements.length} placements`,
              icon: TrendingUp,
              color: "text-brand-600",
              bg: "bg-brand-50",
            },
            {
              label: "Collected",
              value: formatSalary(kpis.totalCollected, "USD"),
              sub: `${Math.round((kpis.totalCollected / kpis.totalFees) * 100)}% of billed`,
              icon: CheckCircle2,
              color: "text-emerald-600",
              bg: "bg-emerald-50",
            },
            {
              label: "Outstanding",
              value: formatSalary(kpis.outstanding, "USD"),
              sub: placements.filter((p) => p.invoiceStatus !== "paid").length + " invoices",
              icon: AlertCircle,
              color: "text-amber-600",
              bg: "bg-amber-50",
            },
            {
              label: "Pending Invoice",
              value: formatSalary(kpis.pending, "USD"),
              sub: placements.filter((p) => p.invoiceStatus === "pending").length + " placements",
              icon: Clock,
              color: "text-slate-600",
              bg: "bg-slate-50",
            },
          ].map((kpi) => {
            const Icon = kpi.icon;
            return (
              <div key={kpi.label} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">{kpi.label}</span>
                  <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg", kpi.bg)}>
                    <Icon className={cn("h-3.5 w-3.5", kpi.color)} />
                  </div>
                </div>
                <p className="text-xl font-bold text-foreground">{kpi.value}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{kpi.sub}</p>
              </div>
            );
          })}
        </div>

        {/* Tabs */}
        <div className="flex gap-0">
          {([
            { key: "placements", label: "Placements", icon: BadgeCheck },
            { key: "analytics",  label: "Analytics",  icon: BarChart2  },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors",
                activeTab === key
                  ? "border-brand-600 text-brand-600"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">

        {/* ── Placements tab ──────────────────────────────────────────────── */}
        {activeTab === "placements" && (
          <div>
            {/* US-231: Placement anniversaries & backfill alerts */}
            <div className="px-5 pt-4">
              <PlacementAnniversariesCard limit={6} />
            </div>

            {/* Filter bar */}
            <div className="flex items-center gap-2 border-b border-border bg-background px-5 py-2.5">
              <List className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground mr-1">Filter:</span>
              {(["all", "pending", "invoiced", "partial", "paid"] as const).map((s) => {
                const cfg = s === "all" ? null : INVOICE_CFG[s];
                return (
                  <button
                    key={s}
                    onClick={() => setFilterStatus(s)}
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors",
                      filterStatus === s
                        ? s === "all"
                          ? "bg-brand-600 text-white"
                          : cn(cfg!.bg, cfg!.text, "ring-1 ring-current/20")
                        : "bg-muted/50 text-muted-foreground hover:bg-accent"
                    )}
                  >
                    {s === "all" ? `All (${placements.length})` : (
                      `${cfg!.label} (${placements.filter((p) => p.invoiceStatus === s).length})`
                    )}
                  </button>
                );
              })}
            </div>

            {/* Table header */}
            <div className="grid grid-cols-[1fr_1fr_140px_120px_160px] gap-4 border-b border-border bg-muted/30 px-5 py-2">
              {["Candidate / Role", "Client / Start", "Fee", "Status", ""].map((h) => (
                <p key={h} className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{h}</p>
              ))}
            </div>

            {/* Rows */}
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3">
                  <BadgeCheck className="h-5 w-5 text-muted-foreground/50" />
                </div>
                <p className="text-sm font-semibold text-foreground">
                  {placements.length === 0 ? "No placements yet" : "No matches"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground max-w-xs">
                  {placements.length === 0
                    ? "Placements appear here when you close a candidate in their pipeline."
                    : "Try adjusting the status filter."}
                </p>
              </div>
            ) : (
              filtered.map((p) => (
                <PlacementRow
                  key={p.id}
                  p={p}
                  onMarkInvoiced={(id) => setInvoicingId(id)}
                  onLogPayment={(id) => setPaymentId(id)}
                />
              ))
            )}
          </div>
        )}

        {/* ── Analytics tab ───────────────────────────────────────────────── */}
        {activeTab === "analytics" && (
          <div className="p-6 space-y-6 max-w-4xl mx-auto">

            {/* Monthly revenue chart */}
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-foreground">Monthly Revenue</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Fees billed vs. collected — last 6 months</p>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={MONTHLY_REVENUE} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v) => `$${v / 1000}k`} tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="fees"      name="fees"      fill="#6366f1" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="collected" name="collected" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4 mt-2">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="h-2.5 w-2.5 rounded-sm bg-indigo-500" />Fees billed
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />Collected
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              {/* By client */}
              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="text-sm font-semibold text-foreground mb-3">Revenue by Client</h3>
                <div className="space-y-3">
                  {byClient.map((c, i) => {
                    const maxFee = byClient[0].fees;
                    return (
                      <div key={c.name}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-foreground">{c.name}</span>
                          <span className="text-xs text-muted-foreground">{formatSalary(c.fees, "USD", true)} · {c.count} placement{c.count > 1 ? "s" : ""}</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-brand-500 transition-all"
                            style={{ width: `${(c.fees / maxFee) * 100}%`, opacity: 1 - i * 0.2 }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* By recruiter */}
              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="text-sm font-semibold text-foreground mb-3">Revenue by Recruiter</h3>
                <div className="space-y-3">
                  {byRecruiter.map((r) => (
                    <div key={r.name} className="flex items-center gap-3">
                      <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white", generateAvatarColor(r.name))}>
                        {getInitials(r.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-foreground">{r.name}</span>
                          <span className="text-xs font-semibold text-foreground">{formatSalary(r.fees, "USD", true)}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">{r.count} placement{r.count > 1 ? "s" : ""}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Average fee */}
                <div className="mt-4 rounded-lg bg-brand-50 border border-brand-100 px-3 py-2">
                  <p className="text-xs text-brand-700">
                    <span className="font-semibold">Avg. placement fee: </span>
                    {formatSalary(Math.round(kpis.totalFees / placements.length), "USD")}
                  </p>
                </div>
              </div>
            </div>

            {/* Upcoming payments / at risk */}
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-sm font-semibold text-foreground mb-1">Pending Actions</h3>
              <p className="text-xs text-muted-foreground mb-3">Placements that need invoicing or payment follow-up</p>
              <div className="space-y-2">
                {placements
                  .filter((p) => p.invoiceStatus !== "paid")
                  .sort((a, b) => new Date(a.placedAt).getTime() - new Date(b.placedAt).getTime())
                  .map((p) => {
                    const cfg      = INVOICE_CFG[p.invoiceStatus];
                    const daysSince = Math.floor((Date.now() - new Date(p.placedAt).getTime()) / 86_400_000);
                    const isOverdue = daysSince > 30 && p.invoiceStatus === "pending";
                    return (
                      <div key={p.id} className={cn(
                        "flex items-center justify-between rounded-lg border px-3 py-2.5 transition-colors",
                        isOverdue ? "border-red-200 bg-red-50" : "border-border bg-background hover:bg-accent/30"
                      )}>
                        <div className="flex items-center gap-3 min-w-0">
                          {isOverdue && <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />}
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-foreground truncate">{p.candidateName} → {p.clientName}</p>
                            <p className="text-[10px] text-muted-foreground">{formatSalary(p.feeAmount - p.amountCollected, p.currency)} outstanding · {daysSince}d since placement</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", cfg.bg, cfg.text)}>
                            {cfg.label}
                          </span>
                          <Link href={`/placements/${p.id}`} className="flex items-center gap-0.5 text-[11px] font-medium text-brand-600 hover:text-brand-700">
                            <ArrowUpRight className="h-3 w-3" />
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                {placements.filter((p) => p.invoiceStatus !== "paid").length === 0 && (
                  <p className="py-4 text-center text-xs text-muted-foreground">All placements fully paid 🎉</p>
                )}
              </div>
            </div>

          </div>
        )}
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}

      {invoicingPlacement && (
        <MarkInvoicedModal
          placement={invoicingPlacement}
          onMark={(num, date) => { handleMarkInvoiced(invoicingPlacement.id, num, date); setInvoicingId(null); }}
          onClose={() => setInvoicingId(null)}
        />
      )}

      {paymentPlacement && (
        <PaymentModal
          placement={{
            placementId:      paymentPlacement.id,
            feeAmount:        paymentPlacement.feeAmount,
            amountCollected:  paymentPlacement.amountCollected,
            currency:         paymentPlacement.currency,
          }}
          onLog={(amount, date) => { handleLogPayment(paymentPlacement.id, amount, date); setPaymentId(null); }}
          onClose={() => setPaymentId(null)}
        />
      )}
    </div>
  );
}
