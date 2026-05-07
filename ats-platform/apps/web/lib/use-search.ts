"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { SearchResponse, SearchResultItem } from "@/app/api/search/route";

export interface UseSearchResult {
  results:    SearchResultItem[];
  isLoading:  boolean;
  mode:       "vector" | "keyword" | null;
  latency_ms: number | null;
  error:      string | null;
}

/**
 * Debounced semantic search hook.
 * Calls /api/search?q=... after `delay` ms of quiet typing.
 * Cancels in-flight requests when query changes.
 */
export function useSearch(query: string, delay = 280): UseSearchResult {
  const [results,    setResults]    = useState<SearchResultItem[]>([]);
  const [isLoading,  setIsLoading]  = useState(false);
  const [mode,       setMode]       = useState<"vector" | "keyword" | null>(null);
  const [latency_ms, setLatency]    = useState<number | null>(null);
  const [error,      setError]      = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(async (q: string) => {
    // Cancel any in-flight request
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(q)}&limit=12`,
        { signal: abortRef.current.signal }
      );

      if (!res.ok) throw new Error(`Search API ${res.status}`);

      const data: SearchResponse = await res.json();
      setResults(data.results);
      setMode(data.mode);
      setLatency(data.latency_ms);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return; // cancelled — ignore
      setError("Search failed");
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (!query.trim()) {
      abortRef.current?.abort();
      setResults([]);
      setIsLoading(false);
      setMode(null);
      setLatency(null);
      return;
    }

    setIsLoading(true); // optimistic — feels faster

    timerRef.current = setTimeout(() => {
      runSearch(query.trim());
    }, delay);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, delay, runSearch]);

  return { results, isLoading, mode, latency_ms, error };
}
