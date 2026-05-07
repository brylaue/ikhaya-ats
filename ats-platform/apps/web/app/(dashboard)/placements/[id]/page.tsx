"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, BadgeCheck, DollarSign, Calendar, Building2, Briefcase, User, FileText, CircleCheck as CheckCircle2, Clock, CircleAlert as AlertCircle, CreditCard, CreditCard as Edit3, ExternalLink, TrendingUp } from "lucide-react";
import { usePlacements, type PlacementRecord, type AgencyUser } from "@/lib/supabase/hooks";
import { CommissionSplitsPanel } from "@/components/placements/commission-splits-panel";
import { GuaranteePanel } from "@/components/placements/guarantee-panel";
import { FeatureGate } from "@/components/ui/feature-gate";
import { cn, formatSalary, getInitials, generateAvatarColor } from "@/lib/utils";
import { toast } from "sonner";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const INVOICE_CONFIG: Record<PlacementRecord["invoiceStatus"], { label: string; bg: string; text: string }> = {
  pending:  { label: "Pending",    bg: "bg-amber-100",  text: "text-amber-700"  },
  invoiced: { label: "Invoiced",   bg: "bg-brand-100",   text: "text-brand-700"   },
  partial:  { label: "Partial",    bg: "bg-violet-100", text: "text-violet-700" },
  paid:     { label: "Paid",       bg: "bg-emerald-100",text: "text-emerald-700"},
};

function StatusBadge({ status }: { status: PlacementRecord["invoiceStatus"] }) {
  const cfg = INVOICE_CONFIG[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", cfg.bg, cfg.text)}>
      {status === "paid"     && <CheckCircle2 className="h-3 w-3" />}
      {status === "invoiced" && <FileText className="h-3 w-3" />}
      {status === "partial"  && <Clock className="h-3 w-3" />}
      {status === "pending"  && <AlertCircle className="h-3 w-3" />}
      {cfg.label}
    </span>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-border last:border-0">
      <span className="text-xs font-medium text-muted-foreground shrink-0 w-36">{label}</span>
      <span className="text-sm text-foreground text-right flex-1">{children}</span>
    </div>
  );
}

// ─── Mark Paid Modal ──────────────────────────────────────────────────────────

