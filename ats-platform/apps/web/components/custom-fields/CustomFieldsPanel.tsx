"use client";

/**
 * CustomFieldsPanel — renders all custom field definitions for an entity type
 * and allows editing their values for a specific record.
 *
 * Usage:
 *   <CustomFieldsPanel entity="candidate" recordId={candidate.id} />
 *   <CustomFieldsPanel entity="job"       recordId={job.id} />
 */

import { useState } from "react";
import { Check, Loader2, ExternalLink } from "lucide-react";
import {
  useCustomFieldDefinitions,
  useCustomFieldValues,
  type CustomFieldEntity,
  type CustomFieldType,
} from "@/lib/supabase/hooks";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import Link from "next/link";

// ── Input renderer ────────────────────────────────────────────────────────────

interface FieldInputProps {
  fieldType: CustomFieldType;
  options:   string[] | null;
  value:     string | number | boolean | null;
  onChange:  (v: string | number | boolean | null) => void;
}

function FieldInput({ fieldType, options, value, onChange }: FieldInputProps) {
  const cls = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-brand-500";

  switch (fieldType) {
    case "text":
    case "email":
    case "url":
      return (
        <input
          type={fieldType === "email" ? "email" : fieldType === "url" ? "url" : "text"}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value || null)}
          className={cls}
        />
      );
    case "textarea":
      return (
        <textarea
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value || null)}
          rows={3}
          className={cn(cls, "resize-y")}
        />
      );
    case "number":
      return (
        <input
          type="number"
          value={value != null ? String(value) : ""}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
          className={cls}
        />
      );
    case "date":
      return (
        <input
          type="date"
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value || null)}
          className={cls}
        />
      );
    case "boolean":
      return (
        <button
          type="button"
          onClick={() => onChange(!value)}
          className={cn(
            "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
            value ? "bg-brand-600" : "bg-muted"
          )}
        >
          <span className={cn("inline-block h-3.5 w-3.5 rounded-full bg-card shadow-sm transition-transform", value ? "translate-x-4" : "translate-x-1")} />
        </button>
      );
    case "select":
      return (
        <select
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value || null)}
          className={cls}
        >
          <option value="">— none —</option>
          {(options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    default:
      return null;
  }
}

// ── Panel ─────────────────────────────────────────────────────────────────────

interface CustomFieldsPanelProps {
  entity:   CustomFieldEntity;
  recordId: string | null | undefined;
  /** If true, show a link to settings when no fields exist */
  showSettingsLink?: boolean;
}

export function CustomFieldsPanel({ entity, recordId, showSettingsLink = true }: CustomFieldsPanelProps) {
  const { defs, loading: defsLoading } = useCustomFieldDefinitions(entity);
  const { values, loading: valsLoading, setValue } = useCustomFieldValues(entity, recordId);

  // Local "dirty" state per field while saving
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved,  setSaved]  = useState<Record<string, boolean>>({});

  const loading = defsLoading || valsLoading;

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />Loading…
      </div>
    );
  }

  if (defs.length === 0) {
    if (!showSettingsLink) return null;
    return (
      <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center">
        <p className="text-sm text-muted-foreground">No custom fields defined for {entity}s yet.</p>
        <Link
          href="/settings?section=fields"
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
        >
          Manage custom fields <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    );
  }

  async function handleChange(defId: string, fieldType: CustomFieldType, newValue: string | number | boolean | null) {
    setSaving((prev) => ({ ...prev, [defId]: true }));
    try {
      await setValue(defId, fieldType, newValue);
      setSaved((prev) => ({ ...prev, [defId]: true }));
      setTimeout(() => setSaved((prev) => ({ ...prev, [defId]: false })), 1500);
    } catch {
      toast.error("Failed to save field");
    } finally {
      setSaving((prev) => ({ ...prev, [defId]: false }));
    }
  }

  return (
    <div className="space-y-4">
      {defs.map((def) => {
        const cfv = values[def.id];
        const currentValue = cfv?.value ?? null;

        return (
          <div key={def.id} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-foreground">
                {def.name}
                {def.required && <span className="ml-1 text-red-500">*</span>}
              </label>
              {saving[def.id] && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
              {saved[def.id]  && <Check className="h-3 w-3 text-emerald-500" />}
            </div>
            <FieldInput
              fieldType={def.fieldType}
              options={def.options}
              value={currentValue}
              onChange={(v) => handleChange(def.id, def.fieldType, v)}
            />
          </div>
        );
      })}
    </div>
  );
}
