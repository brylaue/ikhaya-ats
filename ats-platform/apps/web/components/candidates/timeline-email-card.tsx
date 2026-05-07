"use client";

/**
 * Timeline email card — renders an email event inside the candidate activity timeline.
 *
 * Features:
 *   - Provider glyph (Mail icon w/ red ring = Gmail, blue ring = Outlook)
 *   - Direction indicator: inbound ↓ / outbound ↑
 *   - Subject (truncated), snippet (2 lines max)
 *   - Participants row: From / To / Cc
 *   - Match strategy chip: 'exact' / 'alt email' / 'fuzzy (87%)' / 'thread'
 *   - Thread sibling badge: "5 messages in thread" — click expands inline list
 *   - Click card → expand full body (sanitised HTML in constrained container)
 *
 * Stage 9.
 */

import { useState, useMemo } from "react";
import DOMPurify from "isomorphic-dompurify";
import {
  Mail,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Loader2,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { MatchStrategy } from "@/types/email/provider";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TimelineEmailMessage {
  id: string;
  threadId: string;
  provider: "google" | "microsoft";
  direction: "inbound" | "outbound";
  from: string;
  to: string[];
  cc: string[];
  subject: string | null;
  snippet: string | null;
  timestamp: number;
  matchStrategy: MatchStrategy;
  matchConfidence: number;
  threadMessageCount: number;
}

interface TimelineEmailCardProps {
  message: TimelineEmailMessage;
  threadSiblings?: TimelineEmailMessage[];
}

// ─── Strategy chip config ────────────────────────────────────────────────────

const STRATEGY_CONFIG: Record<
  MatchStrategy,
  { label: string; className: string }
> = {
  exact: {
    label: "Exact match",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  alt: {
    label: "Alt email",
    className: "bg-brand-50 text-brand-700 border-brand-200",
  },
  thread: {
    label: "Thread",
    className: "bg-violet-50 text-violet-700 border-violet-200",
  },
  fuzzy: {
    label: "Fuzzy",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
};

// ─── Provider glyph ──────────────────────────────────────────────────────────

function ProviderGlyph({
  provider,
}: {
  provider: "google" | "microsoft";
}) {
  const ringColor =
    provider === "google"
      ? "ring-red-400 bg-red-50 text-red-600"
      : "ring-brand-400 bg-brand-50 text-brand-600";

  return (
    <div
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-full ring-2",
        ringColor
      )}
    >
      <Mail className="h-3.5 w-3.5" />
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function TimelineEmailCard({
  message,
  threadSiblings = [],
}: TimelineEmailCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [bodyHtml, setBodyHtml] = useState<string | null>(null);
  const [bodyLoading, setBodyLoading] = useState(false);
  const [threadExpanded, setThreadExpanded] = useState(false);

  const DirectionIcon =
    message.direction === "inbound" ? ArrowDown : ArrowUp;
  const directionLabel =
    message.direction === "inbound" ? "Received" : "Sent";
  const directionColor =
    message.direction === "inbound"
      ? "text-brand-500"
      : "text-emerald-500";

  const strategyChip = STRATEGY_CONFIG[message.matchStrategy];
  const strategyLabel =
    message.matchStrategy === "fuzzy"
      ? `Fuzzy (${Math.round(message.matchConfidence * 100)}%)`
      : strategyChip.label;

  async function loadBody() {
    if (bodyHtml !== null) {
      setExpanded(!expanded);
      return;
    }
    setBodyLoading(true);
    try {
      const res = await fetch(`/api/email/message/${message.id}`);
      if (res.ok) {
        const data = await res.json();
        // SECURITY (US-313): sanitize before storing — email HTML is untrusted input
        const raw = data.bodyHtml ?? data.bodyText ?? "<p>No content</p>";
        setBodyHtml(DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } }));
      } else {
        setBodyHtml("<p class='text-muted-foreground'>Unable to load message body.</p>");
      }
    } catch {
      setBodyHtml("<p class='text-muted-foreground'>Unable to load message body.</p>");
    } finally {
      setBodyLoading(false);
      setExpanded(true);
    }
  }

  const formattedTime = new Date(message.timestamp).toLocaleString(
    undefined,
    {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }
  );

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden transition-shadow hover:shadow-sm">
      {/* ── Card header ── */}
      <button
        onClick={loadBody}
        className="w-full text-left px-4 py-3 space-y-2"
      >
        {/* Row 1: Provider glyph + Direction + Subject + Time */}
        <div className="flex items-start gap-3">
          <ProviderGlyph provider={message.provider} />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <DirectionIcon
                className={cn("h-3.5 w-3.5 shrink-0", directionColor)}
              />
              <span className="text-[10px] font-medium text-muted-foreground">
                {directionLabel}
              </span>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {formattedTime}
              </span>
            </div>

            <p className="mt-0.5 text-xs font-semibold text-foreground truncate">
              {message.subject ?? "(no subject)"}
            </p>

            {message.snippet && (
              <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">
                {message.snippet}
              </p>
            )}
          </div>

          {bodyLoading && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
          )}
        </div>

        {/* Row 2: Participants */}
        <div className="space-y-0.5 text-[10px] text-muted-foreground pl-11">
          <p className="truncate">
            <span className="font-medium text-foreground">From:</span>{" "}
            {message.from}
          </p>
          {message.to.length > 0 && (
            <p className="truncate">
              <span className="font-medium text-foreground">To:</span>{" "}
              {message.to.join(", ")}
            </p>
          )}
          {message.cc.length > 0 && (
            <p className="truncate">
              <span className="font-medium text-foreground">Cc:</span>{" "}
              {message.cc.join(", ")}
            </p>
          )}
        </div>

        {/* Row 3: Chips */}
        <div className="flex items-center gap-2 pl-11">
          <span
            className={cn(
              "rounded-full border px-1.5 py-0.5 text-[10px] font-semibold",
              strategyChip.className
            )}
          >
            {strategyLabel}
          </span>

          {message.threadMessageCount > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setThreadExpanded(!threadExpanded);
              }}
              className="flex items-center gap-1 rounded-full border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-accent transition-colors"
            >
              <MessageSquare className="h-2.5 w-2.5" />
              {message.threadMessageCount} in thread
              {threadExpanded ? (
                <ChevronUp className="h-2.5 w-2.5" />
              ) : (
                <ChevronDown className="h-2.5 w-2.5" />
              )}
            </button>
          )}
        </div>
      </button>

      {/* ── Thread siblings (inline expand) ── */}
      {threadExpanded && threadSiblings.length > 0 && (
        <div className="border-t border-border bg-secondary/20 divide-y divide-border">
          {threadSiblings.map((sib) => (
            <div key={sib.id} className="flex items-start gap-2 px-4 py-2">
              <div className={cn("mt-0.5 shrink-0", sib.direction === "inbound" ? "text-brand-400" : "text-emerald-400")}>
                {sib.direction === "inbound" ? (
                  <ArrowDown className="h-3 w-3" />
                ) : (
                  <ArrowUp className="h-3 w-3" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-muted-foreground truncate">
                  {sib.from} · {new Date(sib.timestamp).toLocaleDateString()}
                </p>
                <p className="text-[11px] text-foreground truncate">
                  {sib.subject ?? "(no subject)"}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Expanded body ── */}
      {expanded && bodyHtml && (
        <div className="border-t border-border">
          <div
            className="max-h-96 overflow-y-auto px-4 py-3 text-xs text-foreground prose prose-xs max-w-none [&_img]:max-w-full [&_img]:h-auto"
            // SECURITY (US-313): double-sanitize at render — bodyHtml is already
            // sanitized when set, but this guards against state mutations
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(bodyHtml, { USE_PROFILES: { html: true } }) }}
          />
        </div>
      )}
    </div>
  );
}