function MarkPaidModal({
  placement,
  onClose,
  onSave,
}: {
  placement: PlacementRecord;
  onClose: () => void;
  onSave: (amount: number, date: string) => void;
}) {
  const [amount, setAmount] = useState(String(placement.feeAmount - placement.amountCollected));
  const [date, setDate]     = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) { toast.error("Enter a valid amount"); return; }
    setSaving(true);
    setTimeout(() => {
      onSave(num, date);
      onClose();
      setSaving(false);
    }, 300);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-2xl bg-card border border-border shadow-xl p-6">
        <h2 className="mb-4 text-sm font-bold text-foreground">Log Payment</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">Amount ({placement.currency})</label>
            <input
              autoFocus
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">Payment Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors">
              {saving ? "Saving…" : "Log Payment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PlacementDetailPage() {
  const params = useParams<{ id: string }>();
  const { placements, loading, markInvoiced, logPayment } = usePlacements();
  const placement = placements.find((p) => p.id === params.id);
  const [showPayModal, setShowPayModal] = useState(false);
  const [localStatus, setLocalStatus]  = useState<PlacementRecord["invoiceStatus"] | null>(null);
  const [localCollected, setLocalCollected] = useState<number | null>(null);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!placement) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">
          Placement not found.{" "}
          <Link href="/placements" className="text-brand-600 hover:underline">← Back to placements</Link>
        </p>
      </div>
    );
  }

  const status    = localStatus    ?? placement.invoiceStatus;
  const collected = localCollected ?? placement.amountCollected;
  const outstanding = Math.max(0, placement.feeAmount - collected);
  const pct = placement.feeAmount > 0 ? Math.round((collected / placement.feeAmount) * 100) : 0;

  async function handleMarkInvoiced() {
    const invoiceNum = `INV-${Date.now().toString().slice(-6)}`;
    const today = new Date().toISOString().slice(0, 10);
    await markInvoiced(placement!.id, invoiceNum, today);
    setLocalStatus("invoiced");
    toast.success(`Marked as invoiced · ${invoiceNum}`);
  }

  function handleLogPayment(amount: number, _date: string) {
    logPayment(placement!.id, amount);
    const newCollected = collected + amount;
    setLocalCollected(newCollected);
    setLocalStatus(newCollected >= placement!.feeAmount ? "paid" : "partial");
    toast.success(`Payment of ${placement!.currency} ${amount.toLocaleString()} logged`);
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-border bg-card px-6 py-4">
        <div className="mb-3">
          <Link href="/placements" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-fit">
            <ChevronLeft className="h-3.5 w-3.5" />All Placements
          </Link>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white shadow-sm", generateAvatarColor(placement.candidateId))}>
              {getInitials(placement.candidateName)}
            </div>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl font-bold text-foreground">{placement.candidateName}</h1>
                <StatusBadge status={status} />
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">{placement.jobTitle} · {placement.clientName}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {status === "pending" && (
              <button
                onClick={handleMarkInvoiced}
                className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors"
              >
                <FileText className="h-3.5 w-3.5" />Mark Invoiced
              </button>
            )}
            {(status === "invoiced" || status === "partial") && (
              <button
                onClick={() => setShowPayModal(true)}
                className="flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
              >
                <CreditCard className="h-3.5 w-3.5" />Log Payment
              </button>
            )}
            <Link
              href={`/candidates/${placement.candidateId}`}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />View Candidate
            </Link>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-6 space-y-6">

          {/* Fee Progress Card */}
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-muted-foreground" />Fee Collection
              </h2>
              <StatusBadge status={status} />
            </div>
            <div className="grid grid-cols-3 gap-4 mb-4">
              {[
                { label: "Total Fee",    value: `${placement.currency} ${placement.feeAmount.toLocaleString()}` },
                { label: "Collected",    value: `${placement.currency} ${collected.toLocaleString()}`, green: collected > 0 },
                { label: "Outstanding",  value: outstanding > 0 ? `${placement.currency} ${outstanding.toLocaleString()}` : "—", amber: outstanding > 0 },
              ].map((s) => (
                <div key={s.label} className="rounded-lg border border-border bg-background p-3 text-center">
                  <p className={cn("text-lg font-bold", s.green ? "text-emerald-600" : s.amber ? "text-amber-600" : "text-foreground")}>{s.value}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
            {/* Progress bar */}
            <div>
              <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
                <span>Payment progress</span>
                <span>{pct}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all", pct === 100 ? "bg-emerald-500" : pct > 0 ? "bg-brand-500" : "bg-muted-foreground/20")}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          </div>

          {/* Two-column detail */}
          <div className="grid grid-cols-2 gap-6">
            {/* Placement details */}
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-1 text-sm font-semibold text-foreground flex items-center gap-2">
                <BadgeCheck className="h-4 w-4 text-muted-foreground" />Placement Details
              </h2>
              <div className="mt-2">
                <InfoRow label="Candidate">
                  <Link href={`/candidates/${placement.candidateId}`} className="text-brand-600 hover:underline flex items-center gap-1 justify-end">
                    {placement.candidateName}<ExternalLink className="h-3 w-3" />
                  </Link>
                </InfoRow>
                <InfoRow label="Title">{placement.candidateTitle || "—"}</InfoRow>
                <InfoRow label="Client">
                  <Link href={`/clients/${placement.clientId}`} className="text-brand-600 hover:underline flex items-center gap-1 justify-end">
                    {placement.clientName}<ExternalLink className="h-3 w-3" />
                  </Link>
                </InfoRow>
                <InfoRow label="Job">
                  <Link href={`/jobs/${placement.jobId}`} className="text-brand-600 hover:underline flex items-center gap-1 justify-end">
                    {placement.jobTitle}<ExternalLink className="h-3 w-3" />
                  </Link>
                </InfoRow>
                <InfoRow label="Start Date">
                  {placement.startDate ? new Date(placement.startDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "—"}
                </InfoRow>
                <InfoRow label="Placed On">
                  {new Date(placement.placedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                </InfoRow>
                <InfoRow label="Recruiter">{placement.recruiterName}</InfoRow>
              </div>
            </div>

            {/* Fee details */}
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-1 text-sm font-semibold text-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />Fee Details
              </h2>
              <div className="mt-2">
                <InfoRow label="Fee Type">
                  <span className="capitalize">{placement.feeType}</span>
                </InfoRow>
                {placement.feeType === "percentage" && placement.feePercentage && (
                  <InfoRow label="Percentage">{placement.feePercentage}%</InfoRow>
                )}
                <InfoRow label="Total Fee">
                  <span className="font-semibold">{placement.currency} {placement.feeAmount.toLocaleString()}</span>
                </InfoRow>
                <InfoRow label="Amount Collected">
                  <span className={cn("font-semibold", collected > 0 ? "text-emerald-600" : "text-foreground")}>
                    {placement.currency} {collected.toLocaleString()}
                  </span>
                </InfoRow>
                <InfoRow label="Outstanding">
                  <span className={cn("font-semibold", outstanding > 0 ? "text-amber-600" : "text-muted-foreground")}>
                    {outstanding > 0 ? `${placement.currency} ${outstanding.toLocaleString()}` : "Fully collected"}
                  </span>
                </InfoRow>
                <InfoRow label="Invoice Status"><StatusBadge status={status} /></InfoRow>
                {placement.invoiceNumber && (
                  <InfoRow label="Invoice #">{placement.invoiceNumber}</InfoRow>
                )}
                {placement.invoicedAt && (
                  <InfoRow label="Invoiced On">
                    {new Date(placement.invoicedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                  </InfoRow>
                )}
              </div>
            </div>
          </div>

          {/* Commission Splits + Guarantee (US-513: both are Pro-tier) */}
          <div className="grid grid-cols-2 gap-6">
            <FeatureGate feature="commission_split_tracking">
              <div className="rounded-xl border border-border bg-card p-5">
                <CommissionSplitsPanel
                  placementId={placement.id}
                  feeAmount={placement.feeAmount}
                  teamMembers={[] as AgencyUser[]}
                />
              </div>
            </FeatureGate>
            <FeatureGate feature="placement_guarantee_workflow">
              <div className="rounded-xl border border-border bg-card p-5">
                <GuaranteePanel
                  placementId={placement.id}
                  startDate={placement.startDate}
                />
              </div>
            </FeatureGate>
          </div>

          {/* Actions row */}
          <div className="flex gap-3">
            {status === "pending" && (
              <button
                onClick={handleMarkInvoiced}
                className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors"
              >
                <FileText className="h-4 w-4" />Generate Invoice
              </button>
            )}
            {(status === "invoiced" || status === "partial") && (
              <button
                onClick={() => setShowPayModal(true)}
                className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
              >
                <CreditCard className="h-4 w-4" />Log Payment
              </button>
            )}
            {status === "paid" && (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span className="text-sm font-medium text-emerald-700">Fully collected</span>
              </div>
            )}
            <Link
              href={`/jobs/${placement.jobId}`}
              className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent transition-colors ml-auto"
            >
              <Briefcase className="h-4 w-4" />View Job
            </Link>
            <Link
              href={`/clients/${placement.clientId}`}
              className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent transition-colors"
            >
              <Building2 className="h-4 w-4" />View Client
            </Link>
          </div>

        </div>
      </div>

      {showPayModal && (
        <MarkPaidModal
          placement={{ ...placement, amountCollected: collected, invoiceStatus: status }}
          onClose={() => setShowPayModal(false)}
          onSave={handleLogPayment}
        />
      )}
    </div>
  );
}
