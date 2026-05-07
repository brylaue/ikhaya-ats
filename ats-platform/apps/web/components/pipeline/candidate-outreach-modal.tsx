"use client";

import { useState, useMemo } from "react";
import {
  X, Send, Copy, Check, Link2, Calendar,
  ExternalLink, Mail, Sparkles, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Candidate } from "@/types";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

type SlotKey = string; // "YYYY-MM-DD|HH:mm"

// ─── Constants ────────────────────────────────────────────────────────────────

const TIME_SLOTS: { label: string; value: string }[] = [
  { label: "9:00 AM",  value: "09:00" },
  { label: "10:00 AM", value: "10:00" },
  { label: "11:00 AM", value: "11:00" },
  { label: "12:00 PM", value: "12:00" },
  { label: "1:00 PM",  value: "13:00" },
  { label: "2:00 PM",  value: "14:00" },
  { label: "3:00 PM",  value: "15:00" },
  { label: "4:00 PM",  value: "16:00" },
  { label: "5:00 PM",  value: "17:00" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getNextBusinessDays(count: number): Date[] {
  const days: Date[] = [];
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  while (days.length < count) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function formatDayHeader(d: Date) {
  return {
    short: d.toLocaleDateString("en-US", { weekday: "short" }),
    date:  d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  };
}

function slotKey(date: Date, time: string): SlotKey {
  return `${date.toISOString().slice(0, 10)}|${time}`;
}

function formatSlotsForEmail(selected: Set<SlotKey>): string {
  if (selected.size === 0) return "";
  const grouped: Record<string, string[]> = {};
  selected.forEach((key) => {
    const [date, time] = key.split("|");
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(time);
  });
  return Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, times]) => {
      const d = new Date(date + "T12:00:00");
      const dayStr = d.toLocaleDateString("en-US", {
        weekday: "long", month: "long", day: "numeric",
      });
      const timeStrs = times
        .sort()
        .map((t) => {
          const [h] = t.split(":").map(Number);
          const suffix = h >= 12 ? "PM" : "AM";
          const hour   = h > 12 ? h - 12 : h === 0 ? 12 : h;
          return `${hour}:00 ${suffix}`;
        });
      return `  ${dayStr}: ${timeStrs.join(", ")}`;
    })
    .join("\n");
}

function buildEmailTemplate(
  firstName: string,
  jobTitle: string,
  clientName: string,
  stageName: string,
  schedulingUrl: string | undefined,
  selectedSlots: Set<SlotKey>,
): string {
  const intro = `Hi ${firstName},\n\nI hope you're doing well. I wanted to reach out because ${clientName} has reviewed your profile for the ${jobTitle} role and would like to move forward with a ${stageName}.`;

  if (schedulingUrl) {
    return [
      intro,
      `\nThey've set up a direct booking link so you can choose a time that works best for you:\n\n${schedulingUrl}`,
      `\nFeel free to reach out if you have any questions or if none of the available times suit you — I'm happy to help coordinate.`,
      `\nLooking forward to hearing how it goes!\n\nBest,\n[Your name]`,
    ].join("");
  }

  const slotText = formatSlotsForEmail(selectedSlots);
  const availability = slotText
    ? `\nTo keep things moving, I've pulled together some windows below — let me know which work for you and I'll confirm with the client:\n\n${slotText}\n\nIf none of these suit you, just reply with a few times that do and I'll make it work.`
    : `\nTo keep things moving, could you share a few windows of availability over the next two weeks? I'll coordinate with the client and get it confirmed.`;

  return [
    intro,
    availability,
    `\nPlease don't hesitate to reach out if you have any questions in the meantime.\n\nBest,\n[Your name]`,
  ].join("");
}

// ─── Scheduling Link Panel ────────────────────────────────────────────────────

function SchedulingLinkPanel({ url }: { url: string }) {
  const domain = (() => {
    try { return new URL(url).hostname.replace("www.", ""); }
    catch { return url; }
  })();

  return (
    <div className="flex flex-col h-full items-center justify-center text-center gap-5 px-4">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100">
        <Link2 className="h-7 w-7 text-emerald-600" />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">Client scheduling link</p>
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
          This stage has a direct booking link — the candidate can pick their own time without any back-and-forth.
        </p>
      </div>
      <div className="w-full rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 text-left">
        <p className="text-[10px] font-semibold text-emerald-700 mb-1 uppercase tracking-wide">{domain}</p>
        <p className="text-xs text-foreground break-all leading-relaxed">{url}</p>
      </div>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        Test link
      </a>
      <p className="text-[10px] text-muted-foreground">
        No availability grid needed — the link is already included in your outreach.
      </p>
    </div>
  );
}

// ─── Availability Grid ────────────────────────────────────────────────────────

