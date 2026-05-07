"use client";

import { useState } from "react";
import { Mail, Send, ChevronDown, ChevronUp, Loader2, Inbox } from "lucide-react";
import { useEmailTimeline } from "@/lib/supabase/hooks";
import { cn, formatRelativeTime } from "@/lib/utils";

export interface CandidateEmailTimelineProps {
  candidateId: string;
}

export function CandidateEmailTimeline({ candidateId }: CandidateEmailTimelineProps) {
  const { messages, loading } = useEmailTimeline(candidateId);
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());

  function toggleThread(threadId: string) {
    setExpandedThreads((prev) => {
      const next = new Set(prev);
      next.has(threadId) ? next.delete(threadId) : next.add(threadId);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!messages || messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-16 text-center">
        <Inbox className="h-8 w-8 text-muted-foreground/40 mb-2" />
        <p className="text-sm font-medium text-foreground">No emails linked yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Emails will appear here once your inbox is connected and messages are matched to this candidate.
        </p>
      </div>
    );
  }

  // Group by thread
  const threadMap = new Map<string, typeof messages>();
  for (const msg of messages) {
    const key = msg.threadId ?? `solo-${msg.id}`;
    if (!threadMap.has(key)) threadMap.set(key, []);
    threadMap.get(key)!.push(msg);
  }

  // Sort threads by most recent message descending
  const threads = Array.from(threadMap.entries()).sort(([, a], [, b]) => {
    const aMax = Math.max(...a.map((m) => m.timestamp));
    const bMax = Math.max(...b.map((m) => m.timestamp));
    return bMax - aMax;
  });

  return (
    <div className="space-y-3">
      {threads.map(([threadId, msgs]) => {
        const isExpanded  = expandedThreads.has(threadId);
        const collapsible = msgs.length > 2;
        const displayed   = collapsible && !isExpanded ? msgs.slice(0, 1) : msgs;
        const latest      = msgs[0];

        return (
          <div key={threadId} className="rounded-xl border border-border bg-card overflow-hidden">
            {/* Thread header */}
            <div className="flex items-center gap-2 border-b border-border bg-secondary/30 px-4 py-2">
              <span className="flex-1 truncate text-xs font-semibold text-foreground">
                {latest.subject ?? "(no subject)"}
              </span>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {msgs.length} message{msgs.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Messages */}
            <div className="divide-y divide-border">
              {displayed.map((msg) => (
                <div key={msg.id} className="flex items-start gap-3 px-4 py-3">
                  <div className={cn(
                    "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                    msg.direction === "inbound"
                      ? "bg-brand-50 text-brand-600"
                      : "bg-emerald-50 text-emerald-600"
                  )}>
                    {msg.direction === "inbound"
                      ? <Mail className="h-3.5 w-3.5" />
                      : <Send className="h-3.5 w-3.5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-foreground truncate">
                        {msg.direction === "inbound"
                          ? `From: ${msg.from}`
                          : `To: ${msg.to?.join(", ") ?? "—"}`}
                      </p>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {formatRelativeTime(new Date(msg.timestamp).toISOString())}
                      </span>
                    </div>
                    {msg.snippet && (
                      <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">{msg.snippet}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Expand/collapse */}
            {collapsible && (
              <button
                onClick={() => toggleThread(threadId)}
                className="flex w-full items-center justify-center gap-1 border-t border-border py-2 text-[11px] font-medium text-muted-foreground hover:bg-accent transition-colors"
              >
                {isExpanded ? (
                  <><ChevronUp className="h-3 w-3" />Collapse</>
                ) : (
                  <><ChevronDown className="h-3 w-3" />Show {msgs.length - 1} more</>
                )}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
