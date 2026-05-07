"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Bell, Check, ChevronRight, User2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PortalSubmission } from "@/lib/supabase/hooks";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function storageKey(portalSlug: string) {
  return `portal_seen_${portalSlug}`;
}

function getSeenIds(portalSlug: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(storageKey(portalSlug));
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function saveSeenIds(portalSlug: string, ids: Set<string>) {
  try {
    localStorage.setItem(storageKey(portalSlug), JSON.stringify([...ids]));
  } catch {
    // localStorage unavailable — silent fail
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface PortalNotificationsProps {
  portalSlug:  string;
  submissions: PortalSubmission[];
}

export function PortalNotifications({ portalSlug, submissions }: PortalNotificationsProps) {
  const [seenIds, setSeenIds]   = useState<Set<string>>(new Set());
  const [open, setOpen]         = useState(false);
  const ref                     = useRef<HTMLDivElement>(null);

  // Hydrate from localStorage once mounted
  useEffect(() => {
    setSeenIds(getSeenIds(portalSlug));
  }, [portalSlug]);

  // Identify new (unseen) submissions — those with no client decision yet
  const newSubmissions = submissions.filter(
    (s) => !seenIds.has(s.id) && s.clientDecision === null
  );
  const badgeCount = newSubmissions.length;

  function markAllSeen() {
    const updated = new Set([...seenIds, ...submissions.map((s) => s.id)]);
    setSeenIds(updated);
    saveSeenIds(portalSlug, updated);
  }

  function markOneSeen(id: string) {
    const updated = new Set([...seenIds, id]);
    setSeenIds(updated);
    saveSeenIds(portalSlug, updated);
  }

  // Close on outside click
  const handleOutside = useCallback((e: MouseEvent) => {
    if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
  }, []);

  useEffect(() => {
    if (open) document.addEventListener("mousedown", handleOutside);
    else       document.removeEventListener("mousedown", handleOutside);
    return ()  => document.removeEventListener("mousedown", handleOutside);
  }, [open, handleOutside]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "relative flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
          open
            ? "border-brand-300 bg-brand-50 text-brand-700"
            : "border-slate-200 text-slate-600 hover:bg-slate-50"
        )}
      >
        <Bell className="h-3.5 w-3.5" />
        Notifications
        {badgeCount > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand-600 text-[9px] font-bold text-white">
            {badgeCount > 9 ? "9+" : badgeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border border-slate-200 bg-white shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
            {badgeCount > 0 && (
              <button
                onClick={markAllSeen}
                className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                <Check className="h-3 w-3" />
                Mark all seen
              </button>
            )}
          </div>

          {/* Notification list */}
          <div className="max-h-80 overflow-y-auto">
            {newSubmissions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-slate-100">
                  <Bell className="h-4 w-4 text-slate-400" />
                </div>
                <p className="text-xs font-medium text-slate-700">You're all caught up</p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {submissions.length > 0
                    ? "All candidates have been reviewed"
                    : "No candidates submitted yet"}
                </p>
              </div>
            ) : (
              newSubmissions.map((sub) => {
                const name = sub.candidate
                  ? `${sub.candidate.firstName} ${sub.candidate.lastName}`
                  : "Unknown Candidate";
                const title = sub.candidate?.currentTitle ?? "";
                const company = sub.candidate?.currentCompany ?? "";

                return (
                  <div
                    key={sub.id}
                    className="flex items-start gap-3 border-b border-slate-50 px-4 py-3 last:border-0"
                  >
                    {/* Avatar */}
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                      <User2 className="h-4 w-4" />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-900 leading-tight">{name}</p>
                      {(title || company) && (
                        <p className="mt-0.5 truncate text-[10px] text-slate-500">
                          {[title, company].filter(Boolean).join(" · ")}
                        </p>
                      )}
                      <p className="mt-1 text-[10px] font-medium text-brand-600">New candidate submitted</p>
                    </div>

                    {/* Dismiss */}
                    <button
                      onClick={() => markOneSeen(sub.id)}
                      className="shrink-0 rounded p-0.5 text-slate-300 hover:text-slate-500 transition-colors"
                      title="Dismiss"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          {submissions.length > 0 && (
            <div className="border-t border-slate-100 px-4 py-2.5">
              <p className="text-[10px] text-slate-400">
                {submissions.filter((s) => s.clientDecision !== null).length} of {submissions.length} candidates reviewed
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
