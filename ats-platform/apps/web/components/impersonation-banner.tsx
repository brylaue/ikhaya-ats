"use client";

/**
 * ImpersonationBanner (US-403)
 *
 * Shown at the top of every page when an impersonation session is active.
 * Reads the session ID from sessionStorage (set via URL param on consent redirect).
 * Fetches session details to show whose identity is being impersonated.
 * Provides a one-click "End session" button.
 */

import { useEffect, useState } from "react";
import { ShieldAlert, X } from "lucide-react";
import { toast } from "sonner";

interface ImpersonationInfo {
  sessionId:      string;
  targetName:     string;
  targetEmail:    string;
  impersonatorName: string;
  startedAt:      string;
}

export function ImpersonationBanner() {
  const [info, setInfo] = useState<ImpersonationInfo | null>(null);
  const [ending, setEnding] = useState(false);

  useEffect(() => {
    // On first load, pick up session ID from URL (set by consent redirect)
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("impersonating");
    if (fromUrl) {
      sessionStorage.setItem("impersonating_session_id", fromUrl);
      // Clean URL
      const clean = new URL(window.location.href);
      clean.searchParams.delete("impersonating");
      window.history.replaceState({}, "", clean.toString());
    }

    const sessionId = fromUrl ?? sessionStorage.getItem("impersonating_session_id");
    if (!sessionId) return;

    // Fetch session details
    fetch(`/api/admin/impersonate/session?id=${sessionId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setInfo({ sessionId, ...data });
      })
      .catch(() => {});
  }, []);

  async function handleEnd() {
    if (!info) return;
    setEnding(true);
    try {
      const res = await fetch("/api/admin/impersonate/end", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ sessionId: info.sessionId }),
      });
      if (!res.ok) throw new Error();
      sessionStorage.removeItem("impersonating_session_id");
      toast.success("Impersonation session ended");
      setInfo(null);
    } catch {
      toast.error("Failed to end session");
    } finally {
      setEnding(false);
    }
  }

  if (!info) return null;

  return (
    <div className="sticky top-0 z-50 flex items-center gap-3 bg-amber-500 px-4 py-2.5 text-amber-950 shadow-sm">
      <ShieldAlert className="h-4 w-4 shrink-0" />
      <p className="flex-1 text-sm font-medium">
        You are viewing as{" "}
        <span className="font-bold">{info.targetName}</span>{" "}
        <span className="opacity-75">({info.targetEmail})</span>
        {" "}— impersonated by {info.impersonatorName}. All actions are audit-logged.
      </p>
      <button
        onClick={handleEnd}
        disabled={ending}
        className="flex items-center gap-1.5 rounded-md bg-amber-950/15 px-3 py-1 text-xs font-semibold hover:bg-amber-950/25 disabled:opacity-50 transition-colors"
      >
        <X className="h-3.5 w-3.5" />
        {ending ? "Ending…" : "End session"}
      </button>
    </div>
  );
}
