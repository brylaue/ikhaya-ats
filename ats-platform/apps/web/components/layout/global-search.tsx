"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Users,
  Briefcase,
  Building2,
  ArrowRight,
  Clock,
  Sparkles,
  Zap,
  X,
  Loader2,
} from "lucide-react";
import { useSearch } from "@/lib/use-search";
import type { SearchResultItem } from "@/app/api/search/route";
import { cn, getInitials, generateAvatarColor, truncate } from "@/lib/utils";

// ─── Config ───────────────────────────────────────────────────────────────────

const RECENT_SEARCHES = ["VP Engineering", "Sarah Mitchell", "Apex Ventures", "Python developer"];

const TYPE_ICON: Record<SearchResultItem["type"], React.ElementType> = {
  candidate: Users,
  job:       Briefcase,
  client:    Building2,
};

const TYPE_LABEL: Record<SearchResultItem["type"], string> = {
  candidate: "Candidate",
  job:       "Job",
  client:    "Client",
};

const TYPE_COLOR: Record<SearchResultItem["type"], string> = {
  candidate: "bg-violet-100 text-violet-700",
  job:       "bg-brand-100 text-brand-700",
  client:    "bg-amber-100 text-amber-700",
};

// ─── Similarity badge ─────────────────────────────────────────────────────────

function SimilarityBadge({ score }: { score: number }) {
  const pct  = Math.round(score * 100);
  const color =
    pct >= 70 ? "text-emerald-600 bg-emerald-50" :
    pct >= 45 ? "text-brand-600 bg-brand-50" :
                "text-muted-foreground bg-muted";
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums", color)}>
      {pct}%
    </span>
  );
}

