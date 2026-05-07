"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ChevronLeft, Plus, Pencil, Trash2, Check, X,
  DollarSign, Percent, FileText, RefreshCcw, Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useFeeModels, type FeeModel, type FeeType } from "@/lib/supabase/hooks";
import { toast } from "sonner";

// ── Config ────────────────────────────────────────────────────────────────────

const FEE_TYPE_CFG: Record<FeeType, { label: string; icon: React.ElementType; color: string; bg: string; }> = {
  percentage: { label: "Percentage",  icon: Percent,    color: "text-brand-700",    bg: "bg-brand-50"    },
  flat:       { label: "Flat Fee",    icon: DollarSign, color: "text-emerald-700", bg: "bg-emerald-50" },
  retained:   { label: "Retained",    icon: FileText,   color: "text-violet-700",  bg: "bg-violet-50"  },
  container:  { label: "Container",   icon: RefreshCcw, color: "text-amber-700",   bg: "bg-amber-50"   },
  hybrid:     { label: "Hybrid",      icon: Shield,     color: "text-slate-700",   bg: "bg-slate-100"  },
};

const BASIS_LABELS: Record<string, string> = {
  first_year_salary: "First Year Salary",
  total_comp:        "Total Compensation",
  base_salary:       "Base Salary",
  package:           "Package Value",
};

// ── Model card ────────────────────────────────────────────────────────────────

