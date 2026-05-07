"use client";

/**
 * SubmissionReadinessPanel
 *
 * Shows a per-candidate checklist for a given job. Items are pulled from the
 * three-tier hierarchy (agency default → client override → req override).
 *
 * Props:
 *   jobId        — the job being submitted for
 *   candidateId  — whose readiness we're tracking (null = config view only)
 *   clientId     — for client-level override resolution
 *   onSubmit     — called when the user clicks "Submit to Client"; we pass blocked=true
 *                  if required items are incomplete so the caller can gate the action
 *   configMode   — if true, hides completion checkboxes and shows edit controls instead
 */

import { useState } from "react";
import {
  CheckCircle2, Circle, AlertTriangle, Shield, ChevronDown, ChevronRight,
  Plus, Trash2, ToggleLeft, ToggleRight, Send, Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useSubmissionChecklist,
  useChecklistConfig,
  type ChecklistItem,
} from "@/lib/supabase/hooks";
import { toast } from "sonner";

// ── Category metadata ──────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<ChecklistItem["category"], string> = {
  general:      "General",
  sourcing:     "Sourcing",
  screening:    "Screening",
  compensation: "Compensation",
  documents:    "Documents",
  references:   "References",
  compliance:   "Compliance",
};

const CATEGORY_COLORS: Record<ChecklistItem["category"], string> = {
  general:      "bg-slate-100  text-slate-700",
  sourcing:     "bg-brand-100   text-brand-700",
  screening:    "bg-purple-100 text-purple-700",
  compensation: "bg-green-100  text-green-700",
  documents:    "bg-amber-100  text-amber-700",
  references:   "bg-orange-100 text-orange-700",
  compliance:   "bg-red-100    text-red-700",
};

// ── Progress bar ───────────────────────────────────────────────────────────────

function ProgressBar({ pct, blocked }: { pct: number; blocked: boolean }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
      <div
        className={cn(
          "h-full rounded-full transition-all duration-500",
          blocked ? "bg-amber-500" : pct >= 100 ? "bg-emerald-500" : "bg-brand-500"
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ── Individual checklist row ───────────────────────────────────────────────────

interface ChecklistRowProps {
  item: ChecklistItem;
  checked: boolean;
  onToggle: (id: string) => void;
}

function ChecklistRow({ item, checked, onToggle }: ChecklistRowProps) {
  return (
    <button
      onClick={() => onToggle(item.id)}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
        checked
          ? "border-emerald-200 bg-emerald-50"
          : "border-border bg-background hover:bg-accent"
      )}
    >
      {checked
        ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        : <Circle      className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      }
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn("text-sm font-medium", checked ? "text-emerald-700 line-through decoration-emerald-400" : "text-foreground")}>
            {item.label}
          </span>
          {item.required && !checked && (
            <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[9px] font-semibold text-red-600 border border-red-200">
              Required
            </span>
          )}
          <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-medium", CATEGORY_COLORS[item.category])}>
            {CATEGORY_LABELS[item.category]}
          </span>
        </div>
        {item.description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
        )}
      </div>
    </button>
  );
}

// ── Config row (settings / onboarding surface) ─────────────────────────────────

interface ConfigRowProps {
  item: ChecklistItem;
  onToggleRequired: (id: string) => void;
  onRemove: (id: string) => void;
}

function ConfigRow({ item, onToggleRequired, onRemove }: ConfigRowProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground">{item.label}</span>
          <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-medium", CATEGORY_COLORS[item.category])}>
            {CATEGORY_LABELS[item.category]}
          </span>
        </div>
        {item.description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
        )}
      </div>
      <button
        onClick={() => onToggleRequired(item.id)}
        title={item.required ? "Required — click to make optional" : "Optional — click to make required"}
        className={cn("shrink-0 transition-colors", item.required ? "text-red-500 hover:text-red-600" : "text-muted-foreground hover:text-foreground")}
      >
        {item.required
          ? <ToggleRight className="h-5 w-5" />
          : <ToggleLeft  className="h-5 w-5" />
        }
      </button>
      <button
        onClick={() => onRemove(item.id)}
        className="shrink-0 text-muted-foreground hover:text-red-500 transition-colors"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

// ── Add item form ──────────────────────────────────────────────────────────────

interface AddItemFormProps {
  onAdd: (label: string, category: ChecklistItem["category"], required: boolean) => void;
}

function AddItemForm({ onAdd }: AddItemFormProps) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState<ChecklistItem["category"]>("general");
  const [required, setRequired] = useState(true);

  function submit() {
    const trimmed = label.trim();
    if (!trimmed) return;
    onAdd(trimmed, category, required);
    setLabel(""); setOpen(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-xs text-muted-foreground hover:border-brand-400 hover:text-brand-600 transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />Add checklist item
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-brand-200 bg-brand-50/40 p-3">
      <input
        autoFocus
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") setOpen(false); }}
        placeholder="Checklist item label…"
        className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-brand-500"
      />
      <div className="flex items-center gap-2">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as ChecklistItem["category"])}
          className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-brand-500"
        >
          {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
            className="h-3.5 w-3.5 rounded"
          />
          Required
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={() => setOpen(false)} className="rounded-md px-3 py-1 text-xs text-muted-foreground hover:text-foreground">Cancel</button>
        <button onClick={submit} disabled={!label.trim()} className="rounded-md bg-brand-600 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-40">Add</button>
      </div>
    </div>
  );
}