// ─── Skeleton row ─────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 rounded-lg px-3 py-2.5 animate-pulse">
      <div className="h-8 w-8 rounded-full bg-muted shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 w-32 rounded bg-muted" />
        <div className="h-2.5 w-48 rounded bg-muted" />
      </div>
      <div className="h-4 w-8 rounded bg-muted" />
    </div>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <p className="mb-1 mt-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground first:mt-0">
      {label}
      <span className="ml-1.5 font-normal normal-case text-muted-foreground/60">{count}</span>
    </p>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function GlobalSearch() {
  const [open,   setOpen]   = useState(false);
  const [query,  setQuery]  = useState("");
  const [cursor, setCursor] = useState(-1);
  const inputRef            = useRef<HTMLInputElement>(null);
  const router              = useRouter();

  const { results, isLoading, mode, latency_ms } = useSearch(query);

  // Open on Cmd+K or custom event
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    function onCustom() { setOpen(true); }
    window.addEventListener("keydown", onKey);
    document.addEventListener("open-search", onCustom);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("open-search", onCustom);
    };
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 30);
      setQuery("");
      setCursor(-1);
    }
  }, [open]);

  // Arrow-key navigation
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, results.length - 1)); }
      if (e.key === "ArrowUp")   { e.preventDefault(); setCursor((c) => Math.max(c - 1, -1)); }
      if (e.key === "Enter" && cursor >= 0 && results[cursor]) {
        navigate(results[cursor].href);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, results, cursor]);

  useEffect(() => { setCursor(-1); }, [query]);

  function navigate(href: string) {
    router.push(href);
    setOpen(false);
    setQuery("");
  }

  // Group results by type for section headers
  const grouped = results.reduce<Record<string, SearchResultItem[]>>((acc, item) => {
    (acc[item.type] ??= []).push(item);
    return acc;
  }, {});

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* Modal */}
      <div className="fixed left-1/2 top-[18vh] z-50 w-full max-w-[600px] -translate-x-1/2 rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">

        {/* Input row */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3.5">
          {isLoading ? (
            <Loader2 className="h-4 w-4 shrink-0 text-brand-600 animate-spin" />
          ) : (
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search anything — candidates, jobs, skills, clients…"
            className="flex-1 bg-transparent text-sm text-foreground placeholder-muted-foreground outline-none"
          />
          <div className="flex items-center gap-2">
            {query && (
              <button onClick={() => setQuery("")} className="text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            {/* Semantic mode badge */}
            {mode && (
              <span className={cn(
                "flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                mode === "vector"
                  ? "bg-brand-50 text-brand-700 dark:bg-brand-950/40"
                  : "bg-muted text-muted-foreground"
              )}>
                {mode === "vector" ? (
                  <><Sparkles className="h-2.5 w-2.5" /> Semantic</>
                ) : (
                  <><Zap className="h-2.5 w-2.5" /> Keyword</>
                )}
              </span>
            )}
            <kbd className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">ESC</kbd>
          </div>
        </div>

        {/* Results area */}
        <div className="max-h-[400px] overflow-y-auto p-2">

          {/* Loading skeletons */}
          {isLoading && query && (
            <div className="space-y-0.5 py-1">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </div>
          )}

          {/* No results */}
          {!isLoading && query && results.length === 0 && (
            <div className="py-10 text-center">
              <Search className="mx-auto mb-2 h-6 w-6 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No results for "{query}"</p>
              <p className="mt-1 text-xs text-muted-foreground/60">
                Try a skill, title, company, or candidate name
              </p>
            </div>
          )}

          {/* Grouped results */}
          {!isLoading && results.length > 0 && (
            <div>
              {(["candidate", "job", "client"] as const).map((type) => {
                const items = grouped[type];
                if (!items?.length) return null;
                return (
                  <div key={type}>
                    <SectionHeader
                      label={TYPE_LABEL[type] + "s"}
                      count={items.length}
                    />
                    {items.map((item) => {
                      const flatIdx  = results.indexOf(item);
                      const Icon     = TYPE_ICON[item.type];
                      const isActive = flatIdx === cursor;
                      return (
                        <button
                          key={item.id}
                          onClick={() => navigate(item.href)}
                          onMouseEnter={() => setCursor(flatIdx)}
                          className={cn(
                            "group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                            isActive ? "bg-accent" : "hover:bg-accent/60"
                          )}
                        >
                          {/* Avatar or icon */}
                          {item.type === "candidate" ? (
                            <div className={cn(
                              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white",
                              generateAvatarColor(item.id)
                            )}>
                              {getInitials(item.label)}
                            </div>
                          ) : (
                            <div className={cn(
                              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                              TYPE_COLOR[item.type]
                            )}>
                              <Icon className="h-4 w-4" />
                            </div>
                          )}

                          {/* Label + sublabel */}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-foreground">{item.label}</p>
                            <p className="truncate text-xs text-muted-foreground">{truncate(item.sublabel, 52)}</p>
                          </div>

                          {/* Right-side: similarity + type badge + arrow */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            <SimilarityBadge score={item.similarity} />
                            <span className={cn(
                              "rounded-sm px-1.5 py-0.5 text-[10px] font-semibold",
                              TYPE_COLOR[item.type]
                            )}>
                              {TYPE_LABEL[item.type]}
                            </span>
                            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}

          {/* Recent searches (empty state) */}
          {!query && (
            <div className="px-1 py-2">
              <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Recent searches
              </p>
              {RECENT_SEARCHES.map((s) => (
                <button
                  key={s}
                  onClick={() => setQuery(s)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  {s}
                </button>
              ))}
              <div className="mt-3 flex items-center gap-1.5 px-2">
                <Sparkles className="h-3 w-3 text-brand-500" />
                <span className="text-[10px] text-muted-foreground">
                  Semantic search — find candidates by skill, not just keyword
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span><kbd className="font-mono">↑↓</kbd> navigate</span>
            <span><kbd className="font-mono">↵</kbd> open</span>
            <span><kbd className="font-mono">ESC</kbd> close</span>
          </div>
          {latency_ms != null && (
            <span className="text-muted-foreground/50">{latency_ms}ms</span>
          )}
        </div>
      </div>
    </>
  );
}
