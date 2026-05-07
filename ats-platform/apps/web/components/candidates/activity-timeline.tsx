"use client";

import { useState, useEffect, useRef } from "react";
import {
  Mail, Phone, Send, ArrowRight,
  StickyNote, CheckCircle2, Briefcase, UserCheck,
  Filter, Plus, Loader2, Check, ArrowDown, ArrowUp,
} from "lucide-react";
import { TimelineEmailCard, type TimelineEmailMessage } from "@/components/candidates/timeline-email-card";
import { cn, formatRelativeTime, formatDate, getInitials, generateAvatarColor } from "@/lib/utils";
import { useAutoSave } from "@/hooks/use-auto-save";
import { SaveIndicator } from "@/components/ui/save-indicator";
import type { Activity, ActivityType } from "@/types";

// ─── Config ───────────────────────────────────────────────────────────────────

const ACTIVITY_CONFIG: Record<ActivityType, {
  icon: React.ElementType;
  iconClass: string;
  dotClass: string;
  label: string;
}> = {
  note:           { icon: StickyNote,    iconClass: "text-amber-600",   dotClass: "bg-amber-400",   label: "Note" },
  call:           { icon: Phone,         iconClass: "text-green-600",   dotClass: "bg-green-500",   label: "Call" },
  email:          { icon: Mail,          iconClass: "text-brand-600",    dotClass: "bg-brand-500",    label: "Email" },
  submission:     { icon: Send,          iconClass: "text-brand-600",   dotClass: "bg-brand-500",   label: "Submitted" },
  stage_change:   { icon: ArrowRight,    iconClass: "text-slate-600",   dotClass: "bg-slate-400",   label: "Stage change" },
  placement:      { icon: UserCheck,     iconClass: "text-teal-600",    dotClass: "bg-teal-500",    label: "Placed" },
  client_feedback:{ icon: CheckCircle2,  iconClass: "text-emerald-600", dotClass: "bg-emerald-500", label: "Client feedback" },
  task_created:   { icon: Briefcase,     iconClass: "text-slate-500",   dotClass: "bg-slate-300",   label: "Task" },
  task_completed: { icon: CheckCircle2,  iconClass: "text-slate-500",   dotClass: "bg-slate-300",   label: "Task done" },
};

const ALL_FILTERS: ActivityType[] = ["note", "call", "email", "submission", "stage_change", "placement"];

// ─── Add Note form ────────────────────────────────────────────────────────────

interface AddNoteFormProps {
  onAdd: (text: string) => void;
  onCancel: () => void;
  /** Key suffix to namespace the draft (e.g. candidateId) */
  draftKey?: string;
}

const NOTE_DRAFT_KEY = (suffix: string) => `note-draft-${suffix}`;

