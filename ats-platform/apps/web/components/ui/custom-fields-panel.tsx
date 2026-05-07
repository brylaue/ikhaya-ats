"use client";

/**
 * CustomFieldsPanel — renders custom field inputs for a specific record.
 *
 * Usage on a candidate page:
 *   <CustomFieldsPanel entity="candidate" recordId={candidate.id} />
 *
 * Shows all custom field definitions for the entity. Each field is editable
 * inline. Values are auto-saved on blur / change (for booleans/selects).
 */

import { useCustomFieldDefinitions, useCustomFieldValues, type CustomFieldEntity } from "@/lib/supabase/hooks";
import { cn } from "@/lib/utils";
import { Loader2, ChevronDown } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface Props {
  entity:   CustomFieldEntity;
  recordId: string | null | undefined;
  /** Optionally filter to only client-visible fields */
  clientOnly?: boolean;
  className?: string;
}

export function CustomFieldsPanel({ entity, recordId, clientOnly = false, className }: Props) {
  const { defs, loading: defsLoading } = useCustomFieldDefinitions(entity);
  const { values, loading: valsLoading, setValue } = useCustomFieldValues(entity, recordId);
  const [dirty, setDirty] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const visibleDefs = clientOnly ? defs.filter((d) => d.clientVisible) : defs;

  if (defsLoading || valsLoading) {
    return (
      <div className={cn("flex items-center justify-center py-4", className)}>
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (visibleDefs.length === 0) return null;

  async function handleSave(defId: string, fieldType: string, rawValue: string | boolean | null) {
    if (!recordId) return;
    setSaving((p) => ({ ...p, [defId]: true }));
    await setValue(defId, fieldType as Parameters<typeof setValue>[1], rawValue as string);
    setSaving((p) => ({ ...p, [defId]: false }));
    setDirty((p) => { const n = { ...p }; delete n[defId]; return n; });
    toast.success("Saved");
  }

  return (
    <div className={cn("space-y-3", className)}>
      {visibleDefs.map((def) => {
        const stored = values[def.id]?.value;
        const input  = dirty[def.id] ?? (stored != null ? String(stored) : "");
        const isSaving = saving[def.id];

        return (
          <div key={def.id}>
            <label className="block text-xs font-medium text-foreground mb-1">
              {def.name}
              {def.required && <span className="ml-1 text-red-500">*</span>}
            </label>

            {def.fieldType === "boolean" ? (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={input === "true"}
                  onChange={(e) => handleSave(def.id, def.fieldType, e.target.checked)}
                  className="rounded border-border"
                />
                <span className="text-sm text-foreground">{def.name}</span>
              </label>

            ) : def.fieldType === "select" ? (
              <select
                value={input}
                onChange={(e) => handleSave(def.id, def.fieldType, e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">— Select —</option>
                {(def.options ?? []).map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>

            ) : def.fieldType === "textarea" ? (
              <div className="relative">
                <textarea
                  rows={3}
                  value={input}
                  onChange={(e) => setDirty((p) => ({ ...p, [def.id]: e.target.value }))}
                  onBlur={(e) => {
                    if (e.target.value !== (stored != null ? String(stored) : "")) {
                      handleSave(def.id, def.fieldType, e.target.value || null);
                    }
                  }}
                  placeholder={`Enter ${def.name.toLowerCase()}…`}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                />
                {isSaving && <Loader2 className="absolute right-2 bottom-2 h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </div>

            ) : def.fieldType === "date" ? (
              <input
                type="date"
                value={input}
                onChange={(e) => handleSave(def.id, def.fieldType, e.target.value || null)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
              />

            ) : def.fieldType === "number" ? (
              <div className="relative">
                <input
                  type="number"
                  value={input}
                  onChange={(e) => setDirty((p) => ({ ...p, [def.id]: e.target.value }))}
                  onBlur={(e) => {
                    const num = parseFloat(e.target.value);
                    const prev = stored != null ? Number(stored) : null;
                    if (!isNaN(num) && num !== prev) handleSave(def.id, def.fieldType, num);
                    else if (e.target.value === "" && stored != null) handleSave(def.id, def.fieldType, null);
                  }}
                  placeholder="0"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
                />
                {isSaving && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </div>

            ) : (
              /* text / url / email */
              <div className="relative">
                <input
                  type={def.fieldType === "url" ? "url" : def.fieldType === "email" ? "email" : "text"}
                  value={input}
                  onChange={(e) => setDirty((p) => ({ ...p, [def.id]: e.target.value }))}
                  onBlur={(e) => {
                    const v = e.target.value;
                    if (v !== (stored != null ? String(stored) : "")) {
                      handleSave(def.id, def.fieldType, v || null);
                    }
                  }}
                  placeholder={`Enter ${def.name.toLowerCase()}…`}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
                />
                {isSaving && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
