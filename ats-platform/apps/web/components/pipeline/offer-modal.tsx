"use client";

import { useState, useMemo } from "react";
import {
  X,
  DollarSign,
  Calendar,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  FileText,
  ChevronDown,
  ChevronUp,
  Award,
  Briefcase,
  Clock,
  RotateCcw,
  ThumbsDown,
  Sparkles,
  BadgeCheck,
} from "lucide-react";
import type { Candidate } from "@/types";
import { cn, formatSalary, getInitials, generateAvatarColor } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export type OfferStatus =
  | "draft"
  | "extended"
  | "verbal_accepted"
  | "accepted"
  | "declined"
  | "countered";

export type FeeType = "percentage" | "flat";
export type PaymentTerms = "on_start" | "30_days" | "60_days" | "on_completion";

export interface Offer {
  id: string;
  applicationId: string;
  candidateId: string;
  jobId: string;
  status: OfferStatus;
  // Compensation
  baseSalary?: number;
  bonus?: number;
  equity?: string;
  currency: string;
  // Timing
  startDate?: string;
  expiryDate?: string;
  // Agency fee
  feeType: FeeType;
  feePercentage?: number;
  feeFlat?: number;
  paymentTerms: PaymentTerms;
  estimatedFee?: number;
  // Meta
  notes?: string;
  placedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OfferModalProps {
  candidate: Candidate;
  applicationId: string;
  jobId: string;
  jobTitle: string;
  clientName: string;
  existingOffer?: Offer;
  onSave: (offer: Offer) => void;
  onPlace?: (offer: Offer) => void;
  onClose: () => void;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<
  OfferStatus,
  { label: string; icon: React.ElementType; bg: string; text: string; ring: string; dot: string }
> = {
  draft:           { label: "Draft",           icon: FileText,    bg: "bg-slate-100",   text: "text-slate-600",  ring: "ring-slate-200",  dot: "bg-slate-400"   },
  extended:        { label: "Extended",         icon: Clock,       bg: "bg-amber-100",   text: "text-amber-700",  ring: "ring-amber-300",  dot: "bg-amber-500"   },
  verbal_accepted: { label: "Verbal Accept",    icon: Award,       bg: "bg-brand-100",    text: "text-brand-700",   ring: "ring-brand-300",   dot: "bg-brand-500"    },
  accepted:        { label: "Accepted",         icon: CheckCircle2,bg: "bg-emerald-100", text: "text-emerald-700",ring: "ring-emerald-300", dot: "bg-emerald-500" },
  declined:        { label: "Declined",         icon: ThumbsDown,  bg: "bg-red-100",     text: "text-red-700",    ring: "ring-red-300",    dot: "bg-red-500"     },
  countered:       { label: "Counter Received", icon: RotateCcw,   bg: "bg-violet-100",  text: "text-violet-700", ring: "ring-violet-300",  dot: "bg-violet-500"  },
};

const PAYMENT_TERMS_LABELS: Record<PaymentTerms, string> = {
  on_start:      "Due on start date",
  "30_days":     "30 days after start",
  "60_days":     "60 days after start",
  on_completion: "On placement completion",
};

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  title,
  icon: Icon,
  children,
  collapsible = false,
  defaultOpen = true,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => collapsible && setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center justify-between px-4 py-3",
          collapsible ? "cursor-pointer hover:bg-accent/50 transition-colors rounded-xl" : "cursor-default",
          open && collapsible && "rounded-b-none"
        )}
      >
        <div className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-foreground">{title}</span>
        </div>
        {collapsible && (
          open ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
               : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>
      {open && (
        <div className="border-t border-border px-4 pb-4 pt-3">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Field helpers ────────────────────────────────────────────────────────────

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
  prefix,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  prefix?: string;
}) {
  return (
    <div className="relative flex items-center">
      {prefix && (
        <span className="absolute left-2.5 text-xs text-muted-foreground select-none">{prefix}</span>
      )}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "w-full rounded-lg border border-border bg-background py-1.5 text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-brand-500",
          prefix ? "pl-6 pr-3" : "px-3"
        )}
      />
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

// ─── Placement Confirmation Banner ────────────────────────────────────────────

function PlacementBanner({
  offer,
  onConfirm,
}: {
  offer: Partial<Offer>;
  onConfirm: () => void;
}) {
  const fee = offer.estimatedFee;

  return (
    <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500">
          <Sparkles className="h-4.5 w-4.5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-emerald-800">Offer Accepted — Ready to Place</p>
          <p className="mt-0.5 text-xs text-emerald-700">
            Confirming placement will mark this search as filled, update the candidate's status, and lock the placement record.
          </p>
          {fee && (
            <p className="mt-2 text-sm font-bold text-emerald-800">
              Placement fee: {formatSalary(fee, offer.currency ?? "USD")}
            </p>
          )}
        </div>
      </div>
      <button
        onClick={onConfirm}
        className="mt-3 w-full flex items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
      >
        <BadgeCheck className="h-4 w-4" />
        Confirm Placement
      </button>
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export function OfferModal({
  candidate,
  applicationId,
  jobId,
  jobTitle,
  clientName,
  existingOffer,
  onSave,
  onPlace,
  onClose,
}: OfferModalProps) {
  // ── Form state ───────────────────────────────────────────────────────────────
  const [status,       setStatus]       = useState<OfferStatus>(existingOffer?.status ?? "draft");
  const [baseSalary,   setBaseSalary]   = useState(existingOffer?.baseSalary?.toString() ?? "");
  const [bonus,        setBonus]        = useState(existingOffer?.bonus?.toString() ?? "");
  const [equity,       setEquity]       = useState(existingOffer?.equity ?? "");
  const [currency,     setCurrency]     = useState(existingOffer?.currency ?? "USD");
  const [startDate,    setStartDate]    = useState(existingOffer?.startDate ?? "");
  const [expiryDate,   setExpiryDate]   = useState(existingOffer?.expiryDate ?? "");
  const [feeType,      setFeeType]      = useState<FeeType>(existingOffer?.feeType ?? "percentage");
  const [feePercent,   setFeePercent]   = useState(existingOffer?.feePercentage?.toString() ?? "20");
  const [feeFlat,      setFeeFlat]      = useState(existingOffer?.feeFlat?.toString() ?? "");
  const [payTerms,     setPayTerms]     = useState<PaymentTerms>(existingOffer?.paymentTerms ?? "on_start");
  const [notes,        setNotes]        = useState(existingOffer?.notes ?? "");

  // ── Derived values ───────────────────────────────────────────────────────────
  const parsedBase    = parseFloat(baseSalary.replace(/,/g, "")) || 0;
  const parsedBonus   = parseFloat(bonus.replace(/,/g, "")) || 0;
  const parsedPercent = parseFloat(feePercent) || 0;
  const parsedFlat    = parseFloat(feeFlat.replace(/,/g, "")) || 0;

  const estimatedFee = useMemo(() => {
    if (feeType === "percentage" && parsedBase > 0 && parsedPercent > 0) {
      return Math.round((parsedBase + parsedBonus) * (parsedPercent / 100));
    }
    if (feeType === "flat" && parsedFlat > 0) return parsedFlat;
    return undefined;
  }, [feeType, parsedBase, parsedBonus, parsedPercent, parsedFlat]);

  const totalPackage = parsedBase + parsedBonus;
  const isAccepted   = status === "accepted" || status === "verbal_accepted";
  const isDeclined   = status === "declined";

  function buildOffer(): Offer {
    return {
      id: existingOffer?.id ?? `offer_${Date.now()}`,
      applicationId,
      candidateId: candidate.id,
      jobId,
      status,
      baseSalary: parsedBase || undefined,
      bonus: parsedBonus || undefined,
      equity: equity.trim() || undefined,
      currency,
      startDate: startDate || undefined,
      expiryDate: expiryDate || undefined,
      feeType,
      feePercentage: feeType === "percentage" ? parsedPercent || undefined : undefined,
      feeFlat: feeType === "flat" ? parsedFlat || undefined : undefined,
      paymentTerms: payTerms,
      estimatedFee,
      notes: notes.trim() || undefined,
      placedAt: existingOffer?.placedAt,
      createdAt: existingOffer?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  function handleSave() {
    onSave(buildOffer());
    onClose();
  }

  function handlePlace() {
    const offer = { ...buildOffer(), placedAt: new Date().toISOString(), status: "accepted" as OfferStatus };
    onSave(offer);
    onPlace?.(offer);
    onClose();
  }

  const cfg = STATUS_CFG[status];
  const StatusIcon = cfg.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 flex h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-border bg-background shadow-2xl overflow-hidden">

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className="shrink-0 border-b border-border bg-card px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white",
                  generateAvatarColor(candidate.id)
                )}
              >
                {getInitials(candidate.fullName)}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm font-bold text-foreground">{candidate.fullName}</h2>
                  <span
                    className={cn(
                      "flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1",
                      cfg.bg, cfg.text, cfg.ring
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
                    {cfg.label}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground truncate">
                  {jobTitle} · {clientName}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Status selector */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(Object.keys(STATUS_CFG) as OfferStatus[]).map((s) => {
              const c = STATUS_CFG[s];
              const Icon = c.icon;
              const active = s === status;
              return (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 transition-all",
                    active
                      ? cn(c.bg, c.text, c.ring, "shadow-sm")
                      : "bg-muted/40 text-muted-foreground ring-transparent hover:bg-accent"
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Body ───────────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">

          {/* Placement banner */}
          {status === "accepted" && (
            <PlacementBanner offer={{ estimatedFee, currency }} onConfirm={handlePlace} />
          )}

          {/* Declined notice */}
          {isDeclined && (
            <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-red-800">Offer declined</p>
                <p className="mt-0.5 text-xs text-red-700">
                  Record any counter details in the notes below and update the status when next steps are clear.
                </p>
              </div>
            </div>
          )}

          {/* Compensation */}
          <Section title="Compensation" icon={DollarSign}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Base Salary">
                <TextInput
                  value={baseSalary}
                  onChange={setBaseSalary}
                  placeholder="120,000"
                  prefix={currency === "USD" ? "$" : currency === "GBP" ? "£" : "€"}
                />
              </Field>
              <Field label="Currency">
                <Select
                  value={currency}
                  onChange={setCurrency}
                  options={[
                    { value: "USD", label: "USD — US Dollar" },
                    { value: "GBP", label: "GBP — British Pound" },
                    { value: "EUR", label: "EUR — Euro" },
                    { value: "CAD", label: "CAD — Canadian Dollar" },
                    { value: "AUD", label: "AUD — Australian Dollar" },
                  ]}
                />
              </Field>
              <Field label="Annual Bonus" hint="Optional — target or guaranteed">
                <TextInput
                  value={bonus}
                  onChange={setBonus}
                  placeholder="15,000"
                  prefix={currency === "USD" ? "$" : currency === "GBP" ? "£" : "€"}
                />
              </Field>
              <Field label="Equity / Stock" hint="Optional — describe grant">
                <TextInput
                  value={equity}
                  onChange={setEquity}
                  placeholder="0.5% over 4yr cliff"
                />
              </Field>
            </div>

            {totalPackage > 0 && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-brand-50 border border-brand-100 px-3 py-2">
                <TrendingUp className="h-3.5 w-3.5 text-brand-600 shrink-0" />
                <p className="text-xs font-semibold text-brand-700">
                  Total package: {formatSalary(totalPackage, currency)}
                  {parsedBase > 0 && parsedBonus > 0 && (
                    <span className="font-normal text-brand-600 ml-1">
                      (base {formatSalary(parsedBase, currency)} + bonus {formatSalary(parsedBonus, currency)})
                    </span>
                  )}
                </p>
              </div>
            )}
          </Section>

          {/* Timing */}
          <Section title="Key Dates" icon={Calendar}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start Date">
                <TextInput
                  type="date"
                  value={startDate}
                  onChange={setStartDate}
                />
              </Field>
              <Field label="Offer Expires" hint="When the candidate must respond by">
                <TextInput
                  type="date"
                  value={expiryDate}
                  onChange={setExpiryDate}
                />
              </Field>
            </div>
          </Section>

          {/* Agency fee */}
          <Section title="Agency Fee" icon={Briefcase} collapsible defaultOpen>
            {/* Fee type toggle */}
            <div className="flex gap-2 mb-3">
              {(["percentage", "flat"] as FeeType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setFeeType(t)}
                  className={cn(
                    "flex-1 rounded-lg border py-1.5 text-xs font-semibold transition-colors",
                    feeType === t
                      ? "border-brand-300 bg-brand-50 text-brand-700"
                      : "border-border bg-muted/30 text-muted-foreground hover:bg-accent"
                  )}
                >
                  {t === "percentage" ? "% of Salary" : "Flat Fee"}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {feeType === "percentage" ? (
                <Field label="Fee Percentage" hint="Applied to base + bonus">
                  <TextInput
                    value={feePercent}
                    onChange={setFeePercent}
                    placeholder="20"
                    prefix="%"
                  />
                </Field>
              ) : (
                <Field label="Flat Fee Amount">
                  <TextInput
                    value={feeFlat}
                    onChange={setFeeFlat}
                    placeholder="25,000"
                    prefix="$"
                  />
                </Field>
              )}
              <Field label="Payment Terms">
                <Select
                  value={payTerms}
                  onChange={(v) => setPayTerms(v as PaymentTerms)}
                  options={Object.entries(PAYMENT_TERMS_LABELS).map(([k, v]) => ({ value: k, label: v }))}
                />
              </Field>
            </div>

            {estimatedFee !== undefined && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-teal-50 border border-teal-200 px-3 py-2">
                <TrendingUp className="h-3.5 w-3.5 text-teal-600 shrink-0" />
                <p className="text-xs font-semibold text-teal-700">
                  Estimated fee: {formatSalary(estimatedFee, currency)}
                  {feeType === "percentage" && parsedPercent > 0 && (
                    <span className="ml-1 font-normal text-teal-600">
                      ({parsedPercent}% of {formatSalary(totalPackage || parsedBase, currency)})
                    </span>
                  )}
                </p>
              </div>
            )}

            <p className="mt-2 text-[10px] text-muted-foreground">
              {PAYMENT_TERMS_LABELS[payTerms]}
              {startDate ? ` · Start ${new Date(startDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}
            </p>
          </Section>

          {/* Notes */}
          <Section title="Internal Notes" icon={FileText} collapsible defaultOpen>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Counter offer details, candidate concerns, hiring manager notes, special conditions…"
              rows={3}
              className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-brand-500"
            />
          </Section>

          {/* Verbal accepted nudge */}
          {status === "verbal_accepted" && (
            <div className="flex items-start gap-3 rounded-xl border border-brand-200 bg-brand-50 p-3">
              <Award className="h-4 w-4 shrink-0 text-brand-500 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-brand-800">Verbal acceptance received</p>
                <p className="mt-0.5 text-xs text-brand-700">
                  Update to <strong>Accepted</strong> once you have written confirmation to confirm the placement.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────────── */}
        <div className="shrink-0 border-t border-border bg-card px-5 py-3 flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {existingOffer
              ? `Last updated ${new Date(existingOffer.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
              : "New offer record"}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="rounded-lg bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
            >
              {existingOffer ? "Update Offer" : "Save Offer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
