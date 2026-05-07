"use client";

import { useState, useRef, useEffect } from "react";
import {
  X, Send, ChevronDown, Paperclip, Clock, Sparkles,
  Bold, Italic, List, Link2, Smile, RotateCcw, Check, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAutoSave } from "@/hooks/use-auto-save";
import { SaveIndicator } from "@/components/ui/save-indicator";

const EMAIL_DRAFT_KEY = "email-compose-draft";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EmailRecipient {
  name: string;
  email: string;
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  category: "outreach" | "followup" | "submission" | "interview" | "offer";
}

// ─── Templates ────────────────────────────────────────────────────────────────

const TEMPLATES: EmailTemplate[] = [
  {
    id: "initial-outreach",
    name: "Initial Outreach",
    category: "outreach",
    subject: "Exciting opportunity at {{client_name}} — {{job_title}}",
    body: `Hi {{first_name}},

I hope this finds you well! I'm reaching out because I think you'd be a fantastic fit for a {{job_title}} role I'm currently working on with {{client_name}}.

Based on your background at {{current_company}}, this could be a compelling next step. The role offers:

• Competitive compensation range
• Excellent growth trajectory
• Strong leadership team

Would you be open to a quick 15-minute call this week to explore whether there might be a mutual fit? I'd love to share more details.

Best,
{{recruiter_name}}`,
  },
  {
    id: "followup-1",
    name: "Follow-up #1",
    category: "followup",
    subject: "Following up — {{job_title}} opportunity",
    body: `Hi {{first_name}},

I wanted to follow up on my previous message about the {{job_title}} role at {{client_name}}.

I understand your inbox is busy, but I genuinely think this could be worth 10 minutes of your time. Would you be open to a brief chat?

Best,
{{recruiter_name}}`,
  },
  {
    id: "candidate-submission",
    name: "Candidate Submission",
    category: "submission",
    subject: "Candidate Submission: {{candidate_name}} for {{job_title}}",
    body: `Hi {{client_contact}},

Please find below my submission of {{candidate_name}} for the {{job_title}} role.

**Why {{first_name}} stands out:**
• [Add key differentiators]
• [Relevant experience]
• [Culture fit notes]

{{first_name}}'s compensation expectations are [range], and they are available to interview [timeframe].

Please let me know your thoughts — I'm happy to coordinate next steps at your convenience.

Best,
{{recruiter_name}}`,
  },
  {
    id: "interview-confirmation",
    name: "Interview Confirmation",
    category: "interview",
    subject: "Interview Confirmed: {{candidate_name}} — {{interview_date}}",
    body: `Hi {{first_name}},

Great news — your interview with {{client_name}} is confirmed for:

📅 {{interview_date}}
⏰ {{interview_time}}
📍 {{location_or_link}}

A few things to help you prepare:
• [Interviewer names and titles]
• [Format: panel / 1:1 / technical]
• [Key topics likely to come up]

Please confirm receipt of this message. Don't hesitate to reach out with any questions.

Good luck — I'm rooting for you!

Best,
{{recruiter_name}}`,
  },
  {
    id: "offer-congrats",
    name: "Offer Congratulations",
    category: "offer",
    subject: "Congratulations! Offer received — {{job_title}} at {{client_name}}",
    body: `Hi {{first_name}},

Fantastic news — {{client_name}} has extended you an offer for the {{job_title}} role! 🎉

Offer details:
• Base Salary: {{salary}}
• Start Date: {{start_date}}
• [Additional comp / benefits highlights]

I'll send the formal offer letter shortly. Please review carefully, and let's schedule a call to walk through everything together.

This is a great outcome — congratulations!

Best,
{{recruiter_name}}`,
  },
];

const CATEGORY_COLORS: Record<EmailTemplate["category"], string> = {
  outreach:    "bg-brand-100 text-brand-700",
  followup:    "bg-amber-100 text-amber-700",
  submission:  "bg-violet-100 text-violet-700",
  interview:   "bg-emerald-100 text-emerald-700",
  offer:       "bg-teal-100 text-teal-700",
};

