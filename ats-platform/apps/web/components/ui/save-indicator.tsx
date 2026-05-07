"use client";

import { Loader2, Check, AlertCircle, Cloud } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SaveStatus } from "@/hooks/use-auto-save";

interface SaveIndicatorProps {
  status: SaveStatus;
  className?: string;
  /** Show a "Draft restored" message instead of "Saved" (one-shot) */
  restoredDraft?: boolean;
}

export function SaveIndicator({ status, className, restoredDraft }: SaveIndicatorProps) {
  if (status === "idle" && !restoredDraft) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[11px] font-medium transition-opacity duration-300",
        status === "idle"   && restoredDraft ? "text-brand-600 opacity-100" :
        status === "saving" ? "text-muted-foreground opacity-100" :
        status === "saved"  ? "text-emerald-600 opacity-100" :
        status === "error"  ? "text-red-500 opacity-100" : "opacity-0",
        className
      )}
    >
      {status === "saving" && <Loader2 className="h-3 w-3 animate-spin" />}
      {status === "saved"  && <Check    className="h-3 w-3" />}
      {status === "error"  && <AlertCircle className="h-3 w-3" />}
      {status === "idle"   && restoredDraft && <Cloud className="h-3 w-3" />}

      {status === "saving" ? "Saving…"
        : status === "saved" ? "Saved"
        : status === "error" ? "Save failed"
        : restoredDraft ? "Draft restored"
        : null}
    </span>
  );
}

/**
 * A self-contained "flash saved" banner — mounts, shows briefly, then hides.
 * Good for immediate selections (decision buttons, reason pills).
 */
interface SaveFlashProps {
  show: boolean;
  className?: string;
}

export function SaveFlash({ show, className }: SaveFlashProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 transition-all duration-500",
        show ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1 pointer-events-none",
        className
      )}
    >
      <Check className="h-3 w-3" />
      Draft saved
    </span>
  );
}
