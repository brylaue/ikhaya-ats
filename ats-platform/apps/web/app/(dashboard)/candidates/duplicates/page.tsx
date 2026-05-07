"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, AlertTriangle, CheckCircle2, GitMerge, Loader2 } from "lucide-react";
import { cn, generateAvatarColor, getInitials } from "@/lib/utils";
import { useCandidates, useDuplicates, type DuplicateGroup } from "@/lib/supabase/hooks";
import { MergeDialog } from "@/components/candidates/merge-dialog";

const CONFIDENCE_BADGE: Record<DuplicateGroup["confidence"], string> = {
  high:   "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
};

const REASON_LABEL: Record<DuplicateGroup["reason"], string> = {
  email: "Same email",
  phone: "Same phone",
  name:  "Same name",
};

export default function DuplicatesPage() {
  const { candidates, loading, refresh } = useCandidates();
  const { groups } = useDuplicates(candidates);

  const [openGroup, setOpenGroup]   = useState<DuplicateGroup | null>(null);
  const [dismissed, setDismissed]   = useState<Set<string>>(new Set());
  const [mergedIds, setMergedIds]   = useState<Set<string>>(new Set());

  const visibleGroups = groups.filter(
    (g) => !dismissed.has(g.id) && !g.candidates.some((c) => mergedIds.has(c.id))
  );

  const handleMerged = useCallback((survivorId: string, removedId: string) => {
    setMergedIds((prev) => new Set([...prev, removedId]));
    setOpenGroup(null);
    refresh();
  }, [refresh]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto p-8 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-4">
          <Link
            href="/candidates"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />Back to candidates
          </Link>
        </div>

        <div>
          <h1 className="text-xl font-bold text-foreground">Duplicate Candidates</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {visibleGroups.length === 0
              ? "No duplicates found"
              : `${visibleGroups.length} potential duplicate ${visibleGroups.length === 1 ? "group" : "groups"} detected`
            }
          </p>
        </div>

        {/* Empty state */}
        {visibleGroups.length === 0 && (
          <div className="rounded-2xl border border-border bg-card p-12 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground">Your candidate database is clean!</p>
            <p className="text-xs text-muted-foreground mt-1">
              No duplicates detected by email, phone, or name.
            </p>
          </div>
        )}

        {/* Duplicate groups */}
        {visibleGroups.map((group) => (
          <div key={group.id} className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className={cn("h-4 w-4", group.confidence === "high" ? "text-red-500" : "text-amber-500")} />
                <span className="text-sm font-semibold text-foreground">{REASON_LABEL[group.reason]}</span>
                <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", CONFIDENCE_BADGE[group.confidence])}>
                  {group.confidence} confidence
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDismissed((prev) => new Set([...prev, group.id]))}
                  className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent transition-colors"
                >
                  Dismiss
                </button>
                <button
                  onClick={() => setOpenGroup(group)}
                  className="flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
                >
                  <GitMerge className="h-3.5 w-3.5" />Merge
                </button>
              </div>
            </div>

            <div className="divide-y divide-border">
              {group.candidates.map((c) => (
                <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                  <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white", generateAvatarColor(c.id))}>
                    {getInitials(c.fullName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{c.fullName}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.email}
                      {c.phone ? ` · ${c.phone}` : ""}
                      {c.currentTitle ? ` · ${c.currentTitle}` : ""}
                    </p>
                  </div>
                  <Link
                    href={`/candidates/${c.id}`}
                    className="text-xs text-brand-600 hover:underline"
                  >
                    View profile
                  </Link>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Merge dialog */}
      {openGroup && (
        <MergeDialog
          group={openGroup}
          onClose={() => setOpenGroup(null)}
          onMerged={handleMerged}
        />
      )}
    </div>
  );
}
