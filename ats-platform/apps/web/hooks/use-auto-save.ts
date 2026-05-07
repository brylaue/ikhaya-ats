"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

interface UseAutoSaveOptions<T> {
  /** Unique localStorage key for this draft */
  key: string;
  /** Current value to track and persist */
  value: T;
  /** Debounce delay in ms (default 700) */
  debounceMs?: number;
  /** Skip the very first render (don't save on mount) */
  skipInitial?: boolean;
}

interface UseAutoSaveReturn<T> {
  status: SaveStatus;
  /** Load the persisted draft value (null if none) */
  loadDraft: () => T | null;
  /** Remove the draft from localStorage */
  clearDraft: () => void;
  /** Manually trigger an immediate save */
  saveNow: () => void;
}

export function useAutoSave<T>({
  key,
  value,
  debounceMs = 700,
  skipInitial = true,
}: UseAutoSaveOptions<T>): UseAutoSaveReturn<T> {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirst     = useRef(skipInitial);
  const latestValue = useRef(value);

  // Keep the ref up to date without triggering effects
  latestValue.current = value;

  const persist = useCallback(() => {
    try {
      localStorage.setItem(key, JSON.stringify(latestValue.current));
      setStatus("saved");
      // Fade back to idle after 2 s
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
    }
  }, [key]);

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    setStatus("saving");

    timerRef.current = setTimeout(persist, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, debounceMs, persist]);

  const loadDraft = useCallback((): T | null => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }, [key]);

  const clearDraft = useCallback(() => {
    try { localStorage.removeItem(key); } catch { /* no-op */ }
    setStatus("idle");
  }, [key]);

  const saveNow = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setStatus("saving");
    // Use a microtask so status renders before persist
    setTimeout(persist, 0);
  }, [persist]);

  return { status, loadDraft, clearDraft, saveNow };
}
