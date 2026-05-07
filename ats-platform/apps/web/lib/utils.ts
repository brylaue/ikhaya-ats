import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatDistanceToNow, format, differenceInDays } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRelativeTime(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

export function formatDate(date: string | Date, fmt = "MMM d, yyyy"): string {
  return format(new Date(date), fmt);
}

export function getDaysInStage(date: string | Date): number {
  return differenceInDays(new Date(), new Date(date));
}

export function getAgingClass(days: number): string {
  if (days <= 3) return "stage-fresh";
  if (days <= 7) return "stage-aging";
  return "stage-stale";
}

export function getAgingColor(days: number): string {
  if (days <= 3) return "text-emerald-600";
  if (days <= 7) return "text-amber-600";
  return "text-red-600";
}

export function formatSalary(
  amount: number | null | undefined,
  currency: string | null | undefined = "USD",
  compact = false
): string {
  if (amount == null || !Number.isFinite(amount)) return "—";
  const safeCurrency =
    typeof currency === "string" && /^[A-Za-z]{3}$/.test(currency)
      ? currency.toUpperCase()
      : "USD";
  if (compact && amount >= 1000) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: safeCurrency,
      notation: "compact",
      maximumFractionDigits: 0,
    }).format(amount);
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: safeCurrency,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Render a salary range, collapsing sensibly when only one bound is present.
 * Pass a real ISO currency (not the max) — earlier callers passed the max
 * value as the currency, which tripped Intl.NumberFormat RangeError (US-314).
 */
export function formatSalaryRange(
  min: number | null | undefined,
  max: number | null | undefined,
  currency: string | null | undefined = "USD",
  compact = false
): string {
  const hasMin = min != null && Number.isFinite(min);
  const hasMax = max != null && Number.isFinite(max);
  if (!hasMin && !hasMax) return "—";
  if (hasMin && hasMax) {
    return `${formatSalary(min!, currency, compact)} – ${formatSalary(max!, currency, compact)}`;
  }
  if (hasMin) return `${formatSalary(min!, currency, compact)}+`;
  return `Up to ${formatSalary(max!, currency, compact)}`;
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function generateAvatarColor(id: string): string {
  const colors = [
    "bg-violet-500",
    "bg-blue-500",
    "bg-cyan-500",
    "bg-teal-500",
    "bg-emerald-500",
    "bg-amber-500",
    "bg-orange-500",
    "bg-rose-500",
    "bg-pink-500",
    "bg-indigo-500",
  ];
  const index = id.charCodeAt(0) % colors.length;
  return colors[index];
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + "…";
}

export const STAGE_TYPE_LABELS: Record<string, string> = {
  sourced: "Sourced",
  screened: "Screened",
  submitted: "Submitted",
  client_review: "Client Review",
  interview: "Interview",
  offer: "Offer",
  placed: "Placed",
  rejected: "Not Progressing",
  custom: "Custom",
};

export const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  passive: "Passive",
  not_looking: "Not Looking",
  placed: "Placed",
  do_not_contact: "Do Not Contact",
};

export const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  passive: "bg-blue-100 text-blue-700",
  not_looking: "bg-slate-100 text-slate-600",
  placed: "bg-violet-100 text-violet-700",
  do_not_contact: "bg-red-100 text-red-700",
};

export const JOB_PRIORITY_COLORS: Record<string, string> = {
  low: "bg-slate-100 text-slate-600",
  medium: "bg-blue-100 text-blue-700",
  high: "bg-amber-100 text-amber-700",
  urgent: "bg-red-100 text-red-700",
};
