import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
  /** Use "brand" for primary empty state (no data exists), "muted" for filtered-empty state */
  variant?: "brand" | "muted";
}

/**
 * Shared empty state component.
 * - brand: Used when no records exist at all — brand-colored icon circle, CTA button
 * - muted: Used when filters return no results — muted icon circle, text link
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  className,
  variant = "brand",
}: EmptyStateProps) {
  const isBrand = variant === "brand";

  return (
    <div className={cn("flex flex-col items-center justify-center py-24 text-center", className)}>
      <div
        className={cn(
          "flex h-14 w-14 items-center justify-center rounded-full mb-4",
          isBrand ? "bg-brand-50" : "bg-muted"
        )}
      >
        <Icon
          className={cn(
            "h-6 w-6",
            isBrand ? "text-brand-500" : "text-muted-foreground/50"
          )}
        />
      </div>

      <p className="text-sm font-semibold text-foreground">{title}</p>

      {description && (
        <p className="mt-1 text-xs text-muted-foreground max-w-xs">{description}</p>
      )}

      {action && (
        <button
          onClick={action.onClick}
          className={cn(
            "mt-5 flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold transition-colors",
            isBrand
              ? "bg-brand-600 text-white hover:bg-brand-700"
              : "border border-border bg-background text-foreground hover:bg-accent"
          )}
        >
          {action.label}
        </button>
      )}

      {secondaryAction && (
        <button
          onClick={secondaryAction.onClick}
          className="mt-3 text-xs font-semibold text-brand-600 hover:text-brand-700 hover:underline transition-colors"
        >
          {secondaryAction.label}
        </button>
      )}
    </div>
  );
}