function AddNoteForm({ onAdd, onCancel, draftKey = "global" }: AddNoteFormProps) {
  const [text, setText]     = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone]     = useState(false);
  const [restoredDraft, setRestoredDraft] = useState(false);

  const key = NOTE_DRAFT_KEY(draftKey);
  const { status, loadDraft, clearDraft } = useAutoSave<string>({ key, value: text });

  // Restore draft on mount
  useEffect(() => {
    const draft = loadDraft();
    if (draft && draft.trim()) {
      setText(draft);
      setRestoredDraft(true);
      setTimeout(() => setRestoredDraft(false), 3000);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSave() {
    if (!text.trim()) return;
    setSaving(true);
    // Simulate async save (replace with real API call)
    await new Promise((r) => setTimeout(r, 350));
    clearDraft();
    onAdd(text.trim());
    setSaving(false);
    setDone(true);
    setText("");
  }

  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-3 animate-fade-in-up">
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Add a note about this candidate…"
        rows={3}
        className="w-full resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-brand-500 transition-colors"
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        {/* Save status */}
        <SaveIndicator status={status} restoredDraft={restoredDraft} />

        <div className="flex gap-2">
          <button
            onClick={() => { clearDraft(); onCancel(); }}
            className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!text.trim() || saving}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-white transition-all",
              done ? "bg-emerald-600" :
              saving ? "bg-brand-500 cursor-wait" :
              text.trim() ? "bg-brand-600 hover:bg-brand-700" :
              "bg-brand-300 cursor-not-allowed opacity-50"
            )}
          >
            {saving ? (
              <><Loader2 className="h-3 w-3 animate-spin" />Saving…</>
            ) : done ? (
              <><Check className="h-3 w-3" />Saved!</>
            ) : (
              "Save Note"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Timeline component ───────────────────────────────────────────────────────

interface ActivityTimelineProps {
  activities: Activity[];
  onAddNote?: (text: string) => void;
  /** Namespace for the note draft (pass candidateId) */
  draftKey?: string;
  /** Email messages linked to this candidate — merged into timeline by timestamp */
  emailMessages?: TimelineEmailMessage[];
}

export function ActivityTimeline({ activities, onAddNote, draftKey, emailMessages = [] }: ActivityTimelineProps) {
  const [activeFilters, setActiveFilters] = useState<ActivityType[]>([]);
  const [showAddNote, setShowAddNote] = useState(false);

  // Build unified timeline items: activities + email messages
  type TimelineItem =
    | { kind: "activity"; item: Activity; sortTime: number }
    | { kind: "email"; item: TimelineEmailMessage; sortTime: number };

  const allItems: TimelineItem[] = [
    ...activities.map(
      (a): TimelineItem => ({
        kind: "activity",
        item: a,
        sortTime: new Date(a.createdAt).getTime(),
      })
    ),
    ...emailMessages.map(
      (e): TimelineItem => ({
        kind: "email",
        item: e,
        sortTime: e.timestamp,
      })
    ),
  ];

  // Build thread siblings map for email cards
  const threadSiblings = new Map<string, TimelineEmailMessage[]>();
  for (const em of emailMessages) {
    if (!threadSiblings.has(em.threadId)) threadSiblings.set(em.threadId, []);
    threadSiblings.get(em.threadId)!.push(em);
  }

  const filteredItems = activeFilters.length
    ? allItems.filter((ti) => {
        if (ti.kind === "activity") return activeFilters.includes(ti.item.type);
        if (ti.kind === "email") return activeFilters.includes("email");
        return true;
      })
    : allItems;

  // Sort by time descending
  filteredItems.sort((a, b) => b.sortTime - a.sortTime);

  // Keep the old filtered for backward compat in grouping
  const filtered = activeFilters.length
    ? activities.filter((a) => activeFilters.includes(a.type))
    : activities;

  function toggleFilter(type: ActivityType) {
    setActiveFilters((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  }

  function handleAddNote(text: string) {
    onAddNote?.(text);
    setShowAddNote(false);
  }

  // Group unified items by date
  const grouped = filteredItems.reduce<Record<string, TimelineItem[]>>((acc, ti) => {
    const ts = ti.kind === "activity"
      ? ti.item.createdAt
      : new Date(ti.item.timestamp).toISOString();
    const day = formatDate(ts, "MMM d, yyyy");
    if (!acc[day]) acc[day] = [];
    acc[day].push(ti);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {ALL_FILTERS.map((type) => {
            const cfg = ACTIVITY_CONFIG[type];
            const Icon = cfg.icon;
            const active = activeFilters.includes(type);
            return (
              <button
                key={type}
                onClick={() => toggleFilter(type)}
                className={cn(
                  "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors",
                  active
                    ? "border-brand-300 bg-brand-50 text-brand-700"
                    : "border-border bg-background text-muted-foreground hover:border-brand-200 hover:text-brand-600"
                )}
              >
                <Icon className="h-3 w-3" />
                {cfg.label}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => setShowAddNote((v) => !v)}
          className="flex shrink-0 items-center gap-1 rounded-md bg-brand-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
        >
          <Plus className="h-3 w-3" />
          Add Note
        </button>
      </div>

      {/* Note composer */}
      {showAddNote && (
        <AddNoteForm onAdd={handleAddNote} onCancel={() => setShowAddNote(false)} draftKey={draftKey} />
      )}

      {/* Timeline */}
      {Object.entries(grouped).map(([day, items]) => (
        <div key={day}>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {day}
          </p>
          <div className="relative space-y-0 pl-5">
            {/* Vertical line */}
            <div className="absolute left-1.5 top-2 bottom-2 w-px bg-border" />

            {items.map((ti) => {
              if (ti.kind === "email") {
                const msg = ti.item;
                const siblings = (threadSiblings.get(msg.threadId) ?? []).filter(
                  (s) => s.id !== msg.id
                );
                return (
                  <div key={`email-${msg.id}`} className="relative pb-4 last:pb-0">
                    <div className={cn(
                      "absolute -left-3.5 mt-0.5 h-3 w-3 rounded-full border-2 border-background",
                      "bg-brand-500"
                    )} />
                    <TimelineEmailCard message={msg} threadSiblings={siblings} />
                  </div>
                );
              }

              const act = ti.item;
              const cfg = ACTIVITY_CONFIG[act.type] ?? ACTIVITY_CONFIG.note;
              const Icon = cfg.icon;

              return (
                <div key={act.id} className="relative flex gap-3 pb-4 last:pb-0">
                  {/* Dot */}
                  <div className={cn("absolute -left-3.5 mt-0.5 h-3 w-3 rounded-full border-2 border-background", cfg.dotClass)} />

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Icon className={cn("h-3.5 w-3.5 shrink-0", cfg.iconClass)} />
                        <span className="text-xs font-semibold text-muted-foreground">
                          {cfg.label}
                        </span>
                        {act.actor && (
                          <span className="text-[10px] text-muted-foreground">
                            · {act.actor.firstName}
                          </span>
                        )}
                      </div>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {formatRelativeTime(act.createdAt)}
                      </span>
                    </div>

                    <p className={cn(
                      "mt-0.5 text-sm text-foreground",
                      act.type === "note" && "rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 italic text-amber-900 text-xs"
                    )}>
                      {act.summary}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {filteredItems.length === 0 && (
        <div className="py-8 text-center text-sm text-muted-foreground">
          No activity yet{activeFilters.length > 0 ? " matching these filters" : ""}.
        </div>
      )}
    </div>
  );
}
