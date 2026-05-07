"use client";

import { useState } from "react";
import {
  Shield, ShieldOff, ShieldAlert, ShieldCheck,
  AlertTriangle, CheckCircle2, Plus, Loader2, Calendar,
} from "lucide-react";
import { usePlacementGuarantee, type ReplacementStatus } from "@/lib/supabase/hooks";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Status config ────────────────────────────────────────────────────────────

const GUARANTEE_STATUS_CFG = {
  active:   { icon: Shield,       color: "text-emerald-600", bg: "bg-emerald-100", label: "Active"   },
  at_risk:  { icon: ShieldAlert,  color: "text-amber-600",   bg: "bg-amber-100",   label: "At Risk"  },
  breached: { icon: ShieldOff,    color: "text-red-600",     bg: "bg-red-100",     label: "Breached" },
  waived:   { icon: Shield,       color: "text-slate-500",   bg: "bg-slate-100",   label: "Waived"   },
  cleared:  { icon: ShieldCheck,  color: "text-emerald-600", bg: "bg-emerald-100", label: "Cleared"  },
} as const;

const REPLACEMENT_STATUS_CFG: Record<ReplacementStatus, { label: string; color: string }> = {
  open:        { label: "Open",        color: "bg-red-100 text-red-700"       },
  in_progress: { label: "In Progress", color: "bg-amber-100 text-amber-700"   },
  filled:      { label: "Filled",      color: "bg-emerald-100 text-emerald-700" },
  waived:      { label: "Waived",      color: "bg-slate-100 text-slate-600"   },
  expired:     { label: "Expired",     color: "bg-muted text-muted-foreground" },
};

// ─── Set guarantee form ───────────────────────────────────────────────────────

interface SetGuaranteeFormProps {
  onSave:  (days: number, startDate: string) => Promise<void>;
  onClose: () => void;
}

function SetGuaranteeForm({ onSave, onClose }: SetGuaranteeFormProps) {
  const [days, setDays]           = useState("90");
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [saving, setSaving]       = useState(false);

  async function handleSave() {
    const d = parseInt(days);
    if (!d || d <= 0) { toast.error("Enter valid guarantee days"); return; }
    if (!startDate)   { toast.error("Enter start date"); return; }
    setSaving(true);
    try {
      await onSave(d, startDate);
      toast.success("Guarantee period set");
      onClose();
    } finally { setSaving(false); }
  }

  return (
    <div className="rounded-xl border border-dashed border-brand-300 bg-brand-50/40 p-4 space-y-3">
      <p className="text-xs font-semibold text-foreground">Set Guarantee Period</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Guarantee Days</label>
          <div className="relative">
            <input type="number" value={days} onChange={(e) => setDays(e.target.value)}
              min="1" placeholder="90"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 pr-10 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500" />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">days</span>
          </div>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Start Date</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        {["30", "60", "90", "180"].map((d) => (
          <button key={d} onClick={() => setDays(d)}
            className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors border",
              days === d ? "bg-brand-600 text-white border-transparent" : "border-border text-muted-foreground hover:bg-accent"
            )}>
            {d}d
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 rounded-lg border border-border py-2 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors">
          Cancel
        </button>
        <button onClick={handleSave} disabled={saving}
          className="flex-1 rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto" /> : "Save Guarantee"}
        </button>
      </div>
    </div>
  );
}

// ─── Flag breach form ─────────────────────────────────────────────────────────

interface FlagBreachFormProps {
  onFlag:  (reason: string, date: string) => Promise<void>;
  onClose: () => void;
}

