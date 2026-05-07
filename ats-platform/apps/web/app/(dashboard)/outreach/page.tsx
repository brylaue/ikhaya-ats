"use client";

import { useState, useEffect } from "react";
import {
  Mail, Play, Pause, Plus, ChevronRight, Clock,
  Users, BarChart2, CheckCircle2, Edit3, Copy, Trash2,
  ArrowRight, Inbox, Send, AlertCircle, Zap, PenSquare,
  Reply, ReplyAll, Forward, Star, StarOff, Archive,
  MoveRight, UserCheck, Calendar, ChevronDown, Search,
  Filter, RefreshCw, MoreHorizontal, Paperclip, Tag,
  Link2, Loader2,
} from "lucide-react";
import Link from "next/link";
import { cn, formatRelativeTime } from "@/lib/utils";
import { toast } from "sonner";
import { EmailComposeModal } from "@/components/outreach/email-compose-modal";
import type { EmailRecipient } from "@/components/outreach/email-compose-modal";
import { useProviderConnections, useEmailThreads, useCandidates, useOutreachSequences, useJobs } from "@/lib/supabase/hooks";

// ─── Types ────────────────────────────────────────────────────────────────────

type SequenceStatus = "active" | "paused" | "draft";

interface SequenceStep {
  id: string;
  type: "email" | "wait";
  delayDays: number;
  subject?: string;
  body?: string;
}

interface EmailSequence {
  id: string;
  name: string;
  status: SequenceStatus;
  steps: SequenceStep[];
  enrolled: number;
  sent: number;
  opened: number;
  replied: number;
  createdAt: string;
  tag?: string;
}

interface ThreadMessage {
  id: string;
  from: string;
  fromEmail: string;
  direction: "inbound" | "outbound";
  subject: string;
  body: string;
  time: string;
  timestamp: number;
  hasAttachment?: boolean;
}

interface InboxThread {
  id: string;
  candidate: string;
  candidateEmail: string;
  candidateTitle?: string;
  subject: string;
  preview: string;
  time: string;
  timestamp: number;
  read: boolean;
  starred: boolean;
  archived: boolean;
  stage?: string;
  tags: string[];
  messages: ThreadMessage[];
  suggestedAction?: "schedule_interview" | "advance_stage" | "add_to_pipeline";
}

// ─── Step Pill ────────────────────────────────────────────────────────────────

function StepBadge({ step, index }: { step: SequenceStep; index: number }) {
  if (step.type === "wait") {
    return (
      <div className="flex items-center gap-1.5 rounded-full border border-dashed border-border bg-muted/50 px-2.5 py-1 text-[10px] text-muted-foreground">
        <Clock className="h-3 w-3" />
        {step.delayDays}d wait
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-[10px] font-medium text-brand-700">
      <Mail className="h-3 w-3" />
      Email {Math.floor(index / 2) + 1}
    </div>
  );
}

// ─── Sequence Row ─────────────────────────────────────────────────────────────

interface SequenceRowProps {
  seq: EmailSequence;
  isSelected: boolean;
  onSelect: () => void;
  onToggle: () => void;
}

function SequenceRow({ seq, isSelected, onSelect, onToggle }: SequenceRowProps) {
  const openRate   = seq.sent > 0 ? Math.round((seq.opened / seq.sent) * 100) : 0;
  const replyRate  = seq.sent > 0 ? Math.round((seq.replied / seq.sent) * 100) : 0;
  const emailCount = seq.steps.filter((s) => s.type === "email").length;

  return (
    <div
      onClick={onSelect}
      className={cn(
        "flex items-center gap-4 px-4 py-3.5 border-b border-border cursor-pointer transition-colors",
        isSelected ? "bg-brand-50 border-l-2 border-l-brand-500" : "hover:bg-accent/50"
      )}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors",
          seq.status === "active" ? "bg-emerald-100 text-emerald-600 hover:bg-emerald-200" :
          seq.status === "paused" ? "bg-amber-100 text-amber-600 hover:bg-amber-200" :
                                    "bg-muted text-muted-foreground hover:bg-muted/80"
        )}
      >
        {seq.status === "active" ? <Pause className="h-3.5 w-3.5" /> :
         seq.status === "paused" ? <Play  className="h-3.5 w-3.5" /> :
                                   <Edit3 className="h-3 w-3" />}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="truncate text-sm font-medium text-foreground">{seq.name}</p>
          {seq.tag && (
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">
              {seq.tag}
            </span>
          )}
          <span className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
            seq.status === "active" ? "bg-emerald-100 text-emerald-700" :
            seq.status === "paused" ? "bg-amber-100 text-amber-700" :
                                      "bg-slate-100 text-slate-600"
          )}>
            {seq.status}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{emailCount} emails</span>
          <span className="flex items-center gap-1"><Users className="h-3 w-3" />{seq.enrolled} enrolled</span>
        </div>
      </div>

      <div className="hidden sm:flex items-center gap-6 text-xs shrink-0">
        <div className="text-center">
          <p className="font-semibold text-foreground">{seq.sent}</p>
          <p className="text-[10px] text-muted-foreground">sent</p>
        </div>
        <div className="text-center">
          <p className={cn("font-semibold", openRate >= 40 ? "text-emerald-600" : openRate >= 20 ? "text-amber-600" : "text-foreground")}>
            {seq.sent > 0 ? `${openRate}%` : "—"}
          </p>
          <p className="text-[10px] text-muted-foreground">opened</p>
        </div>
        <div className="text-center">
          <p className={cn("font-semibold", replyRate >= 15 ? "text-emerald-600" : replyRate >= 5 ? "text-amber-600" : "text-foreground")}>
            {seq.sent > 0 ? `${replyRate}%` : "—"}
          </p>
          <p className="text-[10px] text-muted-foreground">replied</p>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <Link
          href={`/outreach/sequences/${seq.id}`}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
          className="hidden group-hover:flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          View
        </Link>
        <ChevronRight className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", isSelected && "rotate-90")} />
      </div>
    </div>
  );
}

// ─── Sequence Detail ──────────────────────────────────────────────────────────

