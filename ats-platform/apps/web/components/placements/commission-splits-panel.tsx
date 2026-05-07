"use client";

import { useState, useMemo } from "react";
import {
  DollarSign, Plus, Trash2, CheckCircle2, Clock, AlertCircle,
  Loader2, Users, PieChart,
} from "lucide-react";
import {
  useCommissionSplits, COMMISSION_ROLE_LABELS,
  type CommissionRole, type PayoutStatus, type AgencyUser,
} from "@/lib/supabase/hooks";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Config ───────────────────────────────────────────────────────────────────

const PAYOUT_CFG: Record<PayoutStatus, { label: string; icon: React.ElementType; color: string }> = {
  pending:  { label: "Pending",  icon: Clock,         color: "bg-amber-100 text-amber-700"   },
  approved: { label: "Approved", icon: CheckCircle2,  color: "bg-brand-100 text-brand-700"     },
  paid:     { label: "Paid",     icon: CheckCircle2,  color: "bg-emerald-100 text-emerald-700" },
  held:     { label: "Held",     icon: AlertCircle,   color: "bg-rose-100 text-rose-700"     },
};

// ─── Add split form ───────────────────────────────────────────────────────────

interface AddSplitFormProps {
  teamMembers:    AgencyUser[];
  assignedUserIds: Set<string>;
  totalAllocated:  number;
  feeAmount?:      number;
  onAdd:          (userId: string, pct: number, role: CommissionRole) => Promise<void>;
  onClose:        () => void;
}