// ─── Template picker popover ──────────────────────────────────────────────────

function TemplatePicker({ onSelect, onClose }: { onSelect: (t: EmailTemplate) => void; onClose: () => void }) {
  const [search, setSearch] = useState("");
  const filtered = TEMPLATES.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="absolute bottom-full left-0 z-20 mb-2 w-72 rounded-xl border border-border bg-card shadow-xl overflow-hidden">
      <div className="border-b border-border px-3 py-2.5">
        <input
          autoFocus
          value={search}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
          placeholder="Search templates…"
          className="w-full bg-transparent text-sm text-foreground outline-none placeholder-muted-foreground"
        />
      </div>
      <ul className="max-h-64 overflow-y-auto py-1">
        {filtered.length === 0 ? (
          <li className="px-3 py-3 text-xs text-muted-foreground text-center">No templates found</li>
        ) : (
          filtered.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => { onSelect(t); onClose(); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-accent transition-colors"
              >
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize", CATEGORY_COLORS[t.category])}>
                  {t.category}
                </span>
                <span className="flex-1 text-xs font-medium text-foreground">{t.name}</span>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

// ─── Send later picker ────────────────────────────────────────────────────────

function SendLaterPicker({ onSchedule, onClose }: { onSchedule: (dt: string) => void; onClose: () => void }) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");

  const QUICK_OPTIONS = [
    { label: "Tomorrow 9am",   offsetHours: 24, time: "09:00" },
    { label: "Tomorrow 2pm",   offsetHours: 24, time: "14:00" },
    { label: "Monday 9am",     offsetHours: 72, time: "09:00" },
  ];

  return (
    <div className="absolute bottom-full right-0 z-20 mb-2 w-60 rounded-xl border border-border bg-card shadow-xl overflow-hidden">
      <div className="border-b border-border px-4 py-2.5">
        <p className="text-xs font-semibold text-foreground">Schedule send</p>
      </div>
      <div className="p-3 space-y-1">
        {QUICK_OPTIONS.map((opt) => (
          <button
            key={opt.label}
            onClick={() => { onSchedule(opt.label); onClose(); }}
            className="w-full text-left rounded-lg px-3 py-2 text-xs text-foreground hover:bg-accent transition-colors"
          >
            {opt.label}
          </button>
        ))}
        <div className="border-t border-border my-2" />
        <div className="space-y-2">
          <input
            type="date"
            value={date}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDate(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-brand-500"
          />
          <input
            type="time"
            value={time}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTime(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-brand-500"
          />
          <button
            onClick={() => {
              if (!date) return;
              onSchedule(`${date} at ${time}`);
              onClose();
            }}
            disabled={!date}
            className="w-full rounded-lg bg-brand-600 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-40 transition-colors"
          >
            Schedule
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Toolbar button ───────────────────────────────────────────────────────────

function ToolbarBtn({
  icon: Icon,
  title,
  onClick,
}: {
  icon: React.ElementType;
  title: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

// ─── Tag chip ─────────────────────────────────────────────────────────────────

function TagChip({ name, onRemove }: { name: string; onRemove: () => void }) {
  return (
    <span className="flex items-center gap-1 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700">
      {name}
      <button onClick={onRemove} className="hover:text-brand-900">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export interface EmailComposeModalProps {
  to?: EmailRecipient[];
  defaultSubject?: string;
  onClose: () => void;
}

export function EmailComposeModal({ to: initialTo = [], defaultSubject = "", onClose }: EmailComposeModalProps) {
  const [toList, setToList]           = useState<EmailRecipient[]>(initialTo);
  const [toInput, setToInput]         = useState("");
  const [subject, setSubject]         = useState(defaultSubject);
  const [body, setBody]               = useState("");
  const [sending, setSending]         = useState(false);
  const [sent, setSent]               = useState(false);
  const [scheduledFor, setScheduled]  = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showScheduler, setShowScheduler] = useState(false);
  const [ccVisible, setCcVisible]     = useState(false);
  const [cc, setCc]                   = useState<EmailRecipient[]>([]);
  const [ccInput, setCcInput]         = useState("");

  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Auto-save draft
  const draft = { subject, body };
  const { status: saveStatus, loadDraft, clearDraft } = useAutoSave<typeof draft>({
    key: EMAIL_DRAFT_KEY,
    value: draft,
    debounceMs: 600,
  });

  // Restore draft on mount (only if no defaultSubject was provided)
  useEffect(() => {
    if (defaultSubject) return; // pre-seeded context → don't clobber
    const saved = loadDraft();
    if (saved?.subject) setSubject(saved.subject);
    if (saved?.body)    setBody(saved.body);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addRecipient(input: string, setter: (fn: (prev: EmailRecipient[]) => EmailRecipient[]) => void) {
    const trimmed = input.trim();
    if (!trimmed) return;
    // Allow "Name <email>" or plain email
    const match = trimmed.match(/^(.+?)\s*<([^>]+)>$/) ?? null;
    if (match) {
      setter((prev) => [...prev, { name: match[1].trim(), email: match[2].trim() }]);
    } else if (trimmed.includes("@")) {
      setter((prev) => [...prev, { name: trimmed.split("@")[0], email: trimmed }]);
    }
  }

  function applyTemplate(t: EmailTemplate) {
    setSubject(t.subject);
    setBody(t.body);
    // Focus body after slight delay
    setTimeout(() => bodyRef.current?.focus(), 50);
  }

  async function handleSend() {
    if (toList.length === 0 || !subject.trim() || !body.trim()) {
      toast.error("Please fill in recipient, subject, and message");
      return;
    }
    setSending(true);
    await new Promise((r) => setTimeout(r, 900));
    clearDraft();
    setSending(false);
    setSent(true);
    if (scheduledFor) {
      toast.success(`Email scheduled for ${scheduledFor}`);
    } else {
      toast.success(`Email sent to ${toList.map((r) => r.name).join(", ")}`);
    }
    setTimeout(onClose, 800);
  }

  const canSend = toList.length > 0 && subject.trim().length > 0 && body.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Compose window — Gmail-style bottom-right panel */}
      <div className="relative z-10 flex w-full max-w-lg flex-col rounded-2xl border border-border bg-card shadow-2xl"
           style={{ maxHeight: "85vh" }}>

        {/* Titlebar */}
        <div className="flex items-center justify-between rounded-t-2xl bg-foreground px-4 py-3">
          <h3 className="text-sm font-semibold text-background">New Message</h3>
          <div className="flex items-center gap-1.5">
            <button onClick={onClose} aria-label="Close" className="text-background/60 hover:text-background transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* To field */}
        <div className="flex items-start gap-2 border-b border-border px-4 py-2.5">
          <span className="mt-0.5 shrink-0 text-xs font-medium text-muted-foreground w-8">To</span>
          <div className="flex flex-1 flex-wrap gap-1.5">
            {toList.map((r, i) => (
              <TagChip key={i} name={r.name} onRemove={() => setToList((prev) => prev.filter((_, idx) => idx !== i))} />
            ))}
            <input
              value={toInput}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setToInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
                  e.preventDefault();
                  addRecipient(toInput, setToList);
                  setToInput("");
                }
              }}
              onBlur={() => { if (toInput) { addRecipient(toInput, setToList); setToInput(""); } }}
              placeholder={toList.length === 0 ? "Recipients…" : ""}
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder-muted-foreground"
            />
          </div>
          <button
            onClick={() => setCcVisible((v) => !v)}
            className="shrink-0 text-xs text-muted-foreground hover:text-foreground transition-colors mt-0.5"
          >
            Cc
          </button>
        </div>

        {/* Cc field */}
        {ccVisible && (
          <div className="flex items-start gap-2 border-b border-border px-4 py-2.5">
            <span className="mt-0.5 shrink-0 text-xs font-medium text-muted-foreground w-8">Cc</span>
            <div className="flex flex-1 flex-wrap gap-1.5">
              {cc.map((r, i) => (
                <TagChip key={i} name={r.name} onRemove={() => setCc((prev) => prev.filter((_, idx) => idx !== i))} />
              ))}
              <input
                value={ccInput}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCcInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
                    e.preventDefault();
                    addRecipient(ccInput, setCc);
                    setCcInput("");
                  }
                }}
                onBlur={() => { if (ccInput) { addRecipient(ccInput, setCc); setCcInput(""); } }}
                placeholder="Add CC…"
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder-muted-foreground"
              />
            </div>
          </div>
        )}

        {/* Subject */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <span className="shrink-0 text-xs font-medium text-muted-foreground w-8">Subj</span>
          <input
            value={subject}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSubject(e.target.value)}
            placeholder="Subject…"
            className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder-muted-foreground"
          />
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          <textarea
            ref={bodyRef}
            value={body}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setBody(e.target.value)}
            placeholder="Compose your message…

Tip: Use the template button below to start from a proven sequence."
            className="flex-1 resize-none bg-transparent px-4 py-3 text-sm text-foreground outline-none placeholder-muted-foreground min-h-[200px]"
          />
        </div>

        {/* Formatting toolbar */}
        <div className="flex items-center gap-0.5 border-t border-border px-4 py-2">
          <ToolbarBtn icon={Bold}      title="Bold" />
          <ToolbarBtn icon={Italic}    title="Italic" />
          <ToolbarBtn icon={List}      title="Bullet list" />
          <ToolbarBtn icon={Link2}     title="Insert link" />
          <ToolbarBtn icon={Smile}     title="Emoji" />
          <div className="mx-2 h-4 w-px bg-border" />
          <ToolbarBtn icon={Paperclip} title="Attach file" />
          <div className="flex-1" />
          {body.length > 0 && (
            <button
              onClick={() => setBody("")}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <RotateCcw className="h-3 w-3" />Clear
            </button>
          )}
          <SaveIndicator status={saveStatus} className="ml-2" />
          <span className="ml-3 text-[10px] text-muted-foreground">{body.length} chars</span>
        </div>

        {/* Action bar */}
        <div className="relative flex items-center gap-2 border-t border-border px-4 py-3">
          {/* Template picker */}
          {showTemplates && (
            <TemplatePicker onSelect={applyTemplate} onClose={() => setShowTemplates(false)} />
          )}
          {/* Schedule picker */}
          {showScheduler && (
            <SendLaterPicker
              onSchedule={(dt) => setScheduled(dt)}
              onClose={() => setShowScheduler(false)}
            />
          )}

          <button
            onClick={() => { setShowTemplates((v) => !v); setShowScheduler(false); }}
            className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <Sparkles className="h-3.5 w-3.5" />Templates
          </button>

          <div className="flex-1" />

          {scheduledFor && (
            <div className="flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-700">
              <Clock className="h-3.5 w-3.5" />
              {scheduledFor}
              <button onClick={() => setScheduled(null)} className="hover:text-amber-900">
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          {/* Schedule send */}
          <button
            onClick={() => { setShowScheduler((v) => !v); setShowTemplates(false); }}
            className="flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            title="Schedule send"
          >
            <Clock className="h-3.5 w-3.5" />
            <ChevronDown className="h-3 w-3" />
          </button>

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={!canSend || sending || sent}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-4 py-1.5 text-xs font-semibold transition-colors",
              sent
                ? "bg-emerald-600 text-white"
                : canSend
                ? "bg-brand-600 text-white hover:bg-brand-700"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          >
            {sent ? (
              <><Check className="h-3.5 w-3.5" />Sent!</>
            ) : sending ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" />Sending…</>
            ) : scheduledFor ? (
              <><Clock className="h-3.5 w-3.5" />Schedule</>
            ) : (
              <><Send className="h-3.5 w-3.5" />Send</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
