"use client";

/**
 * ContactFlagBadge — US-017: Candidate Do-Not-Contact & Ghosting Log
 *
 * Shows the current contact flag on a candidate card/profile, and provides
 * an inline popover for setting / clearing flags.
 */

import { useState } from "react";
import { Ban, Ghost, MapPin, PauseCircle, X, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCandidateContactFlag, type ContactFlagType } from "@/lib/supabase/hooks";
import { toast } from "sonner";

const FLAG_CONFIG: Record<ContactFlagType, { label: string; color: string; icon: React.ElementType }> = {
  do_not_contact:  { label: "Do Not Contact",   color: "bg-red-100 text-red-700 border-red-200",        icon: Ban       },
  ghosted:         { label: "Ghosted",          color: "bg-slate-100 text-slate-600 border-slate-200",  icon: Ghost     },
  placed_elsewhere:{ label: "Placed Elsewhere", color: "bg-amber-100 text-amber-700 border-amber-200",  icon: MapPin    },
  pause:           { label: "Paused",           color: "bg-blue-100 text-blue-700 border-blue-200",     icon: PauseCircle },
};

interface Props {
  candidateId:      string;
  currentFlag?:     ContactFlagType | null;
  currentReason?:   string | null;
  nextContactDate?: string | null;
  onUpdated?:       () => void;
}

export function ContactFlagBadge({ candidateId, currentFlag, currentReason, nextContactDate, onUpdated }: Props) {
  const { setFlag, clearFlag } = useCandidateContactFlag(candidateId);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    flag:            (currentFlag ?? "") as ContactFlagType | "",
    reason:          currentReason ?? "",
    nextContactDate: nextContactDate ?? "",
  });
  const [saving, setSaving] = useState(false);

  const cfg = currentFlag ? FLAG_CONFIG[currentFlag] : null;
  const Icon = cfg?.icon;

  async function handleSave() {
    setSaving(true);
    try {
      if (!form.flag) {
        await clearFlag();
      } else {
        await setFlag({
          contactFlag:        form.flag as ContactFlagType,
          contactFlagReason:  form.reason || undefined,
          nextContactDate:    form.nextContactDate || null,
        });
      }
      toast.success("Contact flag updated");
      setOpen(false);
      onUpdated?.();
    } catch {
      toast.error("Failed to update flag");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-colors",
          cfg ? cfg.color : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100"
        )}
      >
        {Icon && <Icon className="h-3 w-3" />}
        {cfg ? cfg.label : "Set flag"}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>

      {open && (
        <div className="absolute z-20 top-full mt-1 left-0 w-72 rounded-xl border border-border bg-card shadow-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-foreground">Contact flag</p>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div>
            <label className="text-xs font-medium text-foreground block mb-1">Flag type</label>
            <select
              value={form.flag}
              onChange={e => setForm(f => ({ ...f, flag: e.target.value as ContactFlagType | "" }))}
              className="w-full px-2.5 py-1.5 border border-border rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-brand-600 bg-card"
            >
              <option value="">— None —</option>
              {Object.entries(FLAG_CONFIG).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>

          {form.flag && (
            <>
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">Reason (optional)</label>
                <input
                  type="text"
                  value={form.reason}
                  onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                  placeholder="Context..."
                  className="w-full px-2.5 py-1.5 border border-border rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-brand-600 bg-card"
                />
              </div>

              {form.flag === "pause" && (
                <div>
                  <label className="text-xs font-medium text-foreground block mb-1">Next permissible contact date</label>
                  <input
                    type="date"
                    value={form.nextContactDate}
                    onChange={e => setForm(f => ({ ...f, nextContactDate: e.target.value }))}
                    className="w-full px-2.5 py-1.5 border border-border rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-brand-600 bg-card"
                  />
                </div>
              )}
            </>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex-1 px-3 py-1.5 bg-brand-600 text-white rounded-md text-xs font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
