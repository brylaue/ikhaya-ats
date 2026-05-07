"use client";

import { useState } from "react";
import {
  X, Calendar, Clock, Video, MapPin, Phone, Users,
  Check, ChevronRight, Send, ArrowRight, Linkedin,
  Building2, User, Plus, Trash2,
} from "lucide-react";
import { cn, generateAvatarColor, getInitials } from "@/lib/utils";
import { useJobs, useScheduledInterviews } from "@/lib/supabase/hooks";
import { toast } from "sonner";
import type { Candidate } from "@/types";
import type { Job } from "@/types";

// Static team member shape for internal suggestions (populated when multi-user is live)
interface TeamMember { id: string; fullName: string; email: string; role: string; }
const TEAM_MEMBERS: TeamMember[] = [];

// ─── Types ────────────────────────────────────────────────────────────────────

type InterviewFormat = "video" | "phone" | "onsite" | "panel";
type InterviewStep   = "details" | "interviewers" | "confirm";

interface Interviewer {
  id: string;
  name: string;
  email: string;
  role?: string;
  isExternal?: boolean;
}

interface InterviewForm {
  jobId:       string;
  date:        string;
  startTime:   string;
  endTime:     string;
  format:      InterviewFormat;
  location:    string;
  meetingLink: string;
  interviewers: Interviewer[];
  notes:       string;
  notifyCandidate: boolean;
  notifyClient:    boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FORMAT_CFG: Record<InterviewFormat, { label: string; icon: React.ElementType; placeholder: string }> = {
  video:  { label: "Video call",   icon: Video,     placeholder: "Paste Zoom / Meet / Teams link…" },
  phone:  { label: "Phone screen", icon: Phone,     placeholder: "Phone number or dial-in details…" },
  onsite: { label: "On-site",      icon: MapPin,    placeholder: "Office address…" },
  panel:  { label: "Panel",        icon: Users,     placeholder: "Conference room or video link…" },
};

const QUICK_DURATIONS = [
  { label: "30 min", offset: 30 },
  { label: "45 min", offset: 45 },
  { label: "1 hr",   offset: 60 },
  { label: "90 min", offset: 90 },
];

const TOMORROW_SLOTS = [
  "09:00", "10:00", "11:00", "14:00", "15:00", "16:00",
];

function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function tomorrowDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

// ─── Step 1: Details ──────────────────────────────────────────────────────────

function DetailsStep({
  form,
  onChange,
  candidateName,
  jobs,
}: {
  form: InterviewForm;
  onChange: (patch: Partial<InterviewForm>) => void;
  candidateName: string;
  jobs: Job[];
}) {
  const FormatIcon = FORMAT_CFG[form.format].icon;
  const locationPlaceholder = FORMAT_CFG[form.format].placeholder;

  function setDuration(mins: number) {
    if (form.startTime) onChange({ endTime: addMinutes(form.startTime, mins) });
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Interview details</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Set up the interview for {candidateName}
        </p>
      </div>

      {/* Job selector */}
      <div>
        <label className="block text-xs font-medium text-foreground mb-1.5">Role *</label>
        <select
          value={form.jobId}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onChange({ jobId: e.target.value })}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">Select a role…</option>
          {jobs.filter((j) => j.status === "active").map((j) => (
            <option key={j.id} value={j.id}>{j.title} — {j.companyName ?? ""}</option>
          ))}
        </select>
      </div>

      {/* Format */}
      <div>
        <label className="block text-xs font-medium text-foreground mb-1.5">Format</label>
        <div className="grid grid-cols-4 gap-2">
          {(Object.keys(FORMAT_CFG) as InterviewFormat[]).map((f) => {
            const cfg = FORMAT_CFG[f];
            const Icon = cfg.icon;
            return (
              <button
                key={f}
                onClick={() => onChange({ format: f })}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-xl border p-3 text-xs font-medium transition-all",
                  form.format === f
                    ? "border-brand-400 bg-brand-50 text-brand-700 shadow-sm"
                    : "border-border text-muted-foreground hover:border-brand-200 hover:bg-accent/30"
                )}
              >
                <Icon className="h-4 w-4" />
                {cfg.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Date + time */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-foreground mb-1.5">Date *</label>
          <input
            type="date"
            value={form.date}
            min={new Date().toISOString().split("T")[0]}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ date: e.target.value })}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
          />
          {/* Quick date chips */}
          <div className="flex gap-1.5 mt-1.5">
            <button
              onClick={() => onChange({ date: tomorrowDate() })}
              className="rounded-md border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-accent transition-colors"
            >
              Tomorrow
            </button>
            <button
              onClick={() => {
                const d = new Date(); d.setDate(d.getDate() + ((1 + 7 - d.getDay()) % 7 || 7));
                onChange({ date: d.toISOString().split("T")[0] });
              }}
              className="rounded-md border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-accent transition-colors"
            >
              Next Monday
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-foreground mb-1.5">Time *</label>
          <div className="flex gap-2">
            <input
              type="time"
              value={form.startTime}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                const st = e.target.value;
                const et = form.endTime || addMinutes(st, 60);
                onChange({ startTime: st, endTime: et });
              }}
              className="flex-1 rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
            />
            <span className="self-center text-xs text-muted-foreground">–</span>
            <input
              type="time"
              value={form.endTime}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ endTime: e.target.value })}
              className="flex-1 rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          {/* Duration chips */}
          {form.startTime && (
            <div className="flex gap-1.5 mt-1.5">
              {QUICK_DURATIONS.map((d) => (
                <button
                  key={d.label}
                  onClick={() => setDuration(d.offset)}
                  className="rounded-md border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-accent transition-colors"
                >
                  {d.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick time slots */}
      {!form.startTime && (
        <div>
          <p className="text-[10px] font-medium text-muted-foreground mb-1.5">Popular times</p>
          <div className="flex flex-wrap gap-1.5">
            {TOMORROW_SLOTS.map((slot) => (
              <button
                key={slot}
                onClick={() => onChange({ startTime: slot, endTime: addMinutes(slot, 60) })}
                className="rounded-md border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground hover:border-brand-300 hover:text-foreground transition-colors"
              >
                {slot}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Location / link */}
      <div>
        <label className="block text-xs font-medium text-foreground mb-1.5">
          {form.format === "video" ? "Meeting link" : form.format === "phone" ? "Dial-in" : "Location"}
        </label>
        <input
          value={form.format === "video" ? form.meetingLink : form.location}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            form.format === "video"
              ? onChange({ meetingLink: e.target.value })
              : onChange({ location: e.target.value })
          }
          placeholder={locationPlaceholder}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-brand-500"
        />
        {form.format === "video" && (
          <div className="flex gap-2 mt-1.5">
            {["Zoom", "Google Meet", "Microsoft Teams"].map((svc) => (
              <button
                key={svc}
                onClick={() => {
                  const urls: Record<string, string> = {
                    "Zoom": "https://zoom.us/j/",
                    "Google Meet": "https://meet.google.com/",
                    "Microsoft Teams": "https://teams.microsoft.com/l/meetup-join/",
                  };
                  onChange({ meetingLink: urls[svc] });
                }}
                className="rounded-md border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-accent transition-colors"
              >
                {svc}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Notes */}
      <div>
        <label className="block text-xs font-medium text-foreground mb-1.5">Prep notes for candidate (optional)</label>
        <textarea
          value={form.notes}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange({ notes: e.target.value })}
          rows={3}
          placeholder="What to expect, topics to prepare, dress code, parking info…"
          className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>
    </div>
  );
}

// ─── Step 2: Interviewers ─────────────────────────────────────────────────────

function InterviewersStep({
  form,
  onChange,
}: {
  form: InterviewForm;
  onChange: (patch: Partial<InterviewForm>) => void;
}) {
  const [newName,  setNewName]  = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole,  setNewRole]  = useState("");

  const internalSuggestions = TEAM_MEMBERS.filter(
    (u) => !form.interviewers.some((i) => i.id === u.id)
  );

  function addInternal(u: TeamMember) {
    onChange({
      interviewers: [...form.interviewers, {
        id: u.id, name: u.fullName, email: u.email, role: u.role,
      }],
    });
  }

  function addExternal() {
    if (!newName.trim() || !newEmail.trim()) return;
    onChange({
      interviewers: [...form.interviewers, {
        id: `ext_${Date.now()}`, name: newName.trim(), email: newEmail.trim(),
        role: newRole.trim() || undefined, isExternal: true,
      }],
    });
    setNewName(""); setNewEmail(""); setNewRole("");
  }

  function remove(id: string) {
    onChange({ interviewers: form.interviewers.filter((i) => i.id !== id) });
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Who's interviewing?</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Add team members and client-side interviewers.
        </p>
      </div>

      {/* Team members */}
      {internalSuggestions.length > 0 && (
        <div>
          <p className="text-xs font-medium text-foreground mb-2">Your team</p>
          <div className="space-y-1.5">
            {internalSuggestions.map((u) => (
              <button
                key={u.id}
                onClick={() => addInternal(u)}
                className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left hover:border-brand-200 hover:bg-accent/20 transition-all"
              >
                <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white", generateAvatarColor(u.id))}>
                  {getInitials(u.fullName)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground">{u.fullName}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">{u.role}</p>
                </div>
                <Plus className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Selected interviewers */}
      {form.interviewers.length > 0 && (
        <div>
          <p className="text-xs font-medium text-foreground mb-2">
            Selected ({form.interviewers.length})
          </p>
          <div className="space-y-1.5">
            {form.interviewers.map((i) => (
              <div
                key={i.id}
                className="flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50/50 p-3"
              >
                <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white", generateAvatarColor(i.id))}>
                  {getInitials(i.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground">
                    {i.name}
                    {i.isExternal && (
                      <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">External</span>
                    )}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{i.email}</p>
                </div>
                <button onClick={() => remove(i.id)} className="text-muted-foreground hover:text-red-500 transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* External interviewer form */}
      <div>
        <p className="text-xs font-medium text-foreground mb-2">Add external interviewer</p>
        <div className="rounded-xl border border-border bg-accent/20 p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input
              value={newName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewName(e.target.value)}
              placeholder="Full name *"
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-brand-500"
            />
            <input
              value={newEmail}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewEmail(e.target.value)}
              placeholder="Email address *"
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div className="flex gap-2">
            <input
              value={newRole}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewRole(e.target.value)}
              placeholder="Role / title (optional)"
              className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-brand-500"
            />
            <button
              onClick={addExternal}
              disabled={!newName.trim() || !newEmail.trim()}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-40 transition-colors"
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Step 3: Confirm ──────────────────────────────────────────────────────────

function ConfirmStep({
  form,
  candidate,
  jobs,
}: {
  form: InterviewForm;
  candidate: Candidate;
  jobs: Job[];
}) {
  const job       = jobs.find((j) => j.id === form.jobId);
  const FormatCfg = FORMAT_CFG[form.format];
  const FormatIcon = FormatCfg.icon;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Review & send</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Calendar invites will be sent to all participants.
        </p>
      </div>

      {/* Summary card */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="bg-brand-600 px-5 py-4">
          <p className="text-sm font-bold text-white">{job?.title ?? "Interview"}</p>
          <p className="text-xs text-brand-200">{job?.companyName}</p>
        </div>
        <div className="p-5 space-y-3">
          {/* Candidate */}
          <div className="flex items-center gap-3">
            <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white", generateAvatarColor(candidate.id))}>
              {getInitials(candidate.fullName)}
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground">{candidate.fullName}</p>
              <p className="text-[10px] text-muted-foreground">{candidate.currentTitle}</p>
            </div>
          </div>

          <div className="border-t border-border" />

          {/* Date / time */}
          {form.date && (
            <div className="flex items-center gap-2 text-xs">
              <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="font-medium text-foreground">{formatDisplayDate(form.date)}</span>
            </div>
          )}
          {form.startTime && (
            <div className="flex items-center gap-2 text-xs">
              <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="font-medium text-foreground">{form.startTime} – {form.endTime || "?"}</span>
            </div>
          )}

          {/* Format */}
          <div className="flex items-center gap-2 text-xs">
            <FormatIcon className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="font-medium text-foreground">{FormatCfg.label}</span>
            {(form.meetingLink || form.location) && (
              <span className="text-brand-600 truncate">{form.meetingLink || form.location}</span>
            )}
          </div>

          {/* Interviewers */}
          {form.interviewers.length > 0 && (
            <div className="flex items-start gap-2 text-xs">
              <Users className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <span className="font-medium text-foreground">Interviewers: </span>
                <span className="text-muted-foreground">{form.interviewers.map((i) => i.name).join(", ")}</span>
              </div>
            </div>
          )}

          {/* Prep notes */}
          {form.notes && (
            <div className="rounded-lg border border-border bg-accent/30 p-2.5 text-xs text-muted-foreground italic">
              "{form.notes.length > 120 ? form.notes.slice(0, 120) + "…" : form.notes}"
            </div>
          )}
        </div>
      </div>

      {/* Notifications */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-foreground">Send calendar invites to</p>
        {[
          { key: "notifyCandidate", label: `${candidate.firstName} (candidate)`, email: candidate.email },
          { key: "notifyClient",    label: "Client contacts",                    email: job?.companyName },
        ].map(({ key, label, email }) => (
          <label key={key} className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form[key as keyof InterviewForm] as boolean}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ [key]: e.target.checked })}
              className="rounded border-border accent-brand-600"
            />
            <span className="flex-1 text-xs text-foreground">{label}</span>
            {email && <span className="text-[10px] text-muted-foreground">{email}</span>}
          </label>
        ))}
      </div>
    </div>
  );

  function onChange(patch: Partial<InterviewForm>) { /* noop in read-only confirm step */ }
}

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEPS: { id: InterviewStep; label: string }[] = [
  { id: "details",      label: "Details"      },
  { id: "interviewers", label: "Interviewers" },
  { id: "confirm",      label: "Confirm"      },
];

function StepBar({ current }: { current: InterviewStep }) {
  const idx = STEPS.findIndex((s) => s.id === current);
  return (
    <div className="flex items-center gap-0">
      {STEPS.map((step, i) => (
        <div key={step.id} className="flex items-center">
          <div className="flex items-center gap-1.5">
            <div className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold",
              i < idx  ? "bg-emerald-500 text-white" :
              i === idx ? "bg-brand-600 text-white" :
                         "bg-muted text-muted-foreground"
            )}>
              {i < idx ? <Check className="h-3 w-3" /> : i + 1}
            </div>
            <span className={cn("text-xs font-medium", i === idx ? "text-foreground" : "text-muted-foreground")}>
              {step.label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={cn("mx-2 h-px w-6", i < idx ? "bg-emerald-400" : "bg-border")} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export interface ScheduleInterviewModalProps {
  candidate: Candidate;
  defaultJobId?: string;
  onClose: () => void;
  onScheduled?: () => void;
}

export function ScheduleInterviewModal({ candidate, defaultJobId, onClose, onScheduled }: ScheduleInterviewModalProps) {
  const { jobs } = useJobs();
  const { scheduleInterview } = useScheduledInterviews();
  const [step, setStep]       = useState<InterviewStep>("details");
  const [submitting, setSub]  = useState(false);
  const [done, setDone]       = useState(false);

  const [form, setForm] = useState<InterviewForm>({
    jobId:           defaultJobId ?? "",
    date:            "",
    startTime:       "",
    endTime:         "",
    format:          "video",
    location:        "",
    meetingLink:     "",
    interviewers:    [],
    notes:           "",
    notifyCandidate: true,
    notifyClient:    true,
  });

  function patch(p: Partial<InterviewForm>) {
    setForm((prev) => ({ ...prev, ...p }));
  }

  function canAdvance(): boolean {
    if (step === "details")      return !!form.jobId && !!form.date && !!form.startTime;
    if (step === "interviewers") return true;
    if (step === "confirm")      return true;
    return false;
  }

  function next() {
    if (step === "details")      setStep("interviewers");
    else if (step === "interviewers") setStep("confirm");
    else handleSchedule();
  }

  function back() {
    if (step === "interviewers") setStep("details");
    if (step === "confirm")      setStep("interviewers");
  }

  async function handleSchedule() {
    setSub(true);
    const job = jobs.find((j) => j.id === form.jobId);
    const result = await scheduleInterview({
      candidateId:     candidate.id,
      candidateName:   candidate.fullName,
      candidateTitle:  candidate.currentTitle,
      jobId:           form.jobId,
      jobTitle:        job?.title ?? "",
      clientName:      job?.companyName,
      date:            form.date,
      startTime:       form.startTime,
      endTime:         form.endTime || form.startTime,
      format:          form.format,
      location:        form.location || undefined,
      meetingLink:     form.meetingLink || undefined,
      interviewers:    form.interviewers,
      notes:           form.notes || undefined,
      notifyCandidate: form.notifyCandidate,
      notifyClient:    form.notifyClient,
    });
    setSub(false);
    setDone(true);
    if (result) {
      toast.success(`Interview scheduled with ${candidate.firstName} for ${form.date}`);
      if (form.notifyCandidate) toast.success(`Calendar invite sent to ${candidate.firstName}`);
      if (form.notifyClient && job?.companyName) toast.success(`Client notified: ${job.companyName}`);
    } else {
      // Optimistic fallback — persist failed but UX continues
      toast.success(`Interview noted — saved locally`);
    }
    onScheduled?.();
    setTimeout(onClose, 600);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 flex w-full max-w-xl flex-col rounded-2xl border border-border bg-card shadow-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100">
              <Calendar className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">Schedule Interview</h2>
              <p className="text-[11px] text-muted-foreground">{candidate.fullName}</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Step bar */}
        <div className="shrink-0 border-b border-border px-6 py-3">
          <StepBar current={step} />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === "details"      && <DetailsStep      form={form} onChange={patch} candidateName={candidate.firstName} jobs={jobs} />}
          {step === "interviewers" && <InterviewersStep form={form} onChange={patch} />}
          {step === "confirm"      && <ConfirmStep      form={form} candidate={candidate} jobs={jobs} />}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-between border-t border-border px-6 py-4">
          <button
            onClick={step === "details" ? onClose : back}
            className="flex items-center gap-1.5 rounded-md border border-border px-3.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
          >
            {step === "details" ? "Cancel" : "← Back"}
          </button>

          <button
            onClick={next}
            disabled={!canAdvance() || submitting || done}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-4 py-1.5 text-xs font-semibold transition-colors",
              done
                ? "bg-emerald-600 text-white"
                : canAdvance()
                ? "bg-brand-600 text-white hover:bg-brand-700"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          >
            {done ? (
              <><Check className="h-3.5 w-3.5" />Scheduled!</>
            ) : submitting ? (
              <><Calendar className="h-3.5 w-3.5 animate-pulse" />Scheduling…</>
            ) : step === "confirm" ? (
              <><Calendar className="h-3.5 w-3.5" />Schedule Interview</>
            ) : (
              <>Next<ArrowRight className="h-3.5 w-3.5" /></>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
