"use client";

/**
 * MergeDialog — side-by-side duplicate candidate merge UI.
 *
 * Usage:
 *   <MergeDialog
 *     group={duplicateGroup}
 *     onClose={() => setOpenGroup(null)}
 *     onMerged={() => refresh()}
 *   />
 *
 * Workflow:
 *   1. User picks the "primary" record (the one to keep).
 *   2. For each field that differs, user picks which value to keep.
 *   3. On confirm → we write the merged values to the primary, then
 *      delete/deactivate the secondary record(s).
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { X, Check, Loader2, AlertTriangle, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn, generateAvatarColor, getInitials } from "@/lib/utils";
import type { Candidate } from "@/types";
import type { DuplicateGroup } from "@/lib/supabase/hooks";

// ─── Mergeable fields ─────────────────────────────────────────────────────────

interface MergeField {
  key:   keyof Candidate;
  label: string;
  format?: (v: unknown) => string;
}

const MERGE_FIELDS: MergeField[] = [
  { key: "firstName",      label: "First name" },
  { key: "lastName",       label: "Last name" },
  { key: "email",          label: "Email" },
  { key: "phone",          label: "Phone" },
  { key: "currentTitle",   label: "Job title" },
  { key: "currentCompany", label: "Company" },
  { key: "location",       label: "Location",
    format: (v) => {
      if (!v) return "";
      const loc = v as Candidate["location"];
      return [loc?.city, loc?.state, loc?.country].filter(Boolean).join(", ");
    }
  },
  { key: "linkedinUrl",    label: "LinkedIn" },
  { key: "portfolioUrl",   label: "Portfolio" },
  { key: "summary",        label: "Summary" },
  { key: "source",         label: "Source" },
];

function fieldValue(c: Candidate, field: MergeField): string {
  const raw = c[field.key];
  if (raw === undefined || raw === null || raw === "") return "";
  if (field.format) return field.format(raw);
  return String(raw);
}

// ─── Main component ───────────────────────────────────────────────────────────

interface MergeDialogProps {
  group:    DuplicateGroup;
  onClose:  () => void;
  onMerged: (survivorId: string, removedId: string) => void;
}

type Step = "select_primary" | "resolve_fields" | "confirm";

export function MergeDialog({ group, onClose, onMerged }: MergeDialogProps) {
  const [step,       setStep]       = useState<Step>("select_primary");
  const [primaryId,  setPrimaryId]  = useState<string>(group.candidates[0].id);
  const [secondaryId,setSecondaryId]= useState<string>(group.candidates[1]?.id ?? "");
  const [fieldPicks, setFieldPicks] = useState<Record<string, string>>({}); // field.key → candidateId to take value from
  const [merging,    setMerging]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus trap + Escape to close
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab") return;
      const els = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!els || els.length === 0) return;
      const first = els[0]; const last = els[els.length - 1];
      if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
      else { if (document.activeElement === last) { e.preventDefault(); first.focus(); } }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => { document.removeEventListener("keydown", handleKeyDown); prev?.focus(); };
  }, [onClose]);

  const primary   = group.candidates.find((c) => c.id === primaryId)!;
  const secondary = group.candidates.find((c) => c.id === secondaryId);

  // Fields with different values between primary and secondary
  const conflictingFields = useCallback(() => {
    if (!secondary) return [];
    return MERGE_FIELDS.filter((f) => {
      const a = fieldValue(primary, f);
      const b = fieldValue(secondary, f);
      return a !== b && (a || b); // at least one has a value
    });
  }, [primary, secondary])();

  function selectPrimary(id: string) {
    const other = group.candidates.find((c) => c.id !== id);
    setPrimaryId(id);
    setSecondaryId(other?.id ?? "");
    setFieldPicks({});
  }

  function toggleFieldPick(fieldKey: string, candidateId: string) {
    setFieldPicks((prev) => ({ ...prev, [fieldKey]: candidateId }));
  }

  function pickForField(fieldKey: string): string {
    return fieldPicks[fieldKey] ?? primaryId;
  }

  // ── Execute merge ───────────────────────────────────────────────────────────
  async function handleMerge() {
    if (!secondary) return;
    setMerging(true);
    setError(null);

    const supabase = createClient();

    // Build the update payload: start with primary's values, then apply picks
    const updates: Record<string, unknown> = {};
    for (const f of MERGE_FIELDS) {
      const sourceCandidateId = pickForField(String(f.key));
      const sourceCandidate   = sourceCandidateId === primaryId ? primary : secondary;
      const val = sourceCandidate[f.key];

      // Map frontend field keys → DB column names
      const colMap: Record<string, string> = {
        firstName:      "first_name",
        lastName:       "last_name",
        email:          "email",
        phone:          "phone",
        currentTitle:   "current_title",
        currentCompany: "current_company",
        location:       "location",
        linkedinUrl:    "linkedin_url",
        portfolioUrl:   "portfolio_url",
        summary:        "summary",
        source:         "source",
      };
      const col = colMap[f.key as string];
      if (col) updates[col] = val ?? null;
    }

    // 1. Update the primary record with merged values
    const { error: updateErr } = await supabase
      .from("candidates")
      .update(updates)
      .eq("id", primaryId);

    if (updateErr) {
      setError(`Failed to update primary record: ${updateErr.message}`);
      setMerging(false);
      return;
    }

    // 2. Reassign pipeline entries from secondary → primary
    await supabase
      .from("candidate_pipeline_entries")
      .update({ candidate_id: primaryId })
      .eq("candidate_id", secondaryId);

    // 3. Reassign tags from secondary → primary (ignore duplicates)
    const { data: secondaryTags } = await supabase
      .from("candidate_tags")
      .select("tag_id")
      .eq("candidate_id", secondaryId);

    if (secondaryTags?.length) {
      const { data: primaryTags } = await supabase
        .from("candidate_tags")
        .select("tag_id")
        .eq("candidate_id", primaryId);

      const primaryTagIds = new Set((primaryTags ?? []).map((t: { tag_id: string }) => t.tag_id));
      const tagsToAdd = secondaryTags
        .filter((t: { tag_id: string }) => !primaryTagIds.has(t.tag_id))
        .map((t: { tag_id: string }) => ({ candidate_id: primaryId, tag_id: t.tag_id }));

      if (tagsToAdd.length) {
        await supabase.from("candidate_tags").insert(tagsToAdd);
      }
    }

    // 4. Reassign emails (email_messages table)
    await supabase
      .from("email_messages")
      .update({ candidate_id: primaryId })
      .eq("candidate_id", secondaryId);

    // 5. Soft-delete the secondary record
    const { error: deleteErr } = await supabase
      .from("candidates")
      .update({ is_active: false, merged_into_id: primaryId })
      .eq("id", secondaryId);

    if (deleteErr) {
      // Non-fatal — primary is already updated
      console.warn("Could not deactivate secondary:", deleteErr.message);
    }

    setMerging(false);
    onMerged(primaryId, secondaryId);
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="merge-dialog-title"
        className="w-full max-w-3xl rounded-2xl bg-card shadow-2xl border border-border overflow-hidden flex flex-col max-h-[90vh]"
      >

        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 id="merge-dialog-title" className="text-base font-semibold text-foreground">Merge duplicate candidates</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Match found by{" "}
              <span className={cn("font-medium", group.confidence === "high" ? "text-red-600" : "text-amber-600")}>
                {group.reason}
              </span>{" "}
              ({group.confidence} confidence)
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-muted-foreground/60 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Step: Select primary */}
        {step === "select_primary" && (
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <p className="text-sm text-muted-foreground">Choose which record to <strong>keep</strong>. The other will be merged into it and deactivated.</p>

            <div className="grid grid-cols-2 gap-4">
              {group.candidates.map((c) => (
                <button
                  key={c.id}
                  onClick={() => selectPrimary(c.id)}
                  className={cn(
                    "rounded-xl border-2 p-4 text-left transition-all",
                    primaryId === c.id
                      ? "border-brand-500 bg-brand-50"
                      : "border-border bg-card hover:border-border"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white", generateAvatarColor(c.id))}>
                      {getInitials(c.fullName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-foreground text-sm">{c.fullName}</p>
                        {primaryId === c.id && (
                          <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold text-brand-700">Keep</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{c.email}</p>
                      {c.currentTitle && <p className="text-xs text-muted-foreground/60">{c.currentTitle}{c.currentCompany ? ` · ${c.currentCompany}` : ""}</p>}
                      <p className="text-[10px] text-muted-foreground/60 mt-1">Created {new Date(c.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step: Resolve field conflicts */}
        {step === "resolve_fields" && secondary && (
          <div className="flex-1 overflow-y-auto p-6 space-y-3">
            <p className="text-sm text-muted-foreground">
              Pick which value to keep for each conflicting field.
              Fields already identical are kept automatically.
            </p>

            {conflictingFields.length === 0 ? (
              <div className="rounded-xl border border-border bg-muted/50 p-6 text-center text-sm text-muted-foreground">
                No conflicting fields — both records have the same values. Ready to merge.
              </div>
            ) : (
              <div className="divide-y divide-gray-100 rounded-xl border border-border overflow-hidden">
                {/* Column headers */}
                <div className="grid grid-cols-[140px_1fr_1fr] bg-muted/50 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-4 py-2">
                  <span>Field</span>
                  <span className="pl-3">Keep record ({primary.fullName})</span>
                  <span className="pl-3">From duplicate ({secondary.fullName})</span>
                </div>

                {conflictingFields.map((f) => {
                  const primaryVal   = fieldValue(primary, f);
                  const secondaryVal = fieldValue(secondary, f);
                  const chosen       = pickForField(String(f.key));

                  return (
                    <div key={String(f.key)} className="grid grid-cols-[140px_1fr_1fr] items-start px-4 py-3 hover:bg-muted/50">
                      <span className="text-xs font-medium text-muted-foreground pt-0.5">{f.label}</span>

                      {/* Primary value */}
                      <button
                        onClick={() => toggleFieldPick(String(f.key), primaryId)}
                        className={cn(
                          "ml-3 rounded-lg border px-3 py-2 text-left text-xs transition-all",
                          chosen === primaryId
                            ? "border-brand-400 bg-brand-50 text-brand-900"
                            : "border-border text-muted-foreground hover:border-border"
                        )}
                      >
                        {chosen === primaryId && <Check className="mb-0.5 inline h-3 w-3 text-brand-500 mr-1" />}
                        {primaryVal || <span className="text-muted-foreground/60 italic">empty</span>}
                      </button>

                      {/* Secondary value */}
                      <button
                        onClick={() => toggleFieldPick(String(f.key), secondaryId)}
                        className={cn(
                          "ml-3 rounded-lg border px-3 py-2 text-left text-xs transition-all",
                          chosen === secondaryId
                            ? "border-brand-400 bg-brand-50 text-brand-900"
                            : "border-border text-muted-foreground hover:border-border"
                        )}
                      >
                        {chosen === secondaryId && <Check className="mb-0.5 inline h-3 w-3 text-brand-500 mr-1" />}
                        {secondaryVal || <span className="text-muted-foreground/60 italic">empty</span>}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Step: Confirm */}
        {step === "confirm" && secondary && (
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800">This action cannot be undone</p>
                  <p className="text-xs text-amber-700 mt-1">
                    <strong>{secondary.fullName}</strong> will be deactivated. All their pipeline entries, tags, and email history will be transferred to <strong>{primary.fullName}</strong>.
                  </p>
                </div>
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">{error}</div>
            )}

            <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/50 p-4">
              <div className={cn("flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white", generateAvatarColor(primary.id))}>
                {getInitials(primary.fullName)}
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{primary.fullName}</p>
                <p className="text-xs text-muted-foreground">{primary.email} · will be kept</p>
              </div>
            </div>
          </div>
        )}

        {/* Footer buttons */}
        <div className="flex items-center justify-between border-t border-border px-6 py-4">
          <button
            onClick={() => {
              if (step === "select_primary") { onClose(); return; }
              if (step === "resolve_fields") { setStep("select_primary"); return; }
              if (step === "confirm") { setStep("resolve_fields"); return; }
            }}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
          >
            {step === "select_primary" ? "Cancel" : "Back"}
          </button>

          {step === "select_primary" && (
            <button
              onClick={() => setStep("resolve_fields")}
              className="flex items-center gap-1.5 rounded-lg bg-[#1E3C78] px-4 py-2 text-sm font-semibold text-white hover:bg-[#16306a] transition-colors"
            >
              Review fields <ChevronRight className="h-4 w-4" />
            </button>
          )}

          {step === "resolve_fields" && (
            <button
              onClick={() => setStep("confirm")}
              className="flex items-center gap-1.5 rounded-lg bg-[#1E3C78] px-4 py-2 text-sm font-semibold text-white hover:bg-[#16306a] transition-colors"
            >
              Preview merge <ChevronRight className="h-4 w-4" />
            </button>
          )}

          {step === "confirm" && (
            <button
              onClick={handleMerge}
              disabled={merging}
              className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60 transition-colors"
            >
              {merging
                ? <><Loader2 className="h-4 w-4 animate-spin" />Merging…</>
                : <>Confirm merge</>
              }
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
