/**
 * US-511: useExperiment(key) hook.
 *
 *   const { variant, loading } = useExperiment("new_kanban_layout");
 *   if (variant === "treatment") return <NewKanban />;
 *   return <OldKanban />;
 *
 * Variant of `null` means the user isn't enrolled — render control. The hook
 * caches on the client for the session so we don't hit the API on every
 * mount (variant is sticky, so cache lifetime is fine).
 */
"use client";

import { useEffect, useState } from "react";

const cache = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();

async function fetchVariant(key: string): Promise<string | null> {
  if (cache.has(key)) return cache.get(key) ?? null;
  if (inflight.has(key)) return inflight.get(key)!;

  const p = fetch(`/api/experiments/${encodeURIComponent(key)}`, { cache: "no-store" })
    .then(r => r.json())
    .then(d => {
      const v = (d?.variant ?? null) as string | null;
      cache.set(key, v);
      inflight.delete(key);
      return v;
    })
    .catch(() => { inflight.delete(key); return null; });

  inflight.set(key, p);
  return p;
}

export function useExperiment(key: string): { variant: string | null; loading: boolean } {
  const [variant, setVariant] = useState<string | null>(cache.get(key) ?? null);
  const [loading, setLoading] = useState(!cache.has(key));

  useEffect(() => {
    if (cache.has(key)) { setVariant(cache.get(key) ?? null); setLoading(false); return; }
    let active = true;
    fetchVariant(key).then(v => { if (active) { setVariant(v); setLoading(false); } });
    return () => { active = false; };
  }, [key]);

  return { variant, loading };
}
