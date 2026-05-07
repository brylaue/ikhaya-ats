"use client";

/**
 * SearchHistoryPanel — US-486: Search History & Quick Re-Run
 *
 * Dropdown panel showing the user's 20 most-recent searches with a
 * one-click re-run. Appears as a small "History" button beside the
 * main search input in the candidates page.
 *
 * Props:
 *   onRerun  — called with (query, filters) when user clicks a history entry
 *   onClear  — called when user clears all history
 */

import { useState, useRef, useEffect } from "react";
import { History, RotateCcw, Trash2, X, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSearchHistory, type SearchHistoryEntry } from "@/lib/supabase/hooks";

const TYPE_LABELS: Record<SearchHistoryEntry["searchType"], string> = {
  keyword:  "Keyword",
  boolean:  "Boolean",
  semantic: "Semantic",
  nl_talent:"NL query",
};
const TYPE_COLORS: Record<SearchHistoryEntry["searchType"], string> = {
  keyword:  "bg-slate-100 text-slate-600",
  boolean:  "bg-violet-100 text-violet-700",
  semantic: "bg-blue-100 text-blue-700",
  nl_talent:"bg-emerald-100 text-emerald-700",
};

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

interface Props {
  onRerun: (query: string, filters: Record<string, unknown>, searchType: SearchHistoryEntry["searchType"]) => void;
}

export function SearchHistoryPanel({ onRerun }: Props) {
  const { history, loading, clearHistory } = useSearchHistory();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  if (history.length === 0 && !loading) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors",
          open && "border-brand-300 text-foreground bg-muted/50"
        )}
      >
        <History className="h-3.5 w-3.5" />
        History
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-96 rounded-xl border border-border bg-card shadow-lg">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <p className="text-xs font-semibold text-foreground">Recent searches</p>
            <button
              type="button"
              onClick={() => { clearHistory(); setOpen(false); }}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-red-500 transition-colors"
            >
              <Trash2 className="h-3 w-3" />
              Clear all
            </button>
          </div>

          {/* Entries */}
          <div className="max-h-80 overflow-y-auto divide-y divide-border/50">
            {history.map((entry) => (
              <div key={entry.id} className="group flex items-start gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
                <RotateCcw className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground group-hover:text-brand-600 transition-colors" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {entry.query || <span className="text-muted-foreground italic">Filters only</span>}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full", TYPE_COLORS[entry.searchType])}>
                      {TYPE_LABELS[entry.searchType]}
                    </span>
                    {entry.resultCount > 0 && (
                      <span className="text-[10px] text-muted-foreground">{entry.resultCount} results</span>
                    )}
                    {Object.entries(entry.filters).filter(([, v]) => v && v !== "all").map(([k, v]) => (
                      <span key={k} className="text-[10px] bg-muted rounded px-1.5 py-0.5 text-muted-foreground">
                        {k}: {String(v)}
                      </span>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{relativeTime(entry.ranAt)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => { onRerun(entry.query, entry.filters, entry.searchType); setOpen(false); }}
                  className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity rounded-md bg-brand-600 text-white text-[10px] font-medium px-2 py-1 hover:bg-brand-700"
                >
                  Re-run
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