function AvailabilityGrid({
  days,
  selected,
  onToggle,
  onClear,
}: {
  days: Date[];
  selected: Set<SlotKey>;
  onToggle: (key: SlotKey) => void;
  onClear: () => void;
}) {
  const [week, setWeek] = useState(0);
  const weekDays = days.slice(week * 5, week * 5 + 5);

  return (
    <div className="flex flex-col h-full">
      {/* Week tabs */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div className="flex rounded-lg border border-border overflow-hidden">
          {[0, 1].map((w) => (
            <button
              key={w}
              onClick={() => setWeek(w)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium transition-colors",
                w === 1 && "border-l border-border",
                week === w
                  ? "bg-brand-600 text-white"
                  : "text-muted-foreground hover:bg-accent"
              )}
            >
              Week {w + 1}
            </button>
          ))}
        </div>
        {selected.size > 0 && (
          <button
            onClick={onClear}
            className="text-[11px] text-muted-foreground hover:text-red-500 transition-colors"
          >
            Clear ({selected.size})
          </button>
        )}
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto min-h-0">
        <div
          className="grid gap-px"
          style={{ gridTemplateColumns: "3.75rem repeat(5, 1fr)" }}
        >
          {/* Corner */}
          <div />
          {/* Day headers */}
          {weekDays.map((d) => {
            const { short, date } = formatDayHeader(d);
            return (
              <div key={d.toISOString()} className="text-center pb-1.5">
                <p className="text-[10px] font-bold text-foreground">{short}</p>
                <p className="text-[10px] text-muted-foreground">{date}</p>
              </div>
            );
          })}

          {/* Time rows */}
          {TIME_SLOTS.map(({ label, value }) => (
            <>
              <div
                key={`lbl-${value}`}
                className="flex items-center h-7 pr-1"
              >
                <span className="text-[9px] text-muted-foreground whitespace-nowrap leading-none">{label}</span>
              </div>
              {weekDays.map((d) => {
                const key   = slotKey(d, value);
                const isSel = selected.has(key);
                return (
                  <button
                    key={key}
                    onClick={() => onToggle(key)}
                    className={cn(
                      "h-7 rounded transition-all border flex items-center justify-center",
                      isSel
                        ? "bg-brand-600 border-brand-600 text-white shadow-sm"
                        : "bg-card border-border hover:border-brand-300 hover:bg-brand-50"
                    )}
                  >
                    {isSel && <Check className="h-3 w-3" />}
                  </button>
                );
              })}
            </>
          ))}
        </div>
      </div>

      {/* Footer note */}
      <div className="shrink-0 mt-3 pt-3 border-t border-border">
        {selected.size === 0 ? (
          <p className="text-[10px] text-muted-foreground text-center">
            Click slots to mark available windows — they'll populate the email automatically.
          </p>
        ) : (
          <p className="text-[10px] text-muted-foreground text-center">
            <span className="font-semibold text-foreground">{selected.size}</span> slot{selected.size !== 1 ? "s" : ""} selected · included in outreach
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export interface CandidateOutreachModalProps {
  candidate: Candidate;
  /** Used to call /api/candidates/[id]/ai/outreach for AI draft generation */
  candidateId?: string;
  jobTitle: string;
  clientName: string;
  /** The interview stage name, e.g. "Phone Screen" or "Hiring Manager Interview" */
  stageName: string;
  /** If set, the availability grid is replaced with a link panel */
  schedulingUrl?: string;
  onClose: () => void;
  onSent?: () => void;
}

export function CandidateOutreachModal({
  candidate,
  candidateId,
  jobTitle,
  clientName,
  stageName,
  schedulingUrl,
  onClose,
  onSent,
}: CandidateOutreachModalProps) {
  const days = useMemo(() => getNextBusinessDays(10), []);
  const [selected, setSelected]         = useState<Set<SlotKey>>(new Set());
  const [bodyTouched, setBodyTouched]   = useState(false);
  const [customBody, setCustomBody]     = useState("");
  const [subject, setSubject]           = useState(`Interview Invitation – ${jobTitle} at ${clientName}`);
  const [copied, setCopied]             = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiTone, setAiTone]             = useState<"professional" | "casual" | "direct">("professional");

  const autoBody = useMemo(
    () => buildEmailTemplate(candidate.firstName, jobTitle, clientName, stageName, schedulingUrl, selected),
    [candidate.firstName, jobTitle, clientName, stageName, schedulingUrl, selected],
  );

  const body = bodyTouched ? customBody : autoBody;

  function toggleSlot(key: SlotKey) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
    if (bodyTouched) setBodyTouched(false); // re-sync body when slots change
  }

  function clearSlots() {
    setSelected(new Set());
    setBodyTouched(false);
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Could not access clipboard");
    }
  }

  function handleSend() {
    toast.success(`Outreach sent to ${candidate.firstName}`);
    onSent?.();
    onClose();
  }

  async function handleAiGenerate() {
    if (!candidateId) {
      toast.error("No candidate ID — cannot generate AI draft");
      return;
    }
    setAiGenerating(true);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/ai/outreach`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": "1" },
        body:    JSON.stringify({
          tone:        aiTone,
          roleContext: `${jobTitle} at ${clientName}`,
        }),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({}));
        if (res.status === 429) throw new Error("AI usage limit reached — try again later");
        throw new Error(error ?? "AI generation failed");
      }
      const { draft } = await res.json();
      setCustomBody(draft);
      setBodyTouched(true);
      toast.success("AI draft generated — edit as needed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI generation failed");
    } finally {
      setAiGenerating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 flex w-full max-w-4xl flex-col rounded-2xl border border-border bg-card shadow-2xl max-h-[90vh] overflow-hidden">

        {/* Header */}
        <div className="shrink-0 flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-100">
              <Mail className="h-4.5 w-4.5 text-brand-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">
                Outreach to {candidate.firstName} {candidate.lastName}
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {stageName} · {jobTitle} at {clientName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Two-column body */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* Left — email compose */}
          <div className="flex flex-col flex-1 min-w-0 p-5 gap-3 border-r border-border overflow-y-auto">

            {/* Subject */}
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                Subject
              </label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            {/* AI Generate bar */}
            {candidateId && (
              <div className="flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2">
                <Sparkles className="h-3.5 w-3.5 text-violet-500 shrink-0" />
                <span className="text-[11px] text-violet-700 font-medium flex-1">Generate personalised cold outreach with AI</span>
                <select
                  value={aiTone}
                  onChange={e => setAiTone(e.target.value as typeof aiTone)}
                  disabled={aiGenerating}
                  className="rounded border border-violet-200 bg-white px-1.5 py-0.5 text-[10px] text-violet-700 focus:outline-none"
                >
                  <option value="professional">Professional</option>
                  <option value="casual">Casual</option>
                  <option value="direct">Direct</option>
                </select>
                <button
                  onClick={handleAiGenerate}
                  disabled={aiGenerating}
                  className="flex items-center gap-1 rounded-md bg-violet-600 hover:bg-violet-700 disabled:opacity-60 px-2.5 py-1 text-[10px] font-semibold text-white transition-colors whitespace-nowrap"
                >
                  {aiGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  {aiGenerating ? "Generating…" : "Generate"}
                </button>
              </div>
            )}

            {/* Body */}
            <div className="flex flex-col flex-1 min-h-0">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Message
                </label>
                {bodyTouched && (
                  <button
                    onClick={() => setBodyTouched(false)}
                    className="text-[10px] text-brand-600 hover:underline"
                  >
                    Reset to template
                  </button>
                )}
              </div>
              <textarea
                value={body}
                onChange={(e) => { setCustomBody(e.target.value); setBodyTouched(true); }}
                className="flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground leading-relaxed outline-none focus:ring-2 focus:ring-brand-500 min-h-[300px]"
              />
            </div>

            {/* Scheduling link badge (when link is set) */}
            {schedulingUrl && (
              <div className="flex items-center gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                <Link2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold text-emerald-700">Scheduling link included in message</p>
                  <p className="truncate text-[10px] text-emerald-600 mt-0.5">{schedulingUrl}</p>
                </div>
                <a
                  href={schedulingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-emerald-600 hover:text-emerald-800 transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            )}

            {/* Action row */}
            <div className="flex items-center gap-2 pt-1 shrink-0">
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
              >
                {copied
                  ? <Check className="h-3.5 w-3.5 text-emerald-500" />
                  : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied!" : "Copy"}
              </button>
              <button
                onClick={handleSend}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
              >
                <Send className="h-3.5 w-3.5" />
                Send Outreach
              </button>
            </div>
          </div>

          {/* Right — link panel or availability picker */}
          <div className="w-[360px] shrink-0 flex flex-col p-5 overflow-y-auto">
            {schedulingUrl ? (
              <SchedulingLinkPanel url={schedulingUrl} />
            ) : (
              <>
                <div className="flex items-center gap-2 mb-4 shrink-0">
                  <Calendar className="h-4 w-4 text-brand-600" />
                  <div>
                    <p className="text-xs font-semibold text-foreground">Select available windows</p>
                    <p className="text-[10px] text-muted-foreground">Times populate the email automatically</p>
                  </div>
                </div>
                <div className="flex-1 min-h-0">
                  <AvailabilityGrid
                    days={days}
                    selected={selected}
                    onToggle={toggleSlot}
                    onClear={clearSlots}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
