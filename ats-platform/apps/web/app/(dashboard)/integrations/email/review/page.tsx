"use client";

/**
 * /integrations/email/review — Unclaimed Matches Inbox
 *
 * Lists all candidate_email_links with status='pending_review' for the
 * current user's tenant. For each, shows email preview + suggested candidate
 * + confidence %. Three actions: Confirm, Reject, Reassign.
 *
 * Stage 9.
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Mail,
  Check,
  XCircle,
  ArrowLeftRight,
  Loader2,
  Inbox,
  ChevronLeft,
  Search,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  cn,
  getInitials,
  generateAvatarColor,
  formatRelativeTime,
} from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

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
  confidence: number;
}

interface CandidateOption {
  id: string;
  name: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function EmailReviewPage() {
  const [matches, setMatches] = useState<PendingMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [reassignId, setReassignId] = useState<string | null>(null);
  const [candidateSearch, setCandidateSearch] = useState("");
  const [candidateOptions, setCandidateOptions] = useState<CandidateOption[]>(
    []
  );
  const [searchLoading, setSearchLoading] = useState(false);

  const loadMatches = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("candidate_email_links")
        .select(
          `
          id,
          candidate_id,
          matched_address,
          match_strategy,
          match_confidence,
          candidates!inner(first_name, last_name),
          email_messages!inner(
            from_addr, subject, snippet, sent_at
          )
        `
        )
        .eq("status", "pending_review")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) {
        console.error(error);
        return;
      }

      setMatches(
        (data ?? []).map((row: any) => ({
          id: row.id,
          candidateId: row.candidate_id,
          candidateName:
            `${row.candidates.first_name} ${row.candidates.last_name}`.trim(),
          matchedAddress: row.matched_address ?? null,
          subject: row.email_messages.subject ?? null,
          snippet: row.email_messages.snippet ?? null,
          sentAt: row.email_messages.sent_at,
          fromAddr: row.email_messages.from_addr,
          strategy: row.match_strategy,
          confidence: parseFloat(row.match_confidence) || 0,
        }))
      );
    } catch (err) {
      console.error("Failed to load pending matches:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMatches();
  }, [loadMatches]);

  async function handleConfirm(matchId: string, addAlt: boolean = false) {
    setProcessingId(matchId);
    try {
      const res = await fetch("/api/email/review/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkId: matchId, alsoAddAsAltEmail: addAlt }),
      });
      if (res.ok) {
        setMatches((prev) => prev.filter((m) => m.id !== matchId));
      }
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
      if (res.ok) {
        setMatches((prev) => prev.filter((m) => m.id !== matchId));
      }
    } finally {
      setProcessingId(null);
    }
  }

  async function handleReassign(matchId: string, newCandidateId: string) {
    setProcessingId(matchId);
    try {
      const res = await fetch("/api/email/review/reassign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkId: matchId, newCandidateId }),
      });
      if (res.ok) {
        setMatches((prev) => prev.filter((m) => m.id !== matchId));
        setReassignId(null);
        setCandidateSearch("");
        setCandidateOptions([]);
      }
    } finally {
      setProcessingId(null);
    }
  }

  async function searchCandidates(query: string) {
    setCandidateSearch(query);
    if (query.length < 2) {
      setCandidateOptions([]);
      return;
    }
    setSearchLoading(true);
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("candidates")
        .select("id, first_name, last_name")
        .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%`)
        .limit(10);

      setCandidateOptions(
        (data ?? []).map((c: any) => ({
          id: c.id,
          name: `${c.first_name} ${c.last_name}`.trim(),
        }))
      );
    } finally {
      setSearchLoading(false);
    }
  }

  const strategyLabel: Record<string, string> = {
    fuzzy: "Fuzzy match",
    thread: "Thread match",
    alt: "Alt address",
    exact: "Exact match",
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 border-b border-border bg-card px-6 py-4">
        <Link
          href="/settings/integrations"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground w-fit transition-colors mb-2"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Integrations
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100">
            <Mail className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">
              Unclaimed Email Matches
            </h1>
            <p className="text-xs text-muted-foreground">
              {loading
                ? "Loading..."
                : `${matches.length} email${matches.length !== 1 ? "s" : ""} need${matches.length === 1 ? "s" : ""} review`}
            </p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : matches.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 mb-4">
              <Inbox className="h-8 w-8 text-emerald-500" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">
              You&apos;re all caught up
            </h2>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm">
              No pending email matches to review. New fuzzy matches will appear
              here as emails are synced.
            </p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-4">
            {matches.map((match) => {
              const busy = processingId === match.id;
              const isReassigning = reassignId === match.id;

              return (
                <div
                  key={match.id}
                  className="rounded-xl border border-border bg-card overflow-hidden"
                >
                  {/* Match header */}
                  <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
                    <div
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white",
                        generateAvatarColor(match.candidateId)
                      )}
                    >
                      {getInitials(match.candidateName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/candidates/${match.candidateId}`}
                          className="text-sm font-semibold text-foreground hover:text-brand-600 transition-colors"
                        >
                          {match.candidateName}
                        </Link>
                        <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                          {strategyLabel[match.strategy] ?? match.strategy}
                          {match.strategy === "fuzzy" &&
                            ` (${Math.round(match.confidence * 100)}%)`}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {match.matchedAddress ?? match.fromAddr}
                      </p>
                    </div>
                  </div>

                  {/* Email preview */}
                  <div className="px-5 py-3 bg-secondary/20">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="text-[11px] text-muted-foreground">
                        <span className="font-medium text-foreground">
                          From:
                        </span>{" "}
                        {match.fromAddr}
                      </p>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {formatRelativeTime(match.sentAt)}
                      </span>
                    </div>
                    {match.subject && (
                      <p className="text-xs font-medium text-foreground truncate">
                        {match.subject}
                      </p>
                    )}
                    {match.snippet && (
                      <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">
                        {match.snippet}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="px-5 py-3 flex items-center gap-2">
                    <button
                      onClick={() => handleConfirm(match.id, true)}
                      disabled={busy}
                      className={cn(
                        "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                        "bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                      )}
                    >
                      {busy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                      Confirm
                    </button>

                    <button
                      onClick={() => handleReject(match.id)}
                      disabled={busy}
                      className={cn(
                        "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                        "border border-border bg-background text-muted-foreground hover:bg-accent disabled:opacity-50"
                      )}
                    >
                      {busy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5" />
                      )}
                      Reject
                    </button>

                    <button
                      onClick={() =>
                        setReassignId(isReassigning ? null : match.id)
                      }
                      disabled={busy}
                      className={cn(
                        "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                        isReassigning
                          ? "border border-brand-300 bg-brand-50 text-brand-700"
                          : "border border-border bg-background text-muted-foreground hover:bg-accent disabled:opacity-50"
                      )}
                    >
                      <ArrowLeftRight className="h-3.5 w-3.5" />
                      It&apos;s actually...
                    </button>
                  </div>

                  {/* Reassign picker */}
                  {isReassigning && (
                    <div className="border-t border-border px-5 py-3 bg-brand-50/30">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                        <input
                          type="text"
                          value={candidateSearch}
                          onChange={(e) => searchCandidates(e.target.value)}
                          placeholder="Search for the correct candidate..."
                          className="w-full rounded-md border border-border bg-background pl-8 pr-8 py-1.5 text-xs text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-brand-500"
                          autoFocus
                        />
                        {candidateSearch && (
                          <button
                            onClick={() => {
                              setCandidateSearch("");
                              setCandidateOptions([]);
                            }}
                            className="absolute right-2.5 top-2"
                          >
                            <X className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        )}
                      </div>

                      {searchLoading && (
                        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Searching...
                        </div>
                      )}

                      {candidateOptions.length > 0 && (
                        <div className="mt-2 rounded-md border border-border bg-background divide-y divide-border max-h-40 overflow-y-auto">
                          {candidateOptions.map((cand) => (
                            <button
                              key={cand.id}
                              onClick={() =>
                                handleReassign(match.id, cand.id)
                              }
                              disabled={busy}
                              className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-accent transition-colors text-left"
                            >
                              <div
                                className={cn(
                                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white",
                                  generateAvatarColor(cand.id)
                                )}
                              >
                                {getInitials(cand.name)}
                              </div>
                              <span className="font-medium text-foreground">
                                {cand.name}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}

                      {candidateSearch.length >= 2 &&
                        !searchLoading &&
                        candidateOptions.length === 0 && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            No candidates found for &ldquo;{candidateSearch}
                            &rdquo;
                          </p>
                        )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
