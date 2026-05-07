"use client";

/**
 * ClosingPlaybook — US-202: Closing Playbook Automation
 *
 * Checklist widget for the final stages of a placement. Shows ordered
 * steps with completion status. Recruiter can tick off each step and
 * add notes. Initialises from a default template on first use.
 *
 * Intended usage: embedded in a pipeline candidate detail drawer or
 * in the placements/[id] page.
 */

import { useState } from "react";
import { CheckCircle2, Circle, ClipboardList, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useClosingPlaybook, type PlaybookStep } from "@/lib/supabase/hooks";
import { toast } from "sonner";

interface Props {
  jobId: string;
  candidateId: string;
}

export function ClosingPlaybook({ jobId, candidateId }: Props) {
  const { instance, loading, initPlaybook, toggleStep, completedCount, totalCount } = useClosingPlaybook(jobId, candidateId);
  const [expanded, setExpanded] = useState(true);
  const [initing, setIniting] = useState(false);
  const [noteState, setNoteState] = useState<Record<string, string>>({});

  const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  async function handleInit() {
    setIniting(true);
    try {
      await initPlaybook();
    } catch {
      toast.error("Failed to initialise playbook");
    } finally {
      setIniting(false);
    }
  }

  async function handleToggle(step: PlaybookStep) {
    await toggleStep(step.id, noteState[step.id]);
  }

  if (loading) return <div className="h-32 animate-pulse rounded-xl bg-muted" />;

  if (!instance) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center">
        <ClipboardList className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm font-medium text-foreground mb-1">No closing playbook started</p>
        <p className="text-xs text-muted-foreground mb-4">Start a playbook to track the final steps to placement.</p>
        <button
          type="button"
          onClick={handleInit}
          disabled={initing}
          className="px-4 py-2 bg-brand-600 text-white rounded-md text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
        >
          {initing ? "Starting…" : "Start closing playbook"}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-3">
          <ClipboardList className="h-4 w-4 text-brand-600" />
          <span className="text-sm font-semibold text-foreground">Closing Playbook</span>
          <span className={cn(
            "text-xs font-medium px-2 py-0.5 rounded-full",
            pct === 100 ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"
          )}>
            {completedCount}/{totalCount} done
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* Progress bar */}
          <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", pct === 100 ? "bg-emerald-500" : "bg-brand-600")}
              style={{ width: `${pct}%` }}
            />
          </div>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {/* Steps */}
      {expanded && (
        <div className="border-t border-border divide-y divide-border/50">
          {instance.steps.map((step) => (
            <div key={step.id} className={cn(
              "px-4 py-3 transition-colors",
              step.completed ? "bg-emerald-50/30" : "hover:bg-muted/20"
            )}>
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => handleToggle(step)}
                  className="mt-0.5 shrink-0 transition-colors"
                >
                  {step.completed
                    ? <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    : <Circle className="h-5 w-5 text-muted-foreground hover:text-brand-600" />
                  }
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={cn("text-sm font-medium", step.completed ? "line-through text-muted-foreground" : "text-foreground")}>
                      {step.title}
                    </p>
                    {step.required && !step.completed && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">
                        Required
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                  {step.completed && step.completedAt && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Completed {new Date(step.completedAt).toLocaleDateString()}
                      {step.completedBy && ` by ${step.completedBy}`}
                    </p>
                  )}
                  {step.note && (
                    <p className="text-xs text-foreground/70 mt-1 italic">{step.note}</p>
                  )}
                  {/* Note input when completing */}
                  {!step.completed && (
                    <input
                      type="text"
                      value={noteState[step.id] ?? ""}
                      onChange={(e) => setNoteState((n) => ({ ...n, [step.id]: e.target.value }))}
                      placeholder="Add a note (optional)"
                      className="mt-1.5 w-full px-2 py-1 text-xs border border-border/60 rounded bg-card focus:outline-none focus:ring-1 focus:ring-brand-600"
                    />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      {expanded && pct === 100 && (
        <div className="px-4 py-3 bg-emerald-50 border-t border-emerald-100 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <p className="text-sm font-semibold text-emerald-700">All steps complete — ready to confirm placement!</p>
        </div>
      )}
    </div>
  );
}