// ── Main panel — completion view ───────────────────────────────────────────────

interface SubmissionReadinessPanelProps {
  jobId: string;
  candidateId: string;
  clientId?: string | null;
  /** Called when user presses "Submit to Client". blocked=true if required items remain. */
  onSubmit?: (blocked: boolean, incompleteRequired: { id: string; label: string }[]) => void;
  /** Hide the submit button (e.g. if caller handles it separately) */
  hideSubmitButton?: boolean;
}

export function SubmissionReadinessPanel({
  jobId,
  candidateId,
  clientId,
  onSubmit,
  hideSubmitButton = false,
}: SubmissionReadinessPanelProps) {
  const {
    items, loading,
    isComplete, allRequiredDone, requiredCount, doneRequired, progressPct,
    completeItem, uncompleteItem, recordAudit,
  } = useSubmissionChecklist(jobId, clientId, candidateId);

  const [submitting, setSubmitting] = useState(false);
  const [showBlocker, setShowBlocker] = useState(false);
  const [blockerItems, setBlockerItems] = useState<{ id: string; label: string }[]>([]);

  async function handleToggle(itemId: string) {
    if (isComplete(itemId)) {
      await uncompleteItem(itemId);
    } else {
      await completeItem(itemId);
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    const { blocked, incompleteRequired } = await recordAudit(candidateId);
    setSubmitting(false);
    if (blocked) {
      setBlockerItems(incompleteRequired);
      setShowBlocker(true);
    } else {
      onSubmit?.(false, []);
      toast.success("Candidate marked ready for submission");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
        Loading checklist…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center">
        <Shield className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">No checklist configured</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Set up your agency's default checklist in Settings → Submissions
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Progress header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-medium text-foreground">
              {allRequiredDone
                ? "All required items complete"
                : `${doneRequired} / ${requiredCount} required items`}
            </p>
            <span className="text-xs text-muted-foreground">{progressPct}%</span>
          </div>
          <ProgressBar pct={progressPct} blocked={!allRequiredDone} />
        </div>
      </div>

      {/* Checklist items */}
      <div className="space-y-2">
        {items.map((item) => (
          <ChecklistRow
            key={item.id}
            item={item}
            checked={isComplete(item.id)}
            onToggle={handleToggle}
          />
        ))}
      </div>

      {/* Blocker warning */}
      {showBlocker && blockerItems.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div>
              <p className="text-xs font-semibold text-amber-900">Required items incomplete</p>
              <ul className="mt-1 space-y-0.5">
                {blockerItems.map((b) => (
                  <li key={b.id} className="text-xs text-amber-800">• {b.label}</li>
                ))}
              </ul>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => { setShowBlocker(false); onSubmit?.(true, blockerItems); }}
                  className="text-[11px] font-semibold text-amber-700 hover:text-amber-900 underline"
                >
                  Submit anyway
                </button>
                <button
                  onClick={() => setShowBlocker(false)}
                  className="text-[11px] text-amber-600 hover:text-amber-800"
                >
                  Go back
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Submit button */}
      {!hideSubmitButton && (
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-colors",
            allRequiredDone
              ? "bg-emerald-600 text-white hover:bg-emerald-700"
              : "bg-amber-500 text-white hover:bg-amber-600"
          )}
        >
          {!allRequiredDone && <Lock className="h-4 w-4" />}
          <Send className="h-4 w-4" />
          {submitting ? "Recording…" : "Submit to Client"}
        </button>
      )}
    </div>
  );
}

// ── Config panel (settings / onboarding surface) ───────────────────────────────

interface ChecklistConfigPanelProps {
  /** Pass clientId to manage client-specific overrides */
  clientId?: string | null;
  /** Pass jobId to manage req-specific overrides */
  jobId?: string | null;
  title?: string;
}

export function ChecklistConfigPanel({ clientId, jobId, title }: ChecklistConfigPanelProps) {
  const { items, loading, addItem, toggleRequired, removeItem } = useChecklistConfig(clientId, jobId);
  const [expanded, setExpanded] = useState(true);

  const scopeLabel = jobId ? "This Req" : clientId ? "This Client" : "Agency Defaults";

  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <div>
          <p className="text-sm font-semibold text-foreground">{title ?? "Submission Checklist"}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{scopeLabel} · {items.length} items</p>
        </div>
        {expanded
          ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
          : <ChevronRight className="h-4 w-4 text-muted-foreground" />
        }
      </button>

      {expanded && (
        <div className="border-t border-border px-5 py-4 space-y-2">
          {loading ? (
            <p className="text-xs text-muted-foreground py-4 text-center">Loading…</p>
          ) : (
            <>
              {items.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No items yet. Add your first checklist item below.
                </p>
              )}
              {items.map((item) => (
                <ConfigRow
                  key={item.id}
                  item={item}
                  onToggleRequired={toggleRequired}
                  onRemove={removeItem}
                />
              ))}
              <AddItemForm
                onAdd={(label, category, required) => {
                  addItem(label, { category, required });
                  toast.success("Checklist item added");
                }}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