function FlagBreachForm({ onFlag, onClose }: FlagBreachFormProps) {
  const [reason, setReason]   = useState("");
  const [date, setDate]       = useState(new Date().toISOString().split("T")[0]);
  const [saving, setSaving]   = useState(false);

  async function handleFlag() {
    if (!reason.trim()) { toast.error("Enter a reason"); return; }
    setSaving(true);
    try {
      await onFlag(reason.trim(), date);
      toast.success("Guarantee breach flagged");
      onClose();
    } finally { setSaving(false); }
  }

  return (
    <div className="rounded-xl border border-dashed border-red-300 bg-red-50/40 p-4 space-y-3">
      <p className="text-xs font-semibold text-red-700">Flag Guarantee Breach</p>
      <div className="space-y-2">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Date Candidate Left</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500" />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Reason</label>
          <select value={reason} onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500">
            <option value="">Select reason…</option>
            <option value="Resignation">Resignation</option>
            <option value="Performance termination">Performance termination</option>
            <option value="Redundancy">Redundancy</option>
            <option value="Mutual agreement">Mutual agreement</option>
            <option value="Role eliminated">Role eliminated</option>
            <option value="Other">Other</option>
          </select>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 rounded-lg border border-border py-2 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors">
          Cancel
        </button>
        <button onClick={handleFlag} disabled={saving || !reason}
          className="flex-1 rounded-lg bg-red-600 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60 transition-colors">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto" /> : "Flag Breach"}
        </button>
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

interface GuaranteePanelProps {
  placementId: string;
  startDate?:  string;  // placement start date as default
}

export function GuaranteePanel({ placementId, startDate }: GuaranteePanelProps) {
  const {
    replacements, guaranteeDays, guaranteeExpires, guaranteeStatus,
    daysRemaining, isAtRisk, loading,
    setGuarantee, flagBreach, updateReplacementStatus,
  } = usePlacementGuarantee(placementId);

  const [showSetForm, setShowSetForm]     = useState(false);
  const [showBreachForm, setShowBreachForm] = useState(false);

  const statusCfg = GUARANTEE_STATUS_CFG[guaranteeStatus];
  const StatusIcon = statusCfg.icon;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Shield className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Placement Guarantee</span>
        </div>
        {!guaranteeDays && !showSetForm && !loading && (
          <button onClick={() => setShowSetForm(true)}
            className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:bg-brand-50 rounded-md px-2 py-1 transition-colors">
            <Plus className="h-3.5 w-3.5" />Set Guarantee
          </button>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* No guarantee set */}
      {!loading && !guaranteeDays && !showSetForm && (
        <div className="rounded-xl border border-dashed border-border p-4 text-center">
          <Shield className="mx-auto h-6 w-6 text-muted-foreground/40 mb-2" />
          <p className="text-xs text-muted-foreground">No guarantee period configured</p>
        </div>
      )}

      {/* Guarantee status */}
      {!loading && guaranteeDays && (
        <div className={cn("rounded-xl border p-4 space-y-3", statusCfg.bg, "border-transparent")}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <StatusIcon className={cn("h-5 w-5", statusCfg.color)} />
              <div>
                <p className={cn("text-sm font-semibold", statusCfg.color)}>{statusCfg.label}</p>
                <p className="text-xs text-muted-foreground">
                  {guaranteeDays}d guarantee
                  {guaranteeExpires && ` · Expires ${new Date(guaranteeExpires).toLocaleDateString()}`}
                </p>
              </div>
            </div>
            {daysRemaining !== null && daysRemaining >= 0 && (
              <div className={cn("rounded-full px-2.5 py-1 text-xs font-bold", isAtRisk ? "bg-amber-200 text-amber-800" : "bg-card/60 text-foreground")}>
                {daysRemaining}d left
              </div>
            )}
          </div>

          {isAtRisk && (
            <div className="flex items-center gap-2 text-xs text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Guarantee expires soon — monitor candidate retention
            </div>
          )}

          {guaranteeStatus === "active" && (
            <div className="flex gap-2">
              <button onClick={() => setShowSetForm(true)}
                className="flex items-center gap-1 rounded-md border border-border bg-card/60 px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-card transition-colors">
                <Calendar className="h-3 w-3" />Edit
              </button>
              <button onClick={() => setShowBreachForm(true)}
                className="flex items-center gap-1 rounded-md bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700 transition-colors">
                <ShieldOff className="h-3 w-3" />Flag Breach
              </button>
            </div>
          )}
        </div>
      )}

      {/* Replacements */}
      {!loading && replacements.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-foreground">Replacement Requests</p>
          {replacements.map((r) => {
            const cfg = REPLACEMENT_STATUS_CFG[r.status];
            return (
              <div key={r.id} className="rounded-xl border border-border bg-card p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", cfg.color)}>
                    {cfg.label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Left {new Date(r.candidateLeftAt).toLocaleDateString()}
                  </span>
                </div>
                {r.reason && <p className="text-xs text-muted-foreground">Reason: {r.reason}</p>}
                {r.replacementDeadline && (
                  <p className="text-xs text-muted-foreground">
                    Deadline: {new Date(r.replacementDeadline).toLocaleDateString()}
                  </p>
                )}
                {r.status === "open" && (
                  <div className="flex gap-2">
                    <button onClick={() => updateReplacementStatus(r.id, "in_progress")}
                      className="flex-1 rounded-md border border-border py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors">
                      Start Search
                    </button>
                    <button onClick={() => updateReplacementStatus(r.id, "filled")}
                      className="flex-1 flex items-center justify-center gap-1 rounded-md bg-emerald-600 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors">
                      <CheckCircle2 className="h-3 w-3" />Mark Filled
                    </button>
                  </div>
                )}
                {r.status === "in_progress" && (
                  <button onClick={() => updateReplacementStatus(r.id, "filled")}
                    className="w-full flex items-center justify-center gap-1 rounded-md bg-emerald-600 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors">
                    <CheckCircle2 className="h-3 w-3" />Mark Filled
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Forms */}
      {showSetForm && (
        <SetGuaranteeForm
          onSave={(days, date) => setGuarantee(days, date)}
          onClose={() => setShowSetForm(false)}
        />
      )}
      {showBreachForm && (
        <FlagBreachForm
          onFlag={(reason, date) => flagBreach(reason, date)}
          onClose={() => setShowBreachForm(false)}
        />
      )}
    </div>
  );
}
