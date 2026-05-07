"use client";

import { useState } from "react";
import {
  Landmark, Plus, CheckCircle2, Clock, FileText,
  XCircle, Loader2, Pencil, Trash2, ChevronDown,
} from "lucide-react";
import {
  useSearchMilestones, type MilestoneStatus, type NewMilestoneInput,
} from "@/lib/supabase/hooks";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Config ───────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<MilestoneStatus, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  pending:  { label: "Pending",  icon: Clock,         color: "text-slate-600",   bg: "bg-slate-100"   },
  invoiced: { label: "Invoiced", icon: FileText,       color: "text-brand-600",    bg: "bg-brand-100"    },
  paid:     { label: "Paid",     icon: CheckCircle2,   color: "text-emerald-600", bg: "bg-emerald-100" },
  waived:   { label: "Waived",   icon: XCircle,        color: "text-slate-400",   bg: "bg-slate-50"    },
};

// ─── Add/edit milestone form ──────────────────────────────────────────────────

interface MilestoneFormProps {
  initial?:        Partial<NewMilestoneInput>;
  onSave:          (input: NewMilestoneInput) => Promise<void>;
  onClose:         () => void;
  retainedFee?:    number;
  remainingPct?:   number;
}

function MilestoneForm({ initial, onSave, onClose, retainedFee, remainingPct }: MilestoneFormProps) {
  const [name, setName]     = useState(initial?.name ?? "");
  const [pct, setPct]       = useState(String(initial?.tranchePct ?? ""));
  const [dueDate, setDue]   = useState(initial?.dueDate ?? "");
  const [notes, setNotes]   = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const pctNum = parseFloat(pct);
  const impliedAmount = retainedFee && pctNum > 0 ? (retainedFee * pctNum) / 100 : null;

  async function handleSave() {
    if (!name.trim()) { toast.error("Enter a milestone name"); return; }
    if (!pct || pctNum <= 0 || pctNum > 100) { toast.error("Enter a valid percentage"); return; }
    setSaving(true);
    try {
      await onSave({
        name:       name.trim(),
        tranchePct: pctNum,
        amount:     impliedAmount ?? undefined,
        dueDate:    dueDate || undefined,
        notes:      notes || undefined,
      });
      onClose();
    } finally { setSaving(false); }
  }

  return (
    <div className="rounded-xl border border-dashed border-brand-300 bg-brand-50/40 p-4 space-y-3">
      <p className="text-xs font-semibold text-foreground">{initial?.name ? "Edit Milestone" : "Add Milestone"}</p>
      <div className="space-y-2">
        <input
          value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Milestone name…"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
        />
        <div className="grid grid-cols-2 gap-2">
          <div className="relative">
            <input
              type="number" min="0.1" max={remainingPct ?? 100} step="0.01"
              value={pct} onChange={(e) => setPct(e.target.value)}
              placeholder="Tranche %"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 pr-6 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
            />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
          </div>
          <input
            type="date" value={dueDate} onChange={(e) => setDue(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        {impliedAmount !== null && (
          <p className="text-xs text-muted-foreground">≈ ${impliedAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })} of ${retainedFee?.toLocaleString()} total fee</p>
        )}
        <textarea
          value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)…"
          rows={2}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500 resize-none"
        />
      </div>
      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 rounded-lg border border-border py-2 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors">
          Cancel
        </button>
        <button onClick={handleSave} disabled={saving}
          className="flex-1 rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto" /> : "Save"}
        </button>
      </div>
    </div>
  );
}

// ─── Status dropdown ──────────────────────────────────────────────────────────