function AddSplitForm({ teamMembers, assignedUserIds, totalAllocated, feeAmount, onAdd, onClose }: AddSplitFormProps) {
  const [userId, setUserId] = useState("");
  const [pct, setPct]       = useState("");
  const [role, setRole]     = useState<CommissionRole>("recruiter");
  const [saving, setSaving] = useState(false);

  const remaining = Math.max(0, 100 - totalAllocated);
  const available = teamMembers.filter((u) => !assignedUserIds.has(u.id));

  async function handleAdd() {
    const pctNum = parseFloat(pct);
    if (!userId)         { toast.error("Select a team member"); return; }
    if (!pct || pctNum <= 0 || pctNum > 100) { toast.error("Enter a valid percentage"); return; }
    if (totalAllocated + pctNum > 100) { toast.error(`Only ${remaining.toFixed(1)}% remaining`); return; }
    setSaving(true);
    try {
      await onAdd(userId, pctNum, role);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-dashed border-brand-300 bg-brand-50/40 p-4 space-y-3">
      <p className="text-xs font-semibold text-foreground">Add Commission Split</p>
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-3">
          <select value={userId} onChange={(e) => setUserId(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500">
            <option value="">Select team member…</option>
            {available.map((u) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
          </select>
        </div>
        <div>
          <select value={role} onChange={(e) => setRole(e.target.value as CommissionRole)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500">
            {(Object.keys(COMMISSION_ROLE_LABELS) as CommissionRole[]).map((r) => (
              <option key={r} value={r}>{COMMISSION_ROLE_LABELS[r]}</option>
            ))}
          </select>
        </div>
        <div className="relative">
          <input
            type="number" min="0.1" max={remaining} step="0.1"
            value={pct} onChange={(e) => setPct(e.target.value)}
            placeholder={`e.g. ${remaining.toFixed(0)}`}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 pr-7 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
          />
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
        </div>
        <div className="flex gap-2">
          <button onClick={onClose}
            className="flex-1 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors">
            Cancel
          </button>
          <button onClick={handleAdd} disabled={saving}
            className="flex-1 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto" /> : "Add"}
          </button>
        </div>
      </div>
      {feeAmount && pct && parseFloat(pct) > 0 && (
        <p className="text-xs text-muted-foreground">
          ≈ ${((feeAmount * parseFloat(pct)) / 100).toLocaleString()} of ${feeAmount.toLocaleString()} total fee
        </p>
      )}
    </div>
  );
}

// ─── Allocation bar ───────────────────────────────────────────────────────────

function AllocationBar({ total }: { total: number }) {
  const color = total === 100 ? "bg-emerald-500" : total > 100 ? "bg-red-500" : "bg-amber-500";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Allocated</span>
        <span className={cn("font-semibold", total === 100 ? "text-emerald-600" : total > 100 ? "text-red-600" : "text-amber-600")}>
          {total.toFixed(1)}%
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", color)}
          style={{ width: `${Math.min(total, 100)}%` }}
        />
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

interface CommissionSplitsPanelProps {
  placementId:  string;
  feeAmount?:   number;
  teamMembers:  AgencyUser[];
}

export function CommissionSplitsPanel({ placementId, feeAmount, teamMembers }: CommissionSplitsPanelProps) {
  const { splits, loading, totalAllocated, addSplit, updatePayoutStatus, removeSplit } =
    useCommissionSplits(placementId);

  const [showAddForm, setShowAddForm] = useState(false);

  const assignedUserIds = useMemo(() => new Set(splits.map((s) => s.userId)), [splits]);

  async function handleAdd(userId: string, pct: number, role: CommissionRole) {
    const ok = await addSplit({ userId, splitPct: pct, role }, feeAmount);
    if (ok) {
      toast.success("Commission split added");
    } else {
      toast.error("Failed to add split");
      throw new Error("Failed");
    }
  }

  async function handlePayout(splitId: string, status: PayoutStatus) {
    await updatePayoutStatus(splitId, status);
    toast.success(`Split marked as ${PAYOUT_CFG[status].label.toLowerCase()}`);
  }

  async function handleRemove(splitId: string) {
    await removeSplit(splitId);
    toast.success("Split removed");
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <PieChart className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Commission Splits</span>
        </div>
        {!showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:bg-brand-50 rounded-md px-2 py-1 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />Add Split
          </button>
        )}
      </div>

      {/* Allocation bar */}
      {splits.length > 0 && <AllocationBar total={totalAllocated} />}

      {loading && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Split rows */}
      {!loading && splits.length === 0 && !showAddForm && (
        <div className="rounded-xl border border-dashed border-border p-4 text-center">
          <Users className="mx-auto h-6 w-6 text-muted-foreground/40 mb-2" />
          <p className="text-xs text-muted-foreground">No commission splits defined</p>
          <button
            onClick={() => setShowAddForm(true)}
            className="mt-1.5 text-xs font-medium text-brand-600 hover:underline"
          >
            + Add first split
          </button>
        </div>
      )}

      {!loading && splits.map((s) => {
        const cfg = PAYOUT_CFG[s.payoutStatus];
        const StatusIcon = cfg.icon;
        return (
          <div key={s.id} className="flex items-center gap-3 group rounded-lg border border-border bg-card p-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-foreground">{s.userName}</span>
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {COMMISSION_ROLE_LABELS[s.role]}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{s.splitPct.toFixed(1)}%</span>
                {s.amount && <span>≈ ${s.amount.toLocaleString()}</span>}
                {s.paidAt && <span>Paid {new Date(s.paidAt).toLocaleDateString()}</span>}
              </div>
            </div>

            {/* Payout status */}
            <div className="relative shrink-0">
              <select
                value={s.payoutStatus}
                onChange={(e) => handlePayout(s.id, e.target.value as PayoutStatus)}
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-semibold border-none outline-none cursor-pointer appearance-none pr-4",
                  cfg.color
                )}
              >
                {(Object.keys(PAYOUT_CFG) as PayoutStatus[]).map((st) => (
                  <option key={st} value={st}>{PAYOUT_CFG[st].label}</option>
                ))}
              </select>
            </div>

            <button
              onClick={() => handleRemove(s.id)}
              className="hidden group-hover:flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}

      {/* Add form */}
      {showAddForm && (
        <AddSplitForm
          teamMembers={teamMembers}
          assignedUserIds={assignedUserIds}
          totalAllocated={totalAllocated}
          feeAmount={feeAmount}
          onAdd={handleAdd}
          onClose={() => setShowAddForm(false)}
        />
      )}
    </div>
  );
}
