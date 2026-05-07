"use client";

/**
 * LonglistPanel — US-122: Candidate Longlist / Shortlist per Req
 *
 * Private per-job candidate lists: longlist → shortlist → submittal.
 * Shown on the job detail page, separate from the live pipeline.
 */

import { useState } from "react";
import Link from "next/link";
import {
  ListChecks, Plus, ArrowRight, ChevronRight, Star, Trash2,
  MapPin, Briefcase,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useJobLonglist, type LonglistType } from "@/lib/supabase/hooks";
import { toast } from "sonner";

const TAB_CONFIG: { key: LonglistType; label: string; emptyMsg: string }[] = [
  { key: "longlist",     label: "Longlist",     emptyMsg: "Add candidates you're considering." },
  { key: "shortlist",    label: "Shortlist",    emptyMsg: "Promote candidates from the longlist." },
  { key: "calibration",  label: "Calibration",  emptyMsg: "Add early calibration candidates." },
];

interface Props {
  jobId:        string;
  candidateOptions?: { id: string; firstName: string; lastName: string; headline?: string | null }[];
}

export function LonglistPanel({ jobId, candidateOptions = [] }: Props) {
  const { longlist, shortlist, calibration, loading, addToList, removeFromList, promoteToShortlist, markSubmitted } = useJobLonglist(jobId);
  const [activeTab, setActiveTab] = useState<LonglistType>("longlist");
  const [showAdd, setShowAdd] = useState(false);
  const [candidateSearch, setCandidateSearch] = useState("");
  const [notes, setNotes] = useState("");
  const [adding, setAdding] = useState(false);

  const listData: Record<LonglistType, typeof longlist> = { longlist, shortlist, calibration };
  const currentList = listData[activeTab];

  async function handleAdd(candidateId: string) {
    setAdding(true);
    try {
      await addToList(candidateId, activeTab, notes || undefined);
      toast.success("Added to list");
      setShowAdd(false);
      setNotes("");
      setCandidateSearch("");
    } catch {
      toast.error("Failed to add candidate");
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(id: string) {
    try {
      await removeFromList(id);
      toast.success("Removed from list");
    } catch {
      toast.error("Failed to remove");
    }
  }

  async function handlePromote(id: string) {
    try {
      await promoteToShortlist(id);
      toast.success("Promoted to shortlist");
    } catch {
      toast.error("Failed to promote");
    }
  }

  async function handleSubmit(id: string) {
    try {
      await markSubmitted(id);
      toast.success("Marked as submitted");
    } catch {
      toast.error("Failed to mark as submitted");
    }
  }

  const filtered = candidateOptions.filter(c =>
    `${c.firstName} ${c.lastName}`.toLowerCase().includes(candidateSearch.toLowerCase())
  );

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-5 pt-5 pb-3">
        <ListChecks className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground flex-1">Candidate Lists</h3>
        <button
          type="button"
          onClick={() => setShowAdd(v => !v)}
          className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium"
        >
          <Plus className="h-3.5 w-3.5" />
          Add candidate
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border px-5">
        {TAB_CONFIG.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key)}
            className={cn(
              "text-xs font-medium px-3 py-2 border-b-2 transition-colors",
              activeTab === t.key
                ? "border-brand-600 text-brand-600"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
            <span className="ml-1.5 text-[10px] bg-muted rounded-full px-1.5 py-0.5">
              {listData[t.key].length}
            </span>
          </button>
        ))}
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="px-5 py-3 border-b border-border bg-muted/20 space-y-2">
          <input
            type="text"
            value={candidateSearch}
            onChange={e => setCandidateSearch(e.target.value)}
            placeholder="Search candidates by name..."
            className="w-full px-2.5 py-1.5 border border-border rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-brand-600 bg-card"
          />
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            className="w-full px-2.5 py-1.5 border border-border rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-brand-600 bg-card"
          />
          {candidateSearch && filtered.length > 0 && (
            <div className="rounded-lg border border-border bg-card max-h-40 overflow-y-auto divide-y divide-border">
              {filtered.slice(0, 8).map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleAdd(c.id)}
                  disabled={adding}
                  className="w-full text-left px-3 py-2 hover:bg-muted/40 transition-colors"
                >
                  <p className="text-xs font-medium text-foreground">{c.firstName} {c.lastName}</p>
                  {c.headline && <p className="text-[10px] text-muted-foreground">{c.headline}</p>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* List */}
      <div className="divide-y divide-border">
        {loading ? (
          [...Array(3)].map((_, i) => <div key={i} className="h-14 animate-pulse bg-muted/20 m-4 rounded-lg" />)
        ) : currentList.length === 0 ? (
          <div className="py-10 text-center">
            <ListChecks className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">{TAB_CONFIG.find(t => t.key === activeTab)?.emptyMsg}</p>
          </div>
        ) : (
          currentList.map(entry => (
            <div key={entry.id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/20 transition-colors">
              <div className="flex-1 min-w-0">
                {entry.candidate ? (
                  <Link
                    href={`/candidates/${entry.candidate.id}`}
                    className="text-sm font-medium text-foreground hover:text-brand-600 truncate block"
                  >
                    {entry.candidate.firstName} {entry.candidate.lastName}
                  </Link>
                ) : (
                  <p className="text-sm font-medium text-foreground">—</p>
                )}
                <div className="flex items-center gap-2 mt-0.5">
                  {entry.candidate?.headline && (
                    <span className="text-[10px] text-muted-foreground truncate">{entry.candidate.headline}</span>
                  )}
                  {entry.candidate?.location && (
                    <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                      <MapPin className="h-2.5 w-2.5" />{entry.candidate.location}
                    </span>
                  )}
                </div>
                {entry.notes && <p className="text-[10px] text-muted-foreground mt-0.5 italic">{entry.notes}</p>}
                {entry.submittedAt && <p className="text-[10px] text-emerald-600 font-medium">Submitted ✓</p>}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {activeTab === "longlist" && !entry.promotedAt && (
                  <button
                    type="button"
                    onClick={() => handlePromote(entry.id)}
                    title="Promote to shortlist"
                    className="p-1 text-muted-foreground hover:text-brand-600 transition-colors"
                  >
                    <Star className="h-3.5 w-3.5" />
                  </button>
                )}
                {activeTab === "shortlist" && !entry.submittedAt && (
                  <button
                    type="button"
                    onClick={() => handleSubmit(entry.id)}
                    title="Mark as submitted to client"
                    className="flex items-center gap-1 text-[10px] px-2 py-1 bg-brand-600 text-white rounded-md hover:bg-brand-700 transition-colors"
                  >
                    <ArrowRight className="h-3 w-3" />
                    Submit
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleRemove(entry.id)}
                  className="p-1 text-muted-foreground hover:text-red-600 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
