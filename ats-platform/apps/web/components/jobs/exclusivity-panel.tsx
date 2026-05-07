"use client";

/**
 * ExclusivityPanel — US-026: Requisition Exclusivity Windows
 *
 * Shows / edits exclusivity window on a job settings page.
 */

import { useState, useEffect } from "react";
import { Lock, LockOpen, AlertTriangle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useJobExclusivity } from "@/lib/supabase/hooks";
import { toast } from "sonner";

interface Props { jobId: string }

export function ExclusivityPanel({ jobId }: Props) {
  const { config, loading, saveExclusivity, isExpired, daysRemaining } = useJobExclusivity(jobId);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    exclusive:            false,
    exclusiveStartDate:   "",
    exclusiveEndDate:     "",
    exclusiveReason:      "",
    exclusiveContractRef: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (config) setForm({
      exclusive:            config.exclusive,
      exclusiveStartDate:   config.exclusiveStartDate ?? "",
      exclusiveEndDate:     config.exclusiveEndDate ?? "",
      exclusiveReason:      config.exclusiveReason ?? "",
      exclusiveContractRef: config.exclusiveContractRef ?? "",
    });
  }, [config]);

  async function handleSave() {
    setSaving(true);
    try {
      await saveExclusivity({
        exclusive:            form.exclusive,
        exclusiveStartDate:   form.exclusive ? (form.exclusiveStartDate || null) : null,
        exclusiveEndDate:     form.exclusive ? (form.exclusiveEndDate || null) : null,
        exclusiveReason:      form.exclusive ? (form.exclusiveReason || null) : null,
        exclusiveContractRef: form.exclusive ? (form.exclusiveContractRef || null) : null,
      });
      toast.success("Exclusivity saved");
      setEditing(false);
    } catch {
      toast.error("Failed to save exclusivity");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="h-24 animate-pulse rounded-xl bg-muted" />;

  const ExIcon = config?.exclusive ? Lock : LockOpen;

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ExIcon className={cn("h-4 w-4", config?.exclusive ? "text-brand-600" : "text-muted-foreground")} />
          <h3 className="text-sm font-semibold text-foreground">Exclusivity</h3>
          {config?.exclusive && (
            <span className={cn(
              "text-[11px] font-medium px-2 py-0.5 rounded-full",
              isExpired ? "bg-red-100 text-red-700" :
              (daysRemaining !== null && daysRemaining <= 14) ? "bg-amber-100 text-amber-700" :
              "bg-emerald-100 text-emerald-700"
            )}>
              {isExpired ? "Expired" : daysRemaining !== null ? `${daysRemaining}d remaining` : "Active"}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setEditing(v => !v)}
          className="text-xs text-brand-600 hover:text-brand-700 font-medium"
        >
          {editing ? "Cancel" : "Edit"}
        </button>
      </div>

      {!editing ? (
        config?.exclusive ? (
          <div className="space-y-1.5 text-sm">
            {(isExpired || (daysRemaining !== null && daysRemaining <= 14)) && (
              <div className="flex items-center gap-1.5 text-amber-700 bg-amber-50 rounded-lg px-3 py-2 text-xs">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {isExpired ? "Exclusivity window has expired." : `Expiring in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} — consider extending.`}
              </div>
            )}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              {config.exclusiveStartDate && (
                <><span className="text-muted-foreground">Start</span><span className="text-foreground">{new Date(config.exclusiveStartDate).toLocaleDateString()}</span></>
              )}
              {config.exclusiveEndDate && (
                <><span className="text-muted-foreground">End</span><span className="text-foreground">{new Date(config.exclusiveEndDate).toLocaleDateString()}</span></>
              )}
              {config.exclusiveContractRef && (
                <><span className="text-muted-foreground">Contract ref</span><span className="text-foreground">{config.exclusiveContractRef}</span></>
              )}
              {config.exclusiveReason && (
                <><span className="text-muted-foreground col-span-2">Reason</span><span className="text-foreground col-span-2">{config.exclusiveReason}</span></>
              )}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No exclusivity window set for this requisition.</p>
        )
      ) : (
        <div className="space-y-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.exclusive}
              onChange={e => setForm(f => ({ ...f, exclusive: e.target.checked }))}
              className="accent-brand-600"
            />
            <span className="text-sm text-foreground font-medium">This search is exclusive</span>
          </label>

          {form.exclusive && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">Start date</label>
                <input type="date" value={form.exclusiveStartDate}
                  onChange={e => setForm(f => ({ ...f, exclusiveStartDate: e.target.value }))}
                  className="w-full px-2.5 py-1.5 border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-brand-600 bg-card" />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">End date</label>
                <input type="date" value={form.exclusiveEndDate}
                  onChange={e => setForm(f => ({ ...f, exclusiveEndDate: e.target.value }))}
                  className="w-full px-2.5 py-1.5 border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-brand-600 bg-card" />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">Contract reference</label>
                <input type="text" value={form.exclusiveContractRef}
                  onChange={e => setForm(f => ({ ...f, exclusiveContractRef: e.target.value }))}
                  placeholder="e.g. SOW-2026-014"
                  className="w-full px-2.5 py-1.5 border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-brand-600 bg-card" />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">Reason</label>
                <input type="text" value={form.exclusiveReason}
                  onChange={e => setForm(f => ({ ...f, exclusiveReason: e.target.value }))}
                  placeholder="Retained, contractual, etc."
                  className="w-full px-2.5 py-1.5 border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-brand-600 bg-card" />
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 bg-brand-600 text-white rounded-md text-xs font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}
