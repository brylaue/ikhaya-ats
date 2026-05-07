"use client";

/**
 * WinLossModal — US-158: BD Win/Loss Reasons & Analytics
 *
 * Modal for tagging a BD opportunity with an outcome (won/lost/stalled)
 * and a reason from a controlled vocabulary.
 */

import { useState } from "react";
import { X, Trophy, XCircle, MinusCircle, PauseCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBdWinLoss } from "@/lib/supabase/hooks";
import { toast } from "sonner";

const OUTCOME_CONFIG = {
  won:         { label: "Won",         icon: Trophy,       color: "border-emerald-300 bg-emerald-50 text-emerald-700" },
  lost:        { label: "Lost",        icon: XCircle,      color: "border-red-300 bg-red-50 text-red-700" },
  no_decision: { label: "No decision", icon: MinusCircle,  color: "border-slate-300 bg-slate-50 text-slate-600" },
  stalled:     { label: "Stalled",     icon: PauseCircle,  color: "border-amber-300 bg-amber-50 text-amber-700" },
} as const;

const REASON_CATEGORIES = [
  { value: "price",             label: "Price / fees too high" },
  { value: "relationship",      label: "Relationship with incumbent" },
  { value: "speed",             label: "Turnaround time" },
  { value: "quality",           label: "Candidate quality concerns" },
  { value: "competition",       label: "Lost to competitor" },
  { value: "budget_freeze",     label: "Budget freeze / hiring pause" },
  { value: "not_ready",         label: "Client not ready to hire" },
  { value: "incumbent_retained",label: "Retained incumbent" },
  { value: "other",             label: "Other" },
];

interface Props {
  opportunityId: string;
  opportunityName: string;
  onClose: () => void;
}

export function WinLossModal({ opportunityId, opportunityName, onClose }: Props) {
  const { tag, saveTag } = useBdWinLoss(opportunityId);
  const [outcome, setOutcome]       = useState<"won" | "lost" | "no_decision" | "stalled">(tag?.outcome ?? "lost");
  const [reason, setReason]         = useState(tag?.reasonCategory ?? "");
  const [detail, setDetail]         = useState(tag?.reasonDetail ?? "");
  const [competitor, setCompetitor] = useState(tag?.competitor ?? "");
  const [saving, setSaving]         = useState(false);

  async function handleSave() {
    if (!reason) { toast.error("Please select a reason"); return; }
    setSaving(true);
    try {
      await saveTag(opportunityId, outcome, reason, detail, competitor || undefined);
      toast.success("Outcome recorded");
      onClose();
    } catch {
      toast.error("Failed to save outcome");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-semibold text-foreground">Record outcome</h2>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{opportunityName}</p>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Outcome */}
          <div>
            <label className="text-xs font-semibold text-foreground block mb-2">Outcome</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(OUTCOME_CONFIG).map(([key, cfg]) => {
                const Icon = cfg.icon;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setOutcome(key as "won" | "lost" | "no_decision" | "stalled")}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors",
                      outcome === key ? cfg.color : "border-border text-muted-foreground hover:bg-muted/50"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="text-xs font-semibold text-foreground block mb-2">Primary reason</label>
            <div className="space-y-1.5">
              {REASON_CATEGORIES.map((r) => (
                <label key={r.value} className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors text-sm",
                  reason === r.value ? "border-brand-300 bg-brand-50 text-brand-700" : "border-border hover:bg-muted/40 text-foreground"
                )}>
                  <input
                    type="radio"
                    name="reason"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    className="accent-brand-600"
                  />
                  {r.label}
                </label>
              ))}
            </div>
          </div>

          {outcome === "lost" && (
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">Competitor (if known)</label>
              <input
                type="text"
                value={competitor}
                onChange={(e) => setCompetitor(e.target.value)}
                placeholder="e.g. Heidrick & Struggles"
                className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 bg-card"
              />
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-foreground block mb-1">Notes</label>
            <textarea
              rows={2}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="Additional context..."
              className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 bg-card resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !reason}
            className="px-4 py-2 bg-brand-600 text-white rounded-md text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : "Record outcome"}
          </button>
        </div>
      </div>
    </div>
  );
}
