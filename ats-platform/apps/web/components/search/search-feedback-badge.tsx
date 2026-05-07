"use client";

/**
 * SearchFeedbackBadge — US-488: Explicit Search Result Feedback
 *
 * Thumbs-up / thumbs-down control shown on a candidate card in search
 * results. Fires a signal to the search_result_feedback table.
 *
 * Props:
 *   candidateId   — the candidate being rated
 *   querySnapshot — current search query string (for context)
 *   jobId         — optional job context
 *   currentSignal — existing feedback signal if any
 *   onFeedback    — callback after signal recorded
 */

import { ThumbsUp, ThumbsDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSearchResultFeedback } from "@/lib/supabase/hooks";

interface Props {
  candidateId: string;
  querySnapshot: string;
  jobId?: string;
  size?: "sm" | "md";
}

export function SearchFeedbackBadge({ candidateId, querySnapshot, jobId, size = "sm" }: Props) {
  const { feedbackMap, giveFeedback, removeFeedback, feedbacks } = useSearchResultFeedback();
  const current = feedbackMap[candidateId];
  const existingEntry = feedbacks.find((f) => f.candidateId === candidateId);

  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  const btnBase = cn(
    "rounded-md p-1 transition-colors",
    size === "sm" ? "h-6 w-6 flex items-center justify-center" : "h-7 w-7 flex items-center justify-center"
  );

  async function handleUp() {
    if (current === "thumbs_up") {
      if (existingEntry) await removeFeedback(existingEntry.id);
    } else {
      await giveFeedback(candidateId, "thumbs_up", querySnapshot, jobId);
    }
  }

  async function handleDown() {
    if (current === "thumbs_down") {
      if (existingEntry) await removeFeedback(existingEntry.id);
    } else {
      await giveFeedback(candidateId, "thumbs_down", querySnapshot, jobId);
    }
  }

  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        title={current === "thumbs_up" ? "Remove positive feedback" : "Good fit"}
        onClick={(e) => { e.stopPropagation(); handleUp(); }}
        className={cn(
          btnBase,
          current === "thumbs_up"
            ? "bg-emerald-100 text-emerald-600 hover:bg-emerald-200"
            : "text-muted-foreground hover:bg-muted hover:text-emerald-600"
        )}
      >
        <ThumbsUp className={iconSize} />
      </button>
      <button
        type="button"
        title={current === "thumbs_down" ? "Remove negative feedback" : "Not a fit"}
        onClick={(e) => { e.stopPropagation(); handleDown(); }}
        className={cn(
          btnBase,
          current === "thumbs_down"
            ? "bg-red-100 text-red-500 hover:bg-red-200"
            : "text-muted-foreground hover:bg-muted hover:text-red-500"
        )}
      >
        <ThumbsDown className={iconSize} />
      </button>
    </div>
  );
}
