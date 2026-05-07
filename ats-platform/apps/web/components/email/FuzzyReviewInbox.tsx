"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { X, Check, XCircle, Mail, User, Loader2, Inbox } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn, getInitials, generateAvatarColor, formatRelativeTime } from "@/lib/utils";

interface PendingMatch {
  id: string;
  candidateId: string;
  candidateName: string;
  matchedAddress: string | null;
  subject: string | null;
  snippet: string | null;
  sentAt: string;
  fromAddr: string;
  strategy: string;
}

interface FuzzyReviewInboxProps {
  onClose: () => void;
}

export function FuzzyReviewInbox({ onClose }: FuzzyReviewInboxProps) {
  const [matches, setMatches]       = useState<PendingMatch[]>([]);
  const [loading, setLoading]       = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    loadPendingMatches();
  }, []);

  async function loadPendingMatches() {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("candidate_email_links")
        .select(`
          id,
          candidate_id,
          matched_address,
          match_strategy,
          candidates!inner(first_name, last_name),
          email_messages!inner(
            from_addr, subject, snippet, sent_at
          )
        `)
        .eq("status", "pending_review")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) { console.error(error); return; }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setMatches((data ?? []).map((row: any) => ({
        id:             row.id,
        candidateId:    row.candidate_id,
        candidateName:  `${row.candidates.first_name} ${row.candidates.last_name}`.trim(),
        matchedAddress: row.matched_address ?? null,
        subject:        row.email_messages.subject ?? null,
        snippet:        row.email_messages.snippet ?? null,
        sentAt:         row.email_messages.sent_at,
        fromAddr:       row.email_messages.from_addr,
        strategy:       row.match_strategy,
      })));
    } catch (err) {
      console.error("Failed to load pending matches:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm(matchId: string) {
    setProcessingId(matchId);
    try {
      const res = await fetch("/api/email/review/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkId: matchId, alsoAddAsAltEmail: true }),
      });
      if (res.ok) setMatches((prev) => prev.filter((m) => m.id !== matchId));
    } finally {
      setProcessingId(null);
    }
  }

  async function handleReject(matchId: string) {
    setProcessingId(matchId);
    try {
      const res = await fetch("/api/email/review/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkId: matchId }),
      });
      if (res.ok) setMatches((prev) => prev.filter((m) => m.id !== matchId));
    } finally {
      setProcessingId(null);
    }
  }

  const strategyLabel: Record<string, string> = {
    fuzzy:    "Fuzzy match",
    thread:   "Thread match",
    alt:      "Alt address",
    exact:    "Exact match",
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-card shadow-2xl border-l border-border">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Mail className="h-4 w-4 text-amber-500" />
              Review email matches
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {loading ? "Loading…" : `${matches.length} pending review${matches.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : matches.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Inbox className="h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="text-sm font-medium text-foreground">All caught up</p>
              <p className="text-xs text-muted-foreground mt-1">No pending email matches to review</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {matches.map((match) => {
                const busy = processingId === match.id;
                return (
                  <div key={match.id} className="px-5 py-4 space-y-3">
                    {/* Candidate + strategy */}
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white",
                        generateAvatarColor(match.candidateId)
                      )}>
                        {getInitials(match.candidateName)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <Link
                          href={`/candidates/${match.candidateId}`}
                          className="text-xs font-semibold text-foreground hover:text-brand-600 transition-colors"
                        >
                          {match.candidateName}
                        </Link>
                        <p className="text-[10px] text-muted-foreground">{match.matchedAddress ?? match.fromAddr}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                        {strategyLabel[match.strategy] ?? match.strategy}
                      </span>
                    </div>

                    {/* Email preview */}
                    <div className="rounded-lg border border-border bg-background px-3 py-2.5 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] text-muted-foreground truncate">
                          <span className="font-medium text-foreground">From:</span> {match.fromAddr}
                        </p>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {formatRelativeTime(match.sentAt)}
                        </span>
                      </div>
                      {match.subject && (
                        <p className="text-xs font-medium text-foreground truncate">{match.subject}</p>
                      )}
                      {match.snippet && (
                        <p className="text-[11px] text-muted-foreground line-clamp-2">{match.snippet}</p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleConfirm(match.id)}
                        disabled={busy}
                        className={cn(
                          "flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-semibold transition-colors",
                          "bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                        )}
                      >
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        Confirm
                      </button>
                      <button
                        onClick={() => handleReject(match.id)}
                        disabled={busy}
                        className={cn(
                          "flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-semibold transition-colors",
                          "border border-border bg-background text-muted-foreground hover:bg-accent disabled:opacity-50"
                        )}
                      >
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                        Reject
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