function FeeModelCard({
  model,
  onEdit,
  onDelete,
}: {
  model:    FeeModel;
  onEdit:   () => void;
  onDelete: () => void;
}) {
  const cfg = FEE_TYPE_CFG[model.feeType];
  const Icon = cfg.icon;

  const feeDisplay = (() => {
    if (model.feeType === "percentage" && model.percentage != null)
      return `${model.percentage}% of ${BASIS_LABELS[model.basis ?? "first_year_salary"] ?? model.basis}`;
    if (model.feeType === "flat" && model.flatAmount != null)
      return `${model.currency} ${model.flatAmount.toLocaleString()} flat`;
    if (model.feeType === "retained" && model.retainerAmount != null)
      return `${model.currency} ${model.retainerAmount.toLocaleString()} retainer`;
    if (model.feeType === "container") return "Container (installment-based)";
    return "Hybrid (see notes)";
  })();

  return (
    <div className={cn("rounded-xl border bg-card p-5", model.isDefault ? "border-brand-300 shadow-sm" : "border-border")}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", cfg.bg)}>
            <Icon className={cn("h-4 w-4", cfg.color)} />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-semibold text-foreground">{model.name}</p>
              {model.isDefault && (
                <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-[9px] font-bold text-brand-700">DEFAULT</span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">{feeDisplay}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onEdit} className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button onClick={onDelete} className="rounded-md p-1.5 text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {model.description && <p className="text-xs text-muted-foreground mb-3">{model.description}</p>}

      <div className="flex flex-wrap gap-2 text-[10px]">
        {model.paymentTerms && (
          <span className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">{model.paymentTerms}</span>
        )}
        {model.guaranteeDays != null && (
          <span className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">{model.guaranteeDays}d guarantee</span>
        )}
        {model.splitInvoicing && (
          <span className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">Split invoicing</span>
        )}
        {model.offLimitsMonths > 0 && (
          <span className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">{model.offLimitsMonths}mo off-limits</span>
        )}
      </div>
    </div>
  );
}

// ── Model form ────────────────────────────────────────────────────────────────

const BLANK_MODEL: Omit<FeeModel, "id" | "agencyId" | "createdAt"> = {
  name:              "",
  description:       null,
  feeType:           "percentage",
  percentage:        25,
  basis:             "first_year_salary",
  flatAmount:        null,
  currency:          "USD",
  retainerAmount:    null,
  retainerSchedule:  null,
  paymentTerms:      "Net 30",
  splitInvoicing:    false,
  invoiceSplits:     [],
  guaranteeDays:     90,
  replacementTerms:  null,
  offLimitsMonths:   12,
  notes:             null,
  isDefault:         false,
  createdBy:         null,
};

function FeeModelForm({
  initial,
  onSave,
  onCancel,
}: {
  initial:  Omit<FeeModel, "id" | "agencyId" | "createdAt">;
  onSave:   (m: Omit<FeeModel, "id" | "agencyId" | "createdAt">) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  const cls = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500";
  const labelCls = "text-[11px] font-medium text-muted-foreground uppercase tracking-wide";

  async function handleSave() {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try { await onSave(form); }
    finally { setSaving(false); }
  }

  return (
    <div className="rounded-xl border border-brand-200 bg-card p-6 space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">{initial.name ? "Edit Fee Model" : "New Fee Model"}</p>
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>

      {/* Name + Type */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className={labelCls}>Model Name *</label>
          <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Standard Agency 25%" className={cls} />
        </div>
        <div className="space-y-1">
          <label className={labelCls}>Fee Type</label>
          <select value={form.feeType} onChange={(e) => set("feeType", e.target.value as FeeType)} className={cls}>
            {(Object.keys(FEE_TYPE_CFG) as FeeType[]).map((t) => (
              <option key={t} value={t}>{FEE_TYPE_CFG[t].label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Fee amounts */}
      {(form.feeType === "percentage" || form.feeType === "hybrid") && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className={labelCls}>Percentage (%)</label>
            <input type="number" min={0} max={100} step={0.5} value={form.percentage ?? ""} onChange={(e) => set("percentage", e.target.value ? +e.target.value : null)} className={cls} />
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Basis</label>
            <select value={form.basis ?? "first_year_salary"} onChange={(e) => set("basis", e.target.value as typeof form.basis)} className={cls}>
              {Object.entries(BASIS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
      )}

      {(form.feeType === "flat" || form.feeType === "hybrid") && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className={labelCls}>Flat Amount</label>
            <input type="number" min={0} value={form.flatAmount ?? ""} onChange={(e) => set("flatAmount", e.target.value ? +e.target.value : null)} className={cls} />
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Currency</label>
            <input value={form.currency} onChange={(e) => set("currency", e.target.value)} className={cls} />
          </div>
        </div>
      )}

      {(form.feeType === "retained" || form.feeType === "container") && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className={labelCls}>Retainer Amount</label>
            <input type="number" min={0} value={form.retainerAmount ?? ""} onChange={(e) => set("retainerAmount", e.target.value ? +e.target.value : null)} className={cls} />
          </div>
          <div className="space-y-1">
            <label className={labelCls}>Currency</label>
            <input value={form.currency} onChange={(e) => set("currency", e.target.value)} className={cls} />
          </div>
        </div>
      )}

      {(form.feeType === "retained" || form.feeType === "container") && (
        <div className="space-y-1">
          <label className={labelCls}>Installment Schedule</label>
          <input value={form.retainerSchedule ?? ""} onChange={(e) => set("retainerSchedule", e.target.value || null)} placeholder="e.g. 33% on engagement, 33% shortlist, 33% placement" className={cls} />
        </div>
      )}

      {/* Payment terms + guarantee */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className={labelCls}>Payment Terms</label>
          <input value={form.paymentTerms ?? ""} onChange={(e) => set("paymentTerms", e.target.value || null)} placeholder="Net 30" className={cls} />
        </div>
        <div className="space-y-1">
          <label className={labelCls}>Guarantee (days)</label>
          <input type="number" min={0} value={form.guaranteeDays ?? ""} onChange={(e) => set("guaranteeDays", e.target.value ? +e.target.value : null)} placeholder="90" className={cls} />
        </div>
      </div>

      {/* Off-limits + split invoicing */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className={labelCls}>Off-Limits Period (months)</label>
          <input type="number" min={0} value={form.offLimitsMonths} onChange={(e) => set("offLimitsMonths", +e.target.value || 0)} className={cls} />
        </div>
        <div className="flex items-center gap-3 pt-5">
          <button
            type="button"
            onClick={() => set("splitInvoicing", !form.splitInvoicing)}
            className={cn("relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors", form.splitInvoicing ? "bg-brand-600" : "bg-muted")}
          >
            <span className={cn("inline-block h-3.5 w-3.5 rounded-full bg-card shadow-sm transition-transform", form.splitInvoicing ? "translate-x-4" : "translate-x-1")} />
          </button>
          <span className="text-xs text-foreground">Split invoicing</span>
        </div>
      </div>

      {/* Description + notes */}
      <div className="space-y-1">
        <label className={labelCls}>Description</label>
        <input value={form.description ?? ""} onChange={(e) => set("description", e.target.value || null)} placeholder="Brief description of when to use this model" className={cls} />
      </div>

      {/* Default toggle */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => set("isDefault", !form.isDefault)}
          className={cn("relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors", form.isDefault ? "bg-brand-600" : "bg-muted")}
        >
          <span className={cn("inline-block h-3.5 w-3.5 rounded-full bg-card shadow-sm transition-transform", form.isDefault ? "translate-x-4" : "translate-x-1")} />
        </button>
        <span className="text-xs text-foreground">Set as default model</span>
      </div>

      {/* Save */}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
        >
          {saving ? <RefreshCcw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Save Model
        </button>
        <button onClick={onCancel} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FeeModelsPage() {
  const { models, loading, createModel, updateModel, deleteModel } = useFeeModels();
  const [showForm,   setShowForm]   = useState(false);
  const [editModel,  setEditModel]  = useState<FeeModel | null>(null);

  async function handleCreate(input: Omit<FeeModel, "id" | "agencyId" | "createdAt">) {
    const result = await createModel(input);
    if (result && "error" in result && result.error) { toast.error(result.error); return; }
    toast.success("Fee model created");
    setShowForm(false);
  }

  async function handleUpdate(input: Omit<FeeModel, "id" | "agencyId" | "createdAt">) {
    if (!editModel) return;
    const result = await updateModel(editModel.id, input);
    if (result && "error" in result && result.error) { toast.error(result.error); return; }
    toast.success("Fee model updated");
    setEditModel(null);
  }

  async function handleDelete(id: string) {
    await deleteModel(id);
    toast.success("Fee model deleted");
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {/* Header */}
      <div className="shrink-0 border-b border-border bg-card px-6 py-4">
        <div className="flex items-center gap-3 mb-1">
          <Link href="/settings" className="text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-lg font-bold text-foreground">Fee Model Library</h1>
        </div>
        <p className="ml-7 text-sm text-muted-foreground">
          Define reusable fee structures for your agency — attach them to clients or jobs.
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 max-w-3xl">

        {/* Add button */}
        {!showForm && !editModel && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-100 transition-colors"
          >
            <Plus className="h-4 w-4" />Add Fee Model
          </button>
        )}

        {/* Create form */}
        {showForm && (
          <FeeModelForm initial={BLANK_MODEL} onSave={handleCreate} onCancel={() => setShowForm(false)} />
        )}

        {/* Edit form */}
        {editModel && (
          <FeeModelForm
            initial={editModel}
            onSave={handleUpdate}
            onCancel={() => setEditModel(null)}
          />
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <RefreshCcw className="h-4 w-4 animate-spin" />Loading fee models…
          </div>
        )}

        {/* Model cards */}
        {!loading && models.length === 0 && !showForm && (
          <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
            <DollarSign className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">No fee models yet</p>
            <p className="mt-1 text-xs text-muted-foreground">Create your first model to standardise billing across clients</p>
          </div>
        )}

        {models.map((model) => (
          !editModel || editModel.id !== model.id ? (
            <FeeModelCard
              key={model.id}
              model={model}
              onEdit={() => { setShowForm(false); setEditModel(model); }}
              onDelete={() => handleDelete(model.id)}
            />
          ) : null
        ))}
      </div>
    </div>
  );
}