function SequenceDetail({ seq, onClose, onEnroll, onClone, onDelete, onEdit }: {
  seq: EmailSequence; onClose: () => void;
  onEnroll: () => void; onClone: () => void; onDelete: () => void; onEdit: () => void;
}) {
  const [activeStep, setActiveStep] = useState<string | null>(null);
  const emailSteps = seq.steps.filter((s) => s.type === "email");
  const openRate  = seq.sent > 0 ? Math.round((seq.opened / seq.sent) * 100) : 0;
  const replyRate = seq.sent > 0 ? Math.round((seq.replied / seq.sent) * 100) : 0;

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 border-b border-border px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground leading-snug">{seq.name}</h2>
            <div className="mt-1 flex items-center gap-3">
              <span className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                seq.status === "active" ? "bg-emerald-100 text-emerald-700" :
                seq.status === "paused" ? "bg-amber-100 text-amber-700" :
                                          "bg-slate-100 text-slate-600"
              )}>
                {seq.status}
              </span>
              <span className="text-[10px] text-muted-foreground">{emailSteps.length} emails · {seq.enrolled} enrolled</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={onEdit}
              className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
            >
              <Edit3 className="h-3 w-3" />Edit
            </button>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {[
            { label: "Sent",     value: seq.sent },
            { label: "Opened",   value: seq.sent > 0 ? `${openRate}%`  : "—" },
            { label: "Replied",  value: seq.sent > 0 ? `${replyRate}%` : "—" },
            { label: "Enrolled", value: seq.enrolled },
          ].map((stat) => (
            <div key={stat.label} className="rounded-lg border border-border bg-background p-2 text-center">
              <p className="text-sm font-bold text-foreground">{stat.value}</p>
              <p className="text-[10px] text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Sequence steps</p>
        {seq.steps.map((step, i) => {
          if (step.type === "wait") {
            return (
              <div key={step.id} className="flex items-center gap-2 py-1 pl-3">
                <div className="w-px h-5 bg-border ml-2.5" />
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Wait {step.delayDays} {step.delayDays === 1 ? "day" : "days"}</span>
              </div>
            );
          }
          const emailNum = seq.steps.slice(0, i).filter((s) => s.type === "email").length + 1;
          const isOpen = activeStep === step.id;
          return (
            <div key={step.id} className={cn("rounded-lg border border-border bg-card overflow-hidden", isOpen && "ring-1 ring-brand-300")}>
              <button
                onClick={() => setActiveStep(isOpen ? null : step.id)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-accent/50"
              >
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-700">{emailNum}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">{step.subject}</p>
                </div>
                <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", isOpen && "rotate-90")} />
              </button>
              {isOpen && (
                <div className="border-t border-border px-3 pb-3 pt-2">
                  <p className="mb-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Body</p>
                  <pre className="whitespace-pre-wrap text-xs text-foreground font-sans leading-relaxed bg-muted/40 rounded-md p-3">{step.body}</pre>
                </div>
              )}
            </div>
          );
        })}
        <button
          onClick={onEdit}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2.5 text-xs text-muted-foreground hover:border-brand-300 hover:text-brand-600 hover:bg-brand-50 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />Add step
        </button>
      </div>

      <div className="shrink-0 border-t border-border p-4 flex gap-2">
        <button onClick={onEnroll} className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-brand-600 py-2 text-xs font-semibold text-white hover:bg-brand-700 transition-colors">
          <Users className="h-3.5 w-3.5" />Enroll Candidates
        </button>
        <button onClick={onClone} className="flex items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors">
          <Copy className="h-3.5 w-3.5" />Clone
        </button>
        <button onClick={onDelete} className="flex items-center justify-center gap-1.5 rounded-md border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Mock seed sequences ──────────────────────────────────────────────────────

const SEED_SEQUENCES: EmailSequence[] = [
  {
    id: "seq1",
    name: "Senior Engineering Outreach",
    status: "active",
    tag: "Engineering",
    enrolled: 34,
    sent: 89,
    opened: 52,
    replied: 14,
    createdAt: "2026-03-01",
    steps: [
      { id: "s1a", type: "email",  delayDays: 0,  subject: "Quick note from Ikhaya — {{job_title}} opportunity", body: "Hi {{first_name}},\n\nI came across your background at {{current_company}} and wanted to reach out about an exciting {{job_title}} opportunity with one of our clients.\n\nThey're looking for someone with exactly your experience — would you be open to a brief 15-minute call this week?\n\nBest,\n{{recruiter_name}}" },
      { id: "s1b", type: "wait",   delayDays: 3 },
      { id: "s1c", type: "email",  delayDays: 3,  subject: "Re: {{job_title}} — still interested?", body: "Hi {{first_name}},\n\nJust following up on my earlier note. The role is still open and I think you'd be a great fit.\n\nHappy to share the full JD if you'd like more details.\n\nBest,\n{{recruiter_name}}" },
      { id: "s1d", type: "wait",   delayDays: 5 },
      { id: "s1e", type: "email",  delayDays: 5,  subject: "Last note — {{job_title}} at a top-tier team", body: "Hi {{first_name}},\n\nI'll keep this short — this will be my last note. The opportunity is competitive comp, strong team, and real ownership.\n\nIf the timing is ever right in the future, I'd love to connect.\n\nBest,\n{{recruiter_name}}" },
    ],
  },
  {
    id: "seq2",
    name: "Executive / VP Search",
    status: "active",
    tag: "Executive",
    enrolled: 12,
    sent: 24,
    opened: 19,
    replied: 7,
    createdAt: "2026-03-15",
    steps: [
      { id: "s2a", type: "email",  delayDays: 0, subject: "Confidential search — {{job_title}}", body: "Hi {{first_name}},\n\nI'm conducting a confidential search for a {{job_title}} role with a high-growth company. Given your leadership track record at {{current_company}}, I thought you might be the right fit or could point me in the right direction.\n\nWould you have 20 minutes for a brief call?\n\nWarmly,\n{{recruiter_name}}" },
      { id: "s2b", type: "wait",   delayDays: 5 },
      { id: "s2c", type: "email",  delayDays: 5, subject: "Following up — confidential {{job_title}} opportunity", body: "Hi {{first_name}},\n\nFollowing up on my earlier note. This is a well-funded company with a compelling board and a clear path to exit.\n\nIf you're open to a confidential conversation, I'd love to share more.\n\nWarmly,\n{{recruiter_name}}" },
    ],
  },
  {
    id: "seq3",
    name: "Passive Candidate Re-engagement",
    status: "paused",
    tag: "Re-engage",
    enrolled: 61,
    sent: 183,
    opened: 74,
    replied: 9,
    createdAt: "2026-02-10",
    steps: [
      { id: "s3a", type: "email",  delayDays: 0, subject: "Checking in — are you open to new roles?", body: "Hi {{first_name}},\n\nWe spoke a while back and I wanted to check in. The market has shifted and there are some strong opportunities that might align with what you're looking for.\n\nAre you open to a quick catch-up?\n\nBest,\n{{recruiter_name}}" },
      { id: "s3b", type: "wait",   delayDays: 7 },
      { id: "s3c", type: "email",  delayDays: 7, subject: "One more thing — {{job_title}} came up", body: "Hi {{first_name}},\n\nA specific role came across my desk that reminded me of our previous conversation. It's a {{job_title}} at a well-regarded company.\n\nWorth 10 minutes to talk through?\n\nBest,\n{{recruiter_name}}" },
    ],
  },
];

// ─── Demo inbox threads (shown when email not yet connected) ─────────────────

const DEMO_THREADS: InboxThread[] = [
  {
    id: "dt1", candidate: "Michael Chen", candidateTitle: "VP of Engineering",
    candidateEmail: "m.chen@example.com", subject: "Re: VP Engineering opportunity at NovaTech",
    preview: "Thanks for reaching out — I'm definitely open to hearing more. When works for a call?",
    time: "10:42 AM", timestamp: Date.now() - 1800000, read: false, starred: true,
    archived: false, stage: "screening", tags: [],
    suggestedAction: "schedule_interview",
    messages: [
      { id: "m1a", from: "Alex Rivera", fromEmail: "alex@ikhaya.io", direction: "outbound",
        subject: "VP Engineering opportunity at NovaTech", time: "Yesterday 9:15 AM", timestamp: Date.now() - 86400000,
        body: "Hi Michael,\n\nI came across your background at DataStream and wanted to reach out about an exciting VP of Engineering role with one of our clients, NovaTech Solutions.\n\nThey're building a next-gen fintech platform and looking for someone with exactly your background in distributed systems and team leadership.\n\nWould you be open to a brief 20-minute call this week?\n\nBest,\nAlex Rivera\nIkhaya Talent" },
      { id: "m1b", from: "Michael Chen", fromEmail: "m.chen@example.com", direction: "inbound",
        subject: "Re: VP Engineering opportunity at NovaTech", time: "10:42 AM", timestamp: Date.now() - 1800000,
        body: "Hi Alex,\n\nThanks for reaching out — I'm definitely open to hearing more. The fintech space is interesting and NovaTech has been on my radar.\n\nWhen works for a call? I'm free Thursday afternoon or Friday morning.\n\nMichael" },
    ],
  },
  {
    id: "dt2", candidate: "Priya Nair", candidateTitle: "AI/ML Engineering Lead",
    candidateEmail: "p.nair@example.com", subject: "Head of AI — would love more details",
    preview: "Could you share the JD and comp range? I'm selectively exploring right now.",
    time: "9:14 AM", timestamp: Date.now() - 5400000, read: false, starred: false,
    archived: false, stage: "submitted", tags: ["Hot"],
    messages: [
      { id: "m2a", from: "Jordan Kim", fromEmail: "jordan@ikhaya.io", direction: "outbound",
        subject: "Head of AI opportunity — top-tier team", time: "Yesterday 2:00 PM", timestamp: Date.now() - 82800000,
        body: "Hi Priya,\n\nYour work on the ML platform at Waymo caught my attention. I'm working with a client looking for a Head of AI to build their ML function from the ground up.\n\nSerious comp, strong board, real ownership. Would you be open to learning more?\n\nJordan Kim\nIkhaya Talent" },
      { id: "m2b", from: "Priya Nair", fromEmail: "p.nair@example.com", direction: "inbound",
        subject: "Re: Head of AI opportunity — top-tier team", time: "9:14 AM", timestamp: Date.now() - 5400000,
        body: "Hi Jordan,\n\nInteresting timing — could you share the JD and comp range? I'm selectively exploring right now but this sounds like it could be worth a conversation.\n\nPriya" },
    ],
  },
  {
    id: "dt3", candidate: "Sarah Kim", candidateTitle: "Chief Product Officer",
    candidateEmail: "s.kim@example.com", subject: "CPO role — not the right fit right now",
    preview: "I appreciate you thinking of me, but I'm committed to my current role through year end.",
    time: "Yesterday", timestamp: Date.now() - 172800000, read: true, starred: false,
    archived: false, stage: "client_review", tags: ["Declined"],
    messages: [
      { id: "m3a", from: "Alex Rivera", fromEmail: "alex@ikhaya.io", direction: "outbound",
        subject: "Confidential search — CPO at a Series B company", time: "2 days ago", timestamp: Date.now() - 259200000,
        body: "Hi Sarah,\n\nI'm conducting a confidential search for a CPO role at a well-funded Series B company. Given your background building product orgs at scale, I thought you might be interested or could refer someone.\n\nHappy to share details on a brief call.\n\nAlex" },
      { id: "m3b", from: "Sarah Kim", fromEmail: "s.kim@example.com", direction: "inbound",
        subject: "Re: Confidential search — CPO at a Series B company", time: "Yesterday", timestamp: Date.now() - 172800000,
        body: "Hi Alex,\n\nI appreciate you thinking of me. I'm committed to my current role through year end — the timing isn't right.\n\nThat said, I'd be happy to refer a couple of people who might be a great fit. Can you send me the JD?\n\nSarah" },
    ],
  },
  {
    id: "dt4", candidate: "David Park", candidateTitle: "Staff Software Engineer",
    candidateEmail: "d.park@example.com", subject: "Re: Eng Director role — interested in Q3",
    preview: "Not actively looking but Q3 timing could work. Let's stay in touch.",
    time: "Mon", timestamp: Date.now() - 345600000, read: true, starred: false,
    archived: false, tags: [], stage: "sourced",
    messages: [
      { id: "m4a", from: "Jordan Kim", fromEmail: "jordan@ikhaya.io", direction: "outbound",
        subject: "Engineering Director opportunity", time: "Last week", timestamp: Date.now() - 604800000,
        body: "Hi David,\n\nI came across your profile and your work on Stripe's distributed systems team is impressive. I'm working with a company looking for an Engineering Director to lead their platform engineering group.\n\nWould you be open to a quick conversation?\n\nJordan" },
      { id: "m4b", from: "David Park", fromEmail: "d.park@example.com", direction: "inbound",
        subject: "Re: Engineering Director opportunity", time: "Mon", timestamp: Date.now() - 345600000,
        body: "Hi Jordan,\n\nNot actively looking right now but Q3 timing could potentially work depending on what's out there. Let's stay in touch and reconnect in a couple months.\n\nDavid" },
    ],
  },
  {
    id: "dt5", candidate: "Emma Rodriguez", candidateTitle: "Design Director",
    candidateEmail: "e.rodriguez@example.com", subject: "Head of Design — very interested!",
    preview: "This is exactly what I've been looking for. Can we jump on a call tomorrow?",
    time: "Mon", timestamp: Date.now() - 432000000, read: true, starred: true,
    archived: false, stage: "interview", tags: ["Hot"],
    suggestedAction: "advance_stage",
    messages: [
      { id: "m5a", from: "Jordan Kim", fromEmail: "jordan@ikhaya.io", direction: "outbound",
        subject: "Head of Design — building a world-class design org", time: "Last week", timestamp: Date.now() - 691200000,
        body: "Hi Emma,\n\nYour work at Figma on design systems is remarkable. I'm working with a client who is building a consumer product from the ground up and needs a Head of Design to define the entire design culture.\n\nWould this be worth a conversation?\n\nJordan" },
      { id: "m5b", from: "Emma Rodriguez", fromEmail: "e.rodriguez@example.com", direction: "inbound",
        subject: "Re: Head of Design — building a world-class design org", time: "Mon", timestamp: Date.now() - 432000000,
        body: "Hi Jordan!\n\nThis is exactly what I've been looking for — the chance to build something from scratch. I'd love to hear more.\n\nCan we jump on a call tomorrow? I'm free 2-5pm PST.\n\nEmma" },
    ],
  },
];

// ─── Sequence Builder Modal ───────────────────────────────────────────────────

type BuilderStep = {
  id: string;
  type: "email" | "wait";
  delayDays: number;
  subject: string;
  body: string;
};

interface SequenceBuilderModalProps {
  onClose: () => void;
  onSave: (seq: EmailSequence) => void | Promise<void>;
  initialSeq?: EmailSequence;
  onUpdate?: (seq: EmailSequence) => void | Promise<void>;
}

const TEMPLATE_SUBJECTS = [
  "Quick note from Ikhaya — {{job_title}} opportunity",
  "Re: {{job_title}} — still interested?",
  "Confidential search — {{job_title}}",
  "Following up on our last conversation",
  "Last note — {{job_title}} at a top-tier team",
];

const DELAY_OPTIONS = [1, 2, 3, 5, 7, 10, 14];

const VARIABLE_CHIPS = ["{{first_name}}", "{{job_title}}", "{{current_company}}", "{{recruiter_name}}"];

const TAG_OPTIONS = ["Engineering", "Executive", "Product", "Design", "Sales", "Re-engage", "Finance"];

function SequenceBuilderModal({ onClose, onSave, initialSeq, onUpdate }: SequenceBuilderModalProps) {
  const isEditing = !!initialSeq;
  const [name, setName]           = useState(initialSeq?.name ?? "");
  const [tag, setTag]             = useState(initialSeq?.tag ?? "");
  const [customTag, setCustomTag] = useState("");
  const [activateNow, setActivateNow] = useState(initialSeq?.status === "active");
  const defaultSteps: BuilderStep[] = initialSeq?.steps.map((s) => ({
    id: s.id,
    type: s.type,
    delayDays: s.delayDays,
    subject: s.subject ?? "",
    body: s.body ?? "",
  })) ?? [
    { id: "new1", type: "email", delayDays: 0, subject: TEMPLATE_SUBJECTS[0], body: "Hi {{first_name}},\n\nI came across your background and wanted to reach out about a {{job_title}} opportunity that I think could be a great fit.\n\nWould you be open to a quick 15-minute call?\n\nBest,\n{{recruiter_name}}" },
    { id: "new2", type: "wait",  delayDays: 3, subject: "", body: "" },
    { id: "new3", type: "email", delayDays: 3, subject: TEMPLATE_SUBJECTS[1], body: "Hi {{first_name}},\n\nJust following up on my earlier note. Happy to share more details if you're interested.\n\nBest,\n{{recruiter_name}}" },
  ];
  const [steps, setSteps]         = useState<BuilderStep[]>(defaultSteps);
  const firstEmailId = defaultSteps.find((s) => s.type === "email")?.id ?? "new1";
  const [activeStepId, setActiveStepId] = useState<string>(firstEmailId);
  const [saving, setSaving] = useState(false);

  const emailSteps = steps.filter((s) => s.type === "email");
  const activeStep = steps.find((s) => s.id === activeStepId && s.type === "email") ?? null;

  function updateStep(id: string, patch: Partial<BuilderStep>) {
    setSteps((prev) => prev.map((s) => s.id === id ? { ...s, ...patch } : s));
  }

  function updateWaitAfter(emailId: string, days: number) {
    const idx = steps.findIndex((s) => s.id === emailId);
    const nextStep = steps[idx + 1];
    if (nextStep?.type === "wait") {
      updateStep(nextStep.id, { delayDays: days });
    }
  }

  function addStep() {
    const waitId  = `w${Date.now()}`;
    const emailId = `e${Date.now() + 1}`;
    const emailNum = emailSteps.length + 1;
    setSteps((prev) => [
      ...prev,
      { id: waitId,  type: "wait",  delayDays: 5, subject: "", body: "" },
      { id: emailId, type: "email", delayDays: 5,
        subject: TEMPLATE_SUBJECTS[Math.min(emailNum, TEMPLATE_SUBJECTS.length - 1)] ?? `Follow-up ${emailNum}`,
        body: "Hi {{first_name}},\n\n[Your message here]\n\nBest,\n{{recruiter_name}}" },
    ]);
    setActiveStepId(emailId);
  }

  function removeEmail(emailId: string) {
    if (emailSteps.length <= 1) { toast.error("Sequence needs at least one email"); return; }
    const idx = steps.findIndex((s) => s.id === emailId);
    // Remove email and the wait before it (if any)
    const toRemove = new Set([emailId]);
    if (idx > 0 && steps[idx - 1]?.type === "wait") toRemove.add(steps[idx - 1].id);
    setSteps((prev) => prev.filter((s) => !toRemove.has(s.id)));
    const remaining = steps.filter((s) => s.type === "email" && !toRemove.has(s.id));
    if (remaining.length > 0) setActiveStepId(remaining[0].id);
  }

  function insertVariable(varName: string) {
    if (!activeStep) return;
    updateStep(activeStep.id, { body: activeStep.body + varName });
  }

  async function handleSave(activate: boolean) {
    if (!name.trim()) { toast.error("Give your sequence a name"); return; }
    if (emailSteps.length === 0) { toast.error("Add at least one email step"); return; }
    setSaving(true);
    try {
      const seqSteps = steps.map((s) => ({
        id:        s.id,
        type:      s.type,
        delayDays: s.delayDays,
        subject:   s.subject || undefined,
        body:      s.body || undefined,
      }));
      if (isEditing && initialSeq && onUpdate) {
        const updated: EmailSequence = {
          ...initialSeq,
          name:   name.trim(),
          tag:    customTag || tag || undefined,
          status: activate ? "active" : (initialSeq.status === "active" ? "active" : "draft"),
          steps:  seqSteps,
        };
        await onUpdate(updated);
        toast.success("Sequence updated");
      } else {
        const seq: EmailSequence = {
          id:        `seq${Date.now()}`,
          name:      name.trim(),
          tag:       customTag || tag || undefined,
          status:    activate ? "active" : "draft",
          steps:     seqSteps,
          enrolled:  0,
          sent:      0,
          opened:    0,
          replied:   0,
          createdAt: new Date().toISOString().slice(0, 10),
        };
        await onSave(seq);
        toast.success(activate ? "Sequence activated!" : "Sequence saved as draft");
      }
      onClose();
    } catch {
      toast.error("Failed to save sequence");
    } finally {
      setSaving(false);
    }
  }

  // compute cumulative day for each email step
  const cumulativeDays = emailSteps.map((_, i) => {
    let days = 0;
    let emailsSeen = 0;
    for (const s of steps) {
      if (s.type === "wait") { days += s.delayDays; }
      if (s.type === "email") {
        if (emailsSeen === i) break;
        emailsSeen++;
      }
    }
    return days;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex w-full max-w-4xl h-[80vh] rounded-2xl bg-card border border-border shadow-2xl overflow-hidden">

        {/* Left: step list */}
        <div className="w-56 shrink-0 border-r border-border bg-muted/30 flex flex-col">
          <div className="shrink-0 px-4 py-4 border-b border-border">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Steps</p>
          </div>
          <div className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
            {steps.map((step, idx) => {
              if (step.type === "wait") {
                const prevEmailIdx = steps.slice(0, idx).filter((s) => s.type === "email").length - 1;
                const prevEmail = emailSteps[prevEmailIdx];
                return (
                  <div key={step.id} className="flex items-center gap-1.5 px-2 py-1">
                    <div className="w-px h-4 bg-border ml-3" />
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <select
                      value={step.delayDays}
                      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                        updateStep(step.id, { delayDays: parseInt(e.target.value) });
                        if (prevEmail) updateStep(prevEmail.id, { delayDays: parseInt(e.target.value) });
                      }}
                      className="ml-auto text-[10px] text-muted-foreground bg-transparent border-none cursor-pointer outline-none"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {DELAY_OPTIONS.map((d) => (
                        <option key={d} value={d}>{d}d wait</option>
                      ))}
                    </select>
                  </div>
                );
              }
              const emailNum = steps.slice(0, idx).filter((s) => s.type === "email").length + 1;
              const isActive = activeStepId === step.id;
              const cumDay = cumulativeDays[emailNum - 1] ?? 0;
              return (
                <button
                  key={step.id}
                  onClick={() => setActiveStepId(step.id)}
                  className={cn(
                    "group flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition-colors",
                    isActive ? "bg-brand-50 ring-1 ring-brand-200" : "hover:bg-accent/50"
                  )}
                >
                  <div className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold mt-0.5",
                    isActive ? "bg-brand-600 text-white" : "bg-brand-100 text-brand-700"
                  )}>{emailNum}</div>
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate text-xs font-medium leading-snug", isActive ? "text-brand-700" : "text-foreground")}>
                      {step.subject ? step.subject.replace(/\{\{[^}]+\}\}/g, "…").slice(0, 28) : `Email ${emailNum}`}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Day {cumDay}</p>
                  </div>
                  {emailSteps.length > 1 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); removeEmail(step.id); }}
                      className="hidden group-hover:flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:text-red-500"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </button>
              );
            })}
          </div>
          <div className="shrink-0 p-3 border-t border-border">
            <button
              onClick={addStep}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-xs text-muted-foreground hover:border-brand-300 hover:text-brand-600 hover:bg-brand-50 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />Add email
            </button>
          </div>
        </div>

        {/* Right: editor */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Modal header */}
          <div className="shrink-0 flex items-center justify-between gap-4 border-b border-border px-6 py-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <input
                value={name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                placeholder="Sequence name…"
                className="flex-1 min-w-0 bg-transparent text-base font-semibold text-foreground placeholder-muted-foreground outline-none"
              />
              <select
                value={tag}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { setTag(e.target.value); setCustomTag(""); }}
                className="shrink-0 rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="">Tag…</option>
                {TAG_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                <option value="__custom">Custom…</option>
              </select>
              {tag === "__custom" && (
                <input
                  value={customTag}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomTag(e.target.value)}
                  placeholder="Tag name"
                  className="w-24 rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-brand-500"
                />
              )}
            </div>
            <button onClick={onClose} className="shrink-0 text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
          </div>

          {/* Step editor */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeStep ? (
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-foreground">Subject line</label>
                  <input
                    value={activeStep.subject}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateStep(activeStep.id, { subject: e.target.value })}
                    placeholder="Subject…"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="text-xs font-semibold text-foreground">Body</label>
                    <div className="flex gap-1">
                      {VARIABLE_CHIPS.map((v) => (
                        <button
                          key={v}
                          onClick={() => insertVariable(v)}
                          className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    value={activeStep.body}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateStep(activeStep.id, { body: e.target.value })}
                    rows={14}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-brand-500 resize-none leading-relaxed"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Use <span className="font-mono">{"{{first_name}}"}</span>, <span className="font-mono">{"{{job_title}}"}</span>, <span className="font-mono">{"{{current_company}}"}</span>, <span className="font-mono">{"{{recruiter_name}}"}</span> as merge fields.
                </p>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm text-muted-foreground">Select a step to edit</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="shrink-0 flex items-center justify-between gap-3 border-t border-border px-6 py-4">
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <div
                  onClick={() => setActivateNow(!activateNow)}
                  className={cn(
                    "relative h-4 w-7 rounded-full transition-colors cursor-pointer",
                    activateNow ? "bg-brand-600" : "bg-muted"
                  )}
                >
                  <div className={cn(
                    "absolute top-0.5 h-3 w-3 rounded-full bg-card shadow transition-transform",
                    activateNow ? "translate-x-3.5" : "translate-x-0.5"
                  )} />
                </div>
                <span className="text-xs text-muted-foreground">Activate on save</span>
              </label>
            </div>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSave(activateNow)}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-md bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-60"
              >
                {saving ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</> : activateNow ? <><Zap className="h-4 w-4" />Activate</> : isEditing ? "Save Changes" : "Save Draft"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Thread List Item ─────────────────────────────────────────────────────────

function ThreadListItem({
  thread,
  isSelected,
  onSelect,
  onStar,
  onArchive,
}: {
  thread: InboxThread;
  isSelected: boolean;
  onSelect: () => void;
  onStar: () => void;
  onArchive: () => void;
}) {
  const lastMsg = thread.messages[thread.messages.length - 1];
  const isInbound = lastMsg?.direction === "inbound";

  return (
    <div
      onClick={onSelect}
      className={cn(
        "group flex items-start gap-3 px-4 py-3.5 border-b border-border cursor-pointer transition-colors",
        isSelected
          ? "bg-brand-50 dark:bg-brand-950/30"
          : thread.read
          ? "hover:bg-accent/50"
          : "bg-brand-50/50 dark:bg-brand-950/20 hover:bg-brand-50"
      )}
    >
      {/* Unread dot */}
      <div className="mt-1.5 shrink-0">
        <div className={cn(
          "h-2 w-2 rounded-full transition-colors",
          !thread.read ? "bg-brand-600" : "bg-transparent"
        )} />
      </div>

      {/* Avatar */}
      <div className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white",
        isInbound ? "bg-violet-500" : "bg-slate-400"
      )}>
        {thread.candidate.split(" ").map(n => n[0]).join("").slice(0, 2)}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className={cn("text-sm truncate", !thread.read ? "font-semibold text-foreground" : "text-foreground")}>
            {thread.candidate}
          </p>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] text-muted-foreground">{thread.time}</span>
            <button
              onClick={(e) => { e.stopPropagation(); onStar(); }}
              className="opacity-0 group-hover:opacity-100 transition-opacity"
            >
              {thread.starred
                ? <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                : <StarOff className="h-3.5 w-3.5 text-muted-foreground hover:text-amber-400" />
              }
            </button>
          </div>
        </div>
        <p className={cn("mt-0.5 text-xs truncate", !thread.read ? "font-medium text-foreground" : "text-muted-foreground")}>
          {thread.subject}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground truncate">{thread.preview}</p>

        {/* Stage badge + tags */}
        {(thread.stage || thread.tags.length > 0) && (
          <div className="mt-1.5 flex items-center gap-1 flex-wrap">
            {thread.stage && (
              <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] text-muted-foreground capitalize">
                {thread.stage}
              </span>
            )}
            {thread.tags.map(tg => (
              <span key={tg} className="rounded-full bg-violet-100 dark:bg-violet-900/30 px-2 py-0.5 text-[10px] font-medium text-violet-700 dark:text-violet-300">
                {tg}
              </span>
            ))}
            {thread.suggestedAction && (
              <span className="rounded-full bg-brand-50 dark:bg-brand-950/40 px-2 py-0.5 text-[10px] font-medium text-brand-600">
                {thread.suggestedAction === "schedule_interview" ? "📅 Schedule call" :
                 thread.suggestedAction === "advance_stage"      ? "➡ Advance stage" :
                                                                    "➕ Add to pipeline"}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Thread View ──────────────────────────────────────────────────────────────

const THREAD_TAGS = ["Hot", "Follow-up", "Scheduled", "Offer", "Declined", "Passive"];

function ThreadView({
  thread,
  activeJobs,
  onClose,
  onReply,
  onAdvanceStage,
  onSchedule,
  onAddToPipeline,
  onForward,
  onArchive,
  onTag,
}: {
  thread: InboxThread;
  activeJobs: { id: string; title: string; companyName?: string }[];
  onClose: () => void;
  onReply: (to: EmailRecipient, subject: string, body?: string) => void;
  onAdvanceStage: (threadId: string, stage: string) => void;
  onSchedule: (candidate: string) => void;
  onAddToPipeline: (candidate: string, jobId: string) => void;
  onForward: (thread: InboxThread) => void;
  onArchive: (id: string) => void;
  onTag: (id: string, tag: string) => void;
}) {
  const [tagOpen, setTagOpen] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyBody, setReplyBody]  = useState("");
  const [stagePickerOpen, setStagePickerOpen] = useState(false);
  const [jobPickerOpen, setJobPickerOpen] = useState(false);
  const [expandedMsgs, setExpandedMsgs] = useState<Set<string>>(
    new Set([thread.messages[thread.messages.length - 1].id])
  );

  function toggleMsg(id: string) {
    setExpandedMsgs(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleSendReply() {
    if (!replyBody.trim()) return;
    toast.success("Reply sent");
    setReplyBody("");
    setReplyOpen(false);
  }

  const lastInbound = [...thread.messages].reverse().find(m => m.direction === "inbound");

  return (
    <div className="flex flex-col h-full">
      {/* Thread header */}
      <div className="shrink-0 border-b border-border bg-card px-5 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-foreground leading-snug">{thread.subject}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {thread.candidate}
              {thread.candidateTitle && <span className="text-muted-foreground/60"> · {thread.candidateTitle}</span>}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => onReply(
                { name: thread.candidate, email: thread.candidateEmail },
                `Re: ${thread.subject}`
              )}
              className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
            >
              <Reply className="h-3.5 w-3.5" />Reply
            </button>
            <button
              onClick={() => onForward(thread)}
              className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
              title="Forward"
            >
              <Forward className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onClose}
              className="rounded-md px-2 py-1.5 text-muted-foreground hover:bg-accent transition-colors text-lg leading-none"
            >×</button>
          </div>
        </div>

        {/* Smart action bar */}
        {thread.suggestedAction && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 dark:bg-brand-950/30 dark:border-brand-800 px-3 py-2">
            <Zap className="h-3.5 w-3.5 text-brand-600 shrink-0" />
            <p className="text-xs text-brand-700 dark:text-brand-300 flex-1">
              {thread.suggestedAction === "schedule_interview"
                ? `${thread.candidate} is interested — schedule a call?`
                : thread.suggestedAction === "advance_stage"
                ? `${thread.candidate} responded positively — advance stage?`
                : `${thread.candidate} isn't in your pipeline yet — add them?`}
            </p>
            <div className="flex items-center gap-1.5">
              {thread.suggestedAction === "schedule_interview" && (
                <button
                  onClick={() => onSchedule(thread.candidate)}
                  className="flex items-center gap-1 rounded-md bg-brand-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-brand-700 transition-colors"
                >
                  <Calendar className="h-3 w-3" />Schedule
                </button>
              )}
              {thread.suggestedAction === "advance_stage" && (
                <div className="relative">
                  <button
                    onClick={() => setStagePickerOpen((v) => !v)}
                    className="flex items-center gap-1 rounded-md bg-brand-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-brand-700 transition-colors"
                  >
                    <MoveRight className="h-3 w-3" />Advance
                    <ChevronDown className="h-3 w-3" />
                  </button>
                  {stagePickerOpen && (
                    <div className="absolute right-0 top-7 z-30 w-44 rounded-xl border border-border bg-card shadow-xl p-1.5 space-y-0.5">
                      {["Screened", "Submitted", "Interview", "Offer"].map((stage) => (
                        <button
                          key={stage}
                          onClick={() => { onAdvanceStage(thread.id, stage.toLowerCase()); setStagePickerOpen(false); }}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-foreground hover:bg-accent transition-colors"
                        >
                          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />{stage}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {thread.suggestedAction === "add_to_pipeline" && (
                <div className="relative">
                  <button
                    onClick={() => setJobPickerOpen((v) => !v)}
                    className="flex items-center gap-1 rounded-md bg-brand-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-brand-700 transition-colors"
                  >
                    <UserCheck className="h-3 w-3" />Add to job
                    <ChevronDown className="h-3 w-3" />
                  </button>
                  {jobPickerOpen && (
                    <div className="absolute right-0 top-7 z-30 w-56 rounded-xl border border-border bg-card shadow-xl overflow-hidden">
                      <div className="px-3 py-2 border-b border-border">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Select a job</p>
                      </div>
                      <div className="max-h-48 overflow-y-auto p-1.5 space-y-0.5">
                        {activeJobs.length === 0 ? (
                          <p className="px-3 py-2 text-xs text-muted-foreground">No active jobs</p>
                        ) : activeJobs.map((job) => (
                          <button
                            key={job.id}
                            onClick={() => { onAddToPipeline(thread.candidate, job.id); setJobPickerOpen(false); }}
                            className="flex w-full flex-col rounded-lg px-3 py-2 text-left hover:bg-accent transition-colors"
                          >
                            <p className="text-xs font-medium text-foreground truncate">{job.title}</p>
                            {job.companyName && <p className="text-[10px] text-muted-foreground truncate">{job.companyName}</p>}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {thread.messages.map((msg, idx) => {
          const isExpanded = expandedMsgs.has(msg.id);
          const isLast = idx === thread.messages.length - 1;
          const isOut = msg.direction === "outbound";

          if (!isExpanded && !isLast) {
            return (
              <button
                key={msg.id}
                onClick={() => toggleMsg(msg.id)}
                className="w-full text-left px-3 py-2 rounded-lg border border-border hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground">{isOut ? "You" : msg.from}</span>
                  <span className="text-[10px] text-muted-foreground">{msg.time}</span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground truncate">
                  {msg.body.split("\n")[0]}
                </p>
              </button>
            );
          }

          return (
            <div
              key={msg.id}
              className={cn(
                "rounded-xl border bg-card overflow-hidden",
                isOut ? "border-border ml-8" : "border-border",
                isLast && "ring-1 ring-border"
              )}
            >
              {/* Msg header */}
              <div
                onClick={() => !isLast && toggleMsg(msg.id)}
                className={cn("flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/30", !isLast && "cursor-pointer hover:bg-accent/30")}
              >
                <div className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white",
                  isOut ? "bg-slate-500" : "bg-violet-500"
                )}>
                  {isOut ? "You" : msg.from.split(" ").map(n => n[0]).join("").slice(0, 2)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-foreground">{isOut ? "You" : msg.from}</p>
                  <p className="text-[10px] text-muted-foreground">{isOut ? "alex@ikhaya.io" : msg.fromEmail}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {msg.hasAttachment && <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />}
                  <span className="text-[10px] text-muted-foreground">{msg.time}</span>
                </div>
              </div>

              {/* Msg body */}
              <div className="px-4 py-3">
                <pre className="whitespace-pre-wrap text-sm font-sans leading-relaxed text-foreground">
                  {msg.body}
                </pre>
              </div>
            </div>
          );
        })}

        {/* Inline reply box */}
        {replyOpen && (
          <div className="rounded-xl border border-brand-300 ring-2 ring-brand-100 bg-card overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-muted/30">
              <Reply className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                Replying to {lastInbound?.from ?? thread.candidate}
              </span>
              <button
                onClick={() => { setReplyOpen(false); setReplyBody(""); }}
                className="ml-auto text-muted-foreground hover:text-foreground text-base leading-none"
              >×</button>
            </div>
            <textarea
              autoFocus
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              placeholder="Write your reply…"
              className="w-full min-h-[140px] resize-none px-4 py-3 text-sm text-foreground bg-transparent outline-none placeholder:text-muted-foreground"
            />
            <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-border bg-muted/20">
              <button className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                <Paperclip className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setReplyOpen(false); setReplyBody(""); }}
                  className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
                >
                  Discard
                </button>
                <button
                  onClick={handleSendReply}
                  disabled={!replyBody.trim()}
                  className="flex items-center gap-1.5 rounded-md bg-brand-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Send className="h-3.5 w-3.5" />Send
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer quick actions */}
      {!replyOpen && (
        <div className="shrink-0 border-t border-border px-5 py-3 flex items-center gap-2">
          <button
            onClick={() => setReplyOpen(true)}
            className="flex items-center gap-1.5 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
          >
            <Reply className="h-4 w-4" />Reply
          </button>
          <button
            onClick={() => onArchive(thread.id)}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent transition-colors"
          >
            <Archive className="h-4 w-4" />Archive
          </button>
          <div className="relative">
            <button
              onClick={() => setTagOpen(o => !o)}
              className={cn(
                "flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                tagOpen ? "border-brand-300 bg-brand-50 text-brand-700" : "border-border text-muted-foreground hover:bg-accent"
              )}
            >
              <Tag className="h-4 w-4" />Tag
              {thread.tags.length > 0 && (
                <span className="ml-0.5 rounded-full bg-brand-100 px-1.5 text-[10px] font-bold text-brand-700">{thread.tags.length}</span>
              )}
            </button>
            {tagOpen && (
              <div className="absolute bottom-full left-0 mb-1 z-10 w-44 rounded-xl border border-border bg-card shadow-xl p-2 space-y-0.5">
                {THREAD_TAGS.map(tg => (
                  <button
                    key={tg}
                    onClick={() => onTag(thread.id, tg)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors",
                      thread.tags.includes(tg) ? "bg-brand-50 text-brand-700 font-semibold" : "text-foreground hover:bg-accent"
                    )}
                  >
                    {tg}
                    {thread.tags.includes(tg) && <CheckCircle2 className="h-3 w-3 text-brand-600" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Enroll Candidates Modal ──────────────────────────────────────────────────

function EnrollModal({ seq, onClose, onEnroll }: {
  seq: EmailSequence;
  onClose: () => void;
  onEnroll: (candidateIds: string[], firstSendAt?: string) => void | Promise<void>;
}) {
  const { candidates } = useCandidates();
  const [query, setQuery]           = useState("");
  const [selected, setSelected]     = useState<Set<string>>(new Set());
  const [enrolling, setEnrolling]   = useState(false);
  const [sendMode, setSendMode]     = useState<"now" | "scheduled">("now");
  const [scheduleDate, setScheduleDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  });

  const filtered = candidates.filter((c) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      c.fullName.toLowerCase().includes(q) ||
      (c.currentTitle ?? "").toLowerCase().includes(q) ||
      (c.currentCompany ?? "").toLowerCase().includes(q)
    );
  });

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleEnroll() {
    if (selected.size === 0) { toast.error("Select at least one candidate"); return; }
    setEnrolling(true);
    try {
      const firstSendAt = sendMode === "scheduled"
        ? new Date(scheduleDate).toISOString()
        : new Date().toISOString();
      await onEnroll([...selected], firstSendAt);
      toast.success(`${selected.size} candidate${selected.size > 1 ? "s" : ""} enrolled in "${seq.name}"`);
      onClose();
    } catch {
      toast.error("Failed to enroll candidates");
    } finally {
      setEnrolling(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex w-full max-w-lg flex-col rounded-2xl bg-card border border-border shadow-2xl overflow-hidden" style={{ maxHeight: "85vh" }}>
        {/* Header */}
        <div className="shrink-0 border-b border-border px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Enroll Candidates</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Add to "{seq.name}"</p>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search candidates…"
              className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground text-foreground"
            />
            {query && (
              <button onClick={() => setQuery("")} className="text-muted-foreground hover:text-foreground text-base leading-none">×</button>
            )}
          </div>
        </div>

        {/* Candidate list */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No candidates found</p>
            </div>
          ) : (
            filtered.map((c) => {
              const isChecked = selected.has(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => toggle(c.id)}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-3 border-b border-border text-left transition-colors",
                    isChecked ? "bg-brand-50 dark:bg-brand-950/30" : "hover:bg-accent/50"
                  )}
                >
                  <div className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors", isChecked ? "bg-brand-600 border-brand-600" : "border-border bg-background")}>
                    {isChecked && <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 12 10" fill="none"><path d="M1 5l3 4 7-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  </div>
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/40 text-[10px] font-bold text-violet-700 dark:text-violet-300">
                    {c.fullName.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{c.fullName}</p>
                    {(c.currentTitle || c.currentCompany) && (
                      <p className="text-xs text-muted-foreground truncate">{[c.currentTitle, c.currentCompany].filter(Boolean).join(" · ")}</p>
                    )}
                  </div>
                  <span className="shrink-0 rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] text-muted-foreground capitalize">{c.status}</span>
                </button>
              );
            })
          )}
        </div>

        {/* Scheduling + footer */}
        <div className="shrink-0 border-t border-border px-5 py-4 space-y-3">
          {/* Send timing */}
          <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">First email send time</p>
            <div className="flex gap-2">
              <button
                onClick={() => setSendMode("now")}
                className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-colors", sendMode === "now" ? "border-brand-500 bg-brand-50 text-brand-700" : "border-border text-muted-foreground hover:bg-accent")}
              >
                <Zap className="h-3.5 w-3.5" />Send immediately
              </button>
              <button
                onClick={() => setSendMode("scheduled")}
                className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-colors", sendMode === "scheduled" ? "border-brand-500 bg-brand-50 text-brand-700" : "border-border text-muted-foreground hover:bg-accent")}
              >
                <Calendar className="h-3.5 w-3.5" />Schedule
              </button>
            </div>
            {sendMode === "scheduled" && (
              <input
                type="datetime-local"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-brand-500"
              />
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {selected.size > 0 ? `${selected.size} selected` : "No candidates selected"}
            </p>
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent transition-colors">Cancel</button>
              <button
                onClick={handleEnroll}
                disabled={enrolling || selected.size === 0}
                className="flex items-center gap-1.5 rounded-md bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {enrolling ? <><Loader2 className="h-4 w-4 animate-spin" />Enrolling…</> : <><Users className="h-4 w-4" />Enroll {selected.size > 0 ? selected.size : ""}</>}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const TABS = ["sequences", "inbox"] as const;
type Tab = typeof TABS[number];
type InboxFilter = "all" | "unread" | "starred" | "sent";

export default function OutreachPage() {
  const [activeTab, setActiveTab]             = useState<Tab>("inbox");
  const {
    sequences,
    loading: seqLoading,
    createSequence,
    updateSequence:    persistUpdate,
    deleteSequence:    persistDelete,
    cloneSequence:     persistClone,
    toggleStatus:      persistToggle,
    incrementEnrolled,
  } = useOutreachSequences();
  const [showBuilder, setShowBuilder]         = useState(false);
  const [editingSeq, setEditingSeq]           = useState<EmailSequence | null>(null);
  const [enrollSeq, setEnrollSeq]             = useState<EmailSequence | null>(null);
  const [selectedSeq, setSelectedSeq]         = useState<EmailSequence | null>(null);
  const [threads, setThreads]                 = useState<InboxThread[]>([]);
  const [selectedThread, setSelectedThread]   = useState<InboxThread | null>(null);
  const [inboxFilter, setInboxFilter]         = useState<InboxFilter>("all");
  const [inboxSearch, setInboxSearch]         = useState("");
  const [composeOpen, setComposeOpen]         = useState(false);
  const [composeTo, setComposeTo]             = useState<EmailRecipient[]>([]);
  const [composeSubject, setComposeSubject]   = useState("");
  const [composeBody, setComposeBody]         = useState("");

  // ─── Real data hooks ───────────────────────────────────────────────────────
  const { isConnected, loading: connectionsLoading } = useProviderConnections();
  const { threads: emailThreads, loading: threadsLoading } = useEmailThreads(50);
  const { jobs } = useJobs();
  const hasEmailConnected = isConnected("google") || isConnected("microsoft");
  const activeJobs = jobs.filter((j) => j.status === "active");

  // Map EmailThreadRecord → InboxThread when real data arrives; demo threads otherwise
  useEffect(() => {
    if (!hasEmailConnected) {
      setThreads(DEMO_THREADS);
      setSelectedThread(DEMO_THREADS[0]);
      return;
    }
    setThreads(
      emailThreads.map((r) => ({
        id:             r.id,
        candidate:      r.snippet ? r.snippet.split(" ")[0] : "Contact",
        candidateEmail: "",
        subject:        r.subject ?? "(no subject)",
        preview:        r.snippet ?? "",
        time:           formatRelativeTime(r.lastMsgAt),
        timestamp:      new Date(r.lastMsgAt).getTime(),
        read:           true,
        starred:        false,
        archived:       false,
        tags:           [],
        messages:       [],
      }))
    );
  }, [emailThreads, hasEmailConnected]);

  function toggleStatus(id: string) {
    const seq = sequences.find((s) => s.id === id);
    if (!seq) return;
    const next: SequenceStatus = seq.status === "active" ? "paused" : "active";
    toast.success(`Sequence ${next === "active" ? "resumed" : "paused"}`);
    persistToggle(id);
  }

  function handleSelectThread(thread: InboxThread) {
    setSelectedThread(thread);
    setThreads(prev => prev.map(t => t.id === thread.id ? { ...t, read: true } : t));
  }

  function handleStarThread(id: string) {
    setThreads(prev => prev.map(t => t.id === id ? { ...t, starred: !t.starred } : t));
  }

  function handleArchiveThread(id: string) {
    setThreads(prev => prev.map(t => t.id === id ? { ...t, archived: true } : t));
    if (selectedThread?.id === id) setSelectedThread(null);
    toast.success("Thread archived");
  }

  function handleTagThread(id: string, tag: string) {
    setThreads(prev => prev.map(t => {
      if (t.id !== id) return t;
      const tags = t.tags.includes(tag)
        ? t.tags.filter(tg => tg !== tag)
        : [...t.tags, tag];
      return { ...t, tags };
    }));
  }

  function handleForwardThread(thread: InboxThread) {
    const lastMsg = thread.messages[thread.messages.length - 1];
    const quotedBody = lastMsg
      ? `\n\n---------- Forwarded message ----------\nFrom: ${lastMsg.from}\n\n${lastMsg.body}`
      : "";
    setComposeTo([]);
    setComposeSubject(`Fwd: ${thread.subject}`);
    setComposeBody(quotedBody);
    setComposeOpen(true);
  }

  const [refreshing, setRefreshing] = useState(false);

  function handleRefresh() {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
      toast.success("Inbox refreshed");
    }, 800);
  }

  function handleEnrollCandidates(seq: EmailSequence) {
    setEnrollSeq(seq);
  }

  function handleEnrollConfirm(candidateIds: string[], _firstSendAt?: string) {
    if (!enrollSeq) return;
    incrementEnrolled(enrollSeq.id, candidateIds.length);
    if (selectedSeq?.id === enrollSeq.id) {
      setSelectedSeq((prev) => prev ? { ...prev, enrolled: prev.enrolled + candidateIds.length } : prev);
    }
    setEnrollSeq(null);
  }

  async function handleUpdateSequence(updated: EmailSequence) {
    await persistUpdate(updated.id, {
      name:   updated.name,
      tag:    updated.tag,
      status: updated.status,
      steps:  updated.steps,
    });
    setSelectedSeq(updated);
    setEditingSeq(null);
  }

  async function handleCloneSequence(seq: EmailSequence) {
    const cloned = await persistClone(seq);
    if (cloned) {
      setSelectedSeq(cloned);
      toast.success(`Cloned "${seq.name}"`);
    } else {
      toast.error("Failed to clone sequence");
    }
  }

  async function handleDeleteSequence(id: string) {
    const ok = await persistDelete(id);
    if (ok) {
      if (selectedSeq?.id === id) setSelectedSeq(null);
      toast.success("Sequence deleted");
    } else {
      toast.error("Failed to delete sequence");
    }
  }

  function handleReply(to: EmailRecipient, subject: string) {
    setComposeTo([to]);
    setComposeSubject(subject);
    setComposeBody("");
    setComposeOpen(true);
  }

  function handleAdvanceStage(threadId: string, stage: string) {
    setThreads(prev => prev.map(t => t.id === threadId
      ? { ...t, stage, suggestedAction: undefined }
      : t
    ));
    toast.success(`Candidate advanced to ${stage.charAt(0).toUpperCase() + stage.slice(1)}`);
  }

  function handleSchedule(candidate: string) {
    toast.success(`Calendar link sent to ${candidate}`);
    setThreads(prev => prev.map(t =>
      t.candidate === candidate ? { ...t, suggestedAction: undefined } : t
    ));
  }

  function handleAddToPipeline(candidate: string, jobId: string) {
    const job = activeJobs.find((j) => j.id === jobId);
    toast.success(`${candidate} added to "${job?.title ?? "pipeline"}"`);
    setThreads(prev => prev.map(t =>
      t.candidate === candidate ? { ...t, suggestedAction: undefined } : t
    ));
  }

  const filteredThreads = threads.filter(t => {
    if (t.archived) return false;
    if (inboxFilter === "unread"  && t.read)     return false;
    if (inboxFilter === "starred" && !t.starred)  return false;
    if (inboxSearch) {
      const q = inboxSearch.toLowerCase();
      return t.candidate.toLowerCase().includes(q) || t.subject.toLowerCase().includes(q);
    }
    return true;
  });

  const unreadCount = threads.filter(t => !t.read && !t.archived).length;
  const totalEnrolled = sequences.reduce((s, q) => s + q.enrolled, 0);
  const totalSent     = sequences.reduce((s, q) => s + q.sent, 0);
  const totalReplied  = sequences.reduce((s, q) => s + q.replied, 0);

  // Keep the detail panel in sync with optimistic updates from the hook
  const displayedSeq = selectedSeq
    ? (sequences.find((s) => s.id === selectedSeq.id) ?? selectedSeq)
    : null;

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Outreach</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">Email sequences and candidate communications</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setComposeTo([]); setComposeSubject(""); setComposeBody(""); setComposeOpen(true); }}
              className="flex items-center gap-1.5 rounded-md border border-border bg-background px-3.5 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors"
            >
              <PenSquare className="h-4 w-4" />Compose
            </button>
            <button
              onClick={() => setShowBuilder(true)}
              className="flex items-center gap-1.5 rounded-md bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
            >
              <Plus className="h-4 w-4" />New Sequence
            </button>
          </div>
        </div>

        {/* Summary KPIs */}
        <div className="mt-4 flex items-center gap-6 text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Zap className="h-3.5 w-3.5 text-emerald-500" />
            <span className="font-semibold text-foreground">{sequences.filter((s) => s.status === "active").length}</span>
            active sequences
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Users className="h-3.5 w-3.5 text-brand-500" />
            <span className="font-semibold text-foreground">{totalEnrolled}</span>
            enrolled
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Send className="h-3.5 w-3.5 text-violet-500" />
            <span className="font-semibold text-foreground">{totalSent}</span>
            sent
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            <span className="font-semibold text-foreground">{totalReplied}</span>
            replied
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-4 flex gap-0">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize",
                activeTab === tab
                  ? "border-brand-600 text-brand-600"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {tab === "inbox" ? (
                <>
                  <Inbox className="h-3.5 w-3.5" />Inbox
                  {unreadCount > 0 && (
                    <span className="ml-1 rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
                      {unreadCount}
                    </span>
                  )}
                </>
              ) : (
                <><BarChart2 className="h-3.5 w-3.5" />Sequences</>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Sequences tab ── */}
        {activeTab === "sequences" && (
          <>
            <div className={cn("flex-1 overflow-y-auto border-r border-border", displayedSeq && "max-w-xl")}>
              {seqLoading ? (
                <div className="space-y-px">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="flex items-center gap-4 px-4 py-3.5 border-b border-border animate-pulse">
                      <div className="h-7 w-7 rounded-full bg-muted shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 w-40 rounded bg-muted" />
                        <div className="h-2.5 w-24 rounded bg-muted" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : sequences.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 mb-3">
                    <Mail className="h-6 w-6 text-brand-500" />
                  </div>
                  <p className="text-sm font-semibold text-foreground">No sequences yet</p>
                  <p className="mt-1 text-xs text-muted-foreground max-w-xs">Build a sequence to automate outreach across multiple touchpoints.</p>
                  <button
                    onClick={() => setShowBuilder(true)}
                    className="mt-4 flex items-center gap-1.5 rounded-md bg-brand-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />New Sequence
                  </button>
                </div>
              ) : (
                sequences.map((seq) => (
                  <SequenceRow
                    key={seq.id}
                    seq={seq}
                    isSelected={displayedSeq?.id === seq.id}
                    onSelect={() => setSelectedSeq(displayedSeq?.id === seq.id ? null : seq)}
                    onToggle={() => toggleStatus(seq.id)}
                  />
                ))
              )}
            </div>
            {displayedSeq && (
              <div className="w-96 shrink-0 overflow-hidden">
                <SequenceDetail
                  seq={displayedSeq}
                  onClose={() => setSelectedSeq(null)}
                  onEnroll={() => handleEnrollCandidates(displayedSeq)}
                  onClone={() => handleCloneSequence(displayedSeq)}
                  onDelete={() => handleDeleteSequence(displayedSeq.id)}
                  onEdit={() => setEditingSeq(displayedSeq)}
                />
              </div>
            )}
          </>
        )}

        {/* ── Inbox tab ── */}
        {activeTab === "inbox" && (
          <>
            {/* Thread list */}
            <div className={cn(
              "flex flex-col border-r border-border overflow-hidden",
              selectedThread ? "w-80 shrink-0" : "flex-1"
            )}>
              {/* Inbox toolbar */}
              <div className="shrink-0 border-b border-border px-3 py-2 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex flex-1 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5">
                    <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <input
                      type="text"
                      value={inboxSearch}
                      onChange={(e) => setInboxSearch(e.target.value)}
                      placeholder="Search…"
                      className="flex-1 text-xs bg-transparent outline-none placeholder:text-muted-foreground text-foreground"
                    />
                  </div>
                  <button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-accent transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
                  </button>
                </div>

                {/* Filter pills */}
                <div className="flex items-center gap-1">
                  {(["all", "unread", "starred"] as InboxFilter[]).map((f) => (
                    <button
                      key={f}
                      onClick={() => setInboxFilter(f)}
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors capitalize",
                        inboxFilter === f
                          ? "bg-brand-600 text-white"
                          : "bg-muted text-muted-foreground hover:bg-accent"
                      )}
                    >
                      {f === "unread" ? `Unread${unreadCount > 0 ? ` (${unreadCount})` : ""}` : f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Thread list */}
              <div className="flex-1 overflow-y-auto">
                {connectionsLoading || threadsLoading ? (
                  /* Loading skeleton */
                  <div className="space-y-px">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="flex items-start gap-3 px-3 py-3 border-b border-border animate-pulse">
                        <div className="h-8 w-8 rounded-full bg-muted shrink-0" />
                        <div className="flex-1 space-y-1.5">
                          <div className="h-3 w-24 rounded bg-muted" />
                          <div className="h-2.5 w-40 rounded bg-muted" />
                          <div className="h-2 w-32 rounded bg-muted" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : !hasEmailConnected ? (
                  /* Connect email CTA */
                  <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-4">
                    <div className="rounded-full bg-brand-50 p-4">
                      <Link2 className="h-6 w-6 text-brand-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Connect your email</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Link Gmail or Outlook to see your outreach threads and replies here.
                      </p>
                    </div>
                    <a
                      href="/settings?tab=integrations"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
                    >
                      <Link2 className="h-3.5 w-3.5" />
                      Connect in Settings
                    </a>
                  </div>
                ) : filteredThreads.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                    <Inbox className="h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">No messages</p>
                    <p className="mt-1 text-xs text-muted-foreground">Your inbox will populate as email syncs</p>
                  </div>
                ) : (
                  filteredThreads.map((thread) => (
                    <ThreadListItem
                      key={thread.id}
                      thread={thread}
                      isSelected={selectedThread?.id === thread.id}
                      onSelect={() => handleSelectThread(thread)}
                      onStar={() => handleStarThread(thread.id)}
                      onArchive={() => handleArchiveThread(thread.id)}
                    />
                  ))
                )}
              </div>
            </div>

            {/* Thread view */}
            {selectedThread && (
              <div className="flex-1 overflow-hidden">
                <ThreadView
                  thread={selectedThread}
                  activeJobs={activeJobs}
                  onClose={() => setSelectedThread(null)}
                  onReply={handleReply}
                  onAdvanceStage={handleAdvanceStage}
                  onSchedule={handleSchedule}
                  onAddToPipeline={handleAddToPipeline}
                  onForward={handleForwardThread}
                  onArchive={handleArchiveThread}
                  onTag={handleTagThread}
                />
              </div>
            )}

            {/* Empty state when nothing selected */}
            {!selectedThread && hasEmailConnected && (
              <div className="flex flex-1 flex-col items-center justify-center py-20 text-center px-8 gap-3">
                <Inbox className="h-10 w-10 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">Select a conversation</p>
                <p className="text-xs text-muted-foreground">Choose a thread from the left to read and reply</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Compose modal */}
      {composeOpen && (
        <EmailComposeModal
          to={composeTo}
          defaultSubject={composeSubject}
          onClose={() => setComposeOpen(false)}
        />
      )}

      {/* Sequence builder modal — new */}
      {showBuilder && (
        <SequenceBuilderModal
          onClose={() => setShowBuilder(false)}
          onSave={async (seq) => {
            const created = await createSequence({
              name:     seq.name,
              tag:      seq.tag,
              status:   seq.status,
              steps:    seq.steps,
              enrolled: seq.enrolled,
              sent:     seq.sent,
              opened:   seq.opened,
              replied:  seq.replied,
            });
            if (!created) throw new Error("create failed");
            setSelectedSeq(created);
          }}
        />
      )}

      {/* Sequence builder modal — edit existing */}
      {editingSeq && (
        <SequenceBuilderModal
          initialSeq={editingSeq}
          onClose={() => setEditingSeq(null)}
          onSave={async (seq) => {
            const created = await createSequence({
              name:     seq.name,
              tag:      seq.tag,
              status:   seq.status,
              steps:    seq.steps,
              enrolled: seq.enrolled,
              sent:     seq.sent,
              opened:   seq.opened,
              replied:  seq.replied,
            });
            if (!created) throw new Error("create failed");
            setSelectedSeq(created);
          }}
          onUpdate={handleUpdateSequence}
        />
      )}

      {/* Enroll candidates modal */}
      {enrollSeq && (
        <EnrollModal
          seq={enrollSeq}
          onClose={() => setEnrollSeq(null)}
          onEnroll={handleEnrollConfirm}
        />
      )}
    </div>
  );
}