function StatusDropdown({
  milestoneId, current, onChange,
}: { milestoneId: string; current: MilestoneStatus; onChange: (id: string, s: MilestoneStatus) => void }) {
  const [open, setOpen] = useState(false);
  const cfg = STATUS_CFG[current];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn("flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold", cfg.bg, cfg.color)}
      >
        <cfg.icon className="h-3 w-3" />
        {cfg.label}
        <ChevronDown className="h-2.5 w-2.5 opacity-70" />
      </button>
      {open && (
        <div className="absolute right-0 top-7 z-20 min-w-[130px] rounded-xl border border-border bg-card shadow-lg py-1">
          {(Object.keys(STATUS_CFG) as MilestoneStatus[]).map((s) => {
            const c = STATUS_CFG[s];
            return (
              <button
                key={s}
                onClick={() => { onChange(milestoneId, s); setOpen(false); }}
                className={cn("flex w-full items-center gap-2 px-3 py-2 text-xs font-medium transition-colors hover:bg-accent", current === s && "bg-accent")}
              >
                <c.icon className={cn("h-3.5 w-3.5", c.color)} />
                {c.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

interface MilestoneBillingPanelProps {
  jobId:        string;
  retainedFee?: number;
}

export function MilestoneBillingPanel({ jobId, retainedFee }: MilestoneBillingPanelProps) {
  const {
    milestones, loading, totalPct, totalInvoiced, totalPaid,
    seedDefaults, addMilestone, updateStatus, updateMilestone, removeMilestone,
  } = useSearchMilestones(jobId);

  const [showForm, setShowForm]     = useState(false);
  const [editId, setEditId]         = useState<string | null>(null);
  const [seeding, setSeeding]       = useState(false);

  async function handleSeed() {
    setSeeding(true);
    try {
      await seedDefaults(retainedFee);
      toast.success("Default milestones added");
    } finally { setSeeding(false); }
  }

  async function handleAdd(input: NewMilestoneInput) {
    const ok = await addMilestone(input);
    if (!ok) { toast.error("Failed to add milestone"); throw new Error("Failed"); }
    toast.success("Milestone added");
  }

  async function handleEdit(input: NewMilestoneInput) {
    if (!editId) return;
    await updateMilestone(editId, input);
    toast.success("Milestone updated");
  }

  async function handleStatus(id: string, status: MilestoneStatus) {
    await updateStatus(id, status);
    toast.success(`Marked ${STATUS_CFG[status].label.toLowerCase()}`);
  }

  async function handleRemove(id: string) {
    await removeMilestone(id);
    toast.success("Milestone removed");
  }

  const remainingPct = Math.max(0, 100 - totalPct);
  const editMilestone = milestones.find((m) => m.id === editId);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Landmark className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Milestone Billing</span>
        </div>
        {!showForm && !editId && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:bg-brand-50 rounded-md px-2 py-1 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />Add
          </button>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty state — seed option */}
      {!loading && milestones.length === 0 && !showForm && (
        <div className="rounded-xl border border-dashed border-border p-5 text-center space-y-3">
          <Landmark className="mx-auto h-6 w-6 text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground">No milestones set for this retained search</p>
          <div className="flex justify-center gap-2">
            <button
              onClick={handleSeed} disabled={seeding}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors"
            >
              {seeding ? <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto" /> : "Use 3-Tranche Defaults"}
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
            >
              Add Custom
            </button>
          </div>
        </div>
      )}

      {/* Summary bar */}
      {!loading && milestones.length > 0 && (
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { label: "Allocated",  value: `${totalPct.toFixed(0)}%`,                                              color: totalPct === 100 ? "text-emerald-600" : "text-amber-600" },
            { label: "Invoiced",   value: retainedFee ? `$${(totalInvoiced / 1000).toFixed(0)}k` : `${milestones.filter(m=>m.status!=="pending"&&m.status!=="waived").length}/${milestones.length}`, color: "text-foreground" },
            { label: "Collected",  value: retainedFee ? `$${(totalPaid / 1000).toFixed(0)}k` : `${milestones.filter(m=>m.status==="paid").length}/${milestones.length}`,                              color: "text-emerald-600" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-lg border border-border bg-muted/30 py-2 px-3">
              <p className={cn("text-base font-bold", color)}>{value}</p>
              <p className="text-[10px] text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Milestone rows */}
      {!loading && milestones.map((m) => {
        if (editId === m.id) return (
          <MilestoneForm
            key={m.id}
            initial={{ name: m.name, tranchePct: m.tranchePct, dueDate: m.dueDate ?? undefined, notes: m.notes ?? undefined }}
            onSave={handleEdit}
            onClose={() => setEditId(null)}
            retainedFee={retainedFee}
          />
        );

        const cfg = STATUS_CFG[m.status];
        const isOverdue = m.dueDate && m.status === "pending" && new Date(m.dueDate) < new Date();

        return (
          <div key={m.id} className={cn("group rounded-xl border bg-card p-4 space-y-2", isOverdue ? "border-amber-300" : "border-border")}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">{m.name}</span>
                  {isOverdue && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Overdue</span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                  <span className="font-semibold text-foreground">{m.tranchePct.toFixed(1)}%</span>
                  {m.amount !== null && <span>≈ ${m.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>}
                  {m.dueDate && <span>Due {new Date(m.dueDate).toLocaleDateString()}</span>}
                  {m.invoiceNumber && <span>#{m.invoiceNumber}</span>}
                  {m.paidAt && <span className="text-emerald-600">Paid {new Date(m.paidAt).toLocaleDateString()}</span>}
                </div>
                {m.notes && <p className="mt-1 text-xs text-muted-foreground">{m.notes}</p>}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <StatusDropdown milestoneId={m.id} current={m.status} onChange={handleStatus} />
                <div className="hidden group-hover:flex items-center gap-1">
                  <button
                    onClick={() => setEditId(m.id)}
                    className="flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => handleRemove(m.id)}
                    className="flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* Add form */}
      {showForm && (
        <MilestoneForm
          onSave={handleAdd}
          onClose={() => setShowForm(false)}
          retainedFee={retainedFee}
          remainingPct={remainingPct}
        />
      )}
    </div>
  );
}
