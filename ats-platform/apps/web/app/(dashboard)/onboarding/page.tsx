"use client";

/**
 * /onboarding — US-477: Agency Onboarding Wizard
 *
 * 4-step setup: Agency Profile → Invite Team → CAN-SPAM Address → Get Started.
 * Each step persists to the DB before advancing so partial completion is safe.
 */

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Building2, Users, MapPin, ArrowRight, Check, Loader2,
  Plus, X, Mail, Sparkles, Upload,
} from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// ─── Steps ────────────────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: "Agency Profile", icon: Building2 },
  { id: 2, label: "Invite Team",    icon: Users      },
  { id: 3, label: "Email Setup",    icon: Mail       },
  { id: 4, label: "You're Ready",   icon: Sparkles   },
] as const;

type StepId = typeof STEPS[number]["id"];

// ─── Role options ─────────────────────────────────────────────────────────────

const ROLES = [
  { value: "admin",            label: "Admin"         },
  { value: "senior_recruiter", label: "Sr. Recruiter" },
  { value: "recruiter",        label: "Recruiter"     },
  { value: "viewer",           label: "Viewer"        },
];

// ─── Step 1: Agency Profile ───────────────────────────────────────────────────

function StepAgencyProfile({
  onNext,
}: {
  onNext: (data: { agencyName: string; website: string }) => Promise<void>;
}) {
  const [agencyName, setAgencyName] = useState("");
  const [website,    setWebsite]    = useState("");
  const [saving,     setSaving]     = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!agencyName.trim()) { toast.error("Agency name is required"); return; }
    setSaving(true);
    try {
      await onNext({ agencyName: agencyName.trim(), website: website.trim() });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-foreground">Set up your agency</h2>
        <p className="text-sm text-muted-foreground mt-1">This takes about 2 minutes.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Agency Name <span className="text-red-500">*</span></label>
        <input
          value={agencyName}
          onChange={e => setAgencyName(e.target.value)}
          placeholder="e.g. Acme Search Partners"
          autoFocus
          className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Website <span className="text-muted-foreground font-normal">(optional)</span></label>
        <input
          value={website}
          onChange={e => setWebsite(e.target.value)}
          placeholder="https://acmesearch.com"
          type="url"
          className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      <button
        type="submit"
        disabled={saving || !agencyName.trim()}
        className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
        {saving ? "Saving…" : "Continue"}
      </button>
    </form>
  );
}

// ─── Step 2: Invite Team ──────────────────────────────────────────────────────

function StepInviteTeam({
  onNext,
  onSkip,
}: {
  onNext: (invites: Array<{ email: string; role: string }>) => Promise<void>;
  onSkip: () => void;
}) {
  const [rows,   setRows]   = useState([{ email: "", role: "recruiter" }]);
  const [saving, setSaving] = useState(false);

  function addRow() { setRows(r => [...r, { email: "", role: "recruiter" }]); }
  function removeRow(i: number) { setRows(r => r.filter((_, idx) => idx !== i)); }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const valid = rows.filter(r => r.email.trim() && r.email.includes("@"));
    if (valid.length === 0) { toast.error("Add at least one valid email"); return; }
    setSaving(true);
    try {
      await onNext(valid);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSend} className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-foreground">Invite your team</h2>
        <p className="text-sm text-muted-foreground mt-1">You can always invite more later.</p>
      </div>

      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="flex gap-2">
            <input
              type="email"
              value={row.email}
              onChange={e => setRows(rows.map((r, idx) => idx === i ? { ...r, email: e.target.value } : r))}
              placeholder="colleague@agency.com"
              className="flex-1 px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <select
              value={row.role}
              onChange={e => setRows(rows.map((r, idx) => idx === i ? { ...r, role: e.target.value } : r))}
              className="px-2 py-2 border border-border rounded-lg text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            {rows.length > 1 && (
              <button type="button" onClick={() => removeRow(i)} className="px-2 text-muted-foreground/60 hover:text-red-500">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
        <button type="button" onClick={addRow} className="flex items-center gap-1 text-sm text-brand-600 hover:underline">
          <Plus className="h-3.5 w-3.5" /> Add another
        </button>
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
          {saving ? "Sending…" : "Send Invitations"}
        </button>
        <button type="button" onClick={onSkip} className="text-sm text-muted-foreground hover:text-foreground px-3 whitespace-nowrap">
          Skip →
        </button>
      </div>
    </form>
  );
}

// ─── Step 3: Email / CAN-SPAM Setup ──────────────────────────────────────────

function StepEmailSetup({
  onNext,
  onSkip,
}: {
  onNext: (data: { canSpamAddress: string }) => Promise<void>;
  onSkip: () => void;
}) {
  const [address, setAddress] = useState("");
  const [saving,  setSaving]  = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!address.trim()) { onSkip(); return; }
    setSaving(true);
    try {
      await onNext({ canSpamAddress: address.trim() });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-foreground">CAN-SPAM physical address</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Required by law to appear in every outreach email footer. You can update this later in Settings → Agency Profile.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Business Address</label>
        <textarea
          value={address}
          onChange={e => setAddress(e.target.value)}
          placeholder={"123 Main St\nSuite 400\nNew York, NY 10001"}
          rows={3}
          className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
        />
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          {saving ? "Saving…" : "Continue"}
        </button>
        <button type="button" onClick={onSkip} className="text-sm text-muted-foreground hover:text-foreground px-3 whitespace-nowrap">
          Skip →
        </button>
      </div>
    </form>
  );
}

// ─── Step 4: Done ─────────────────────────────────────────────────────────────

function StepDone({ agencyName, onFinish }: { agencyName: string; onFinish: () => void }) {
  return (
    <div className="space-y-6 text-center">
      <div className="flex justify-center">
        <div className="rounded-full bg-emerald-100 p-5">
          <Check className="h-10 w-10 text-emerald-600" />
        </div>
      </div>
      <div>
        <h2 className="text-xl font-bold text-foreground">You're all set, {agencyName}!</h2>
        <p className="text-sm text-muted-foreground mt-2">
          Your workspace is ready. Import candidates, post jobs, or start building your pipeline.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 text-left">
        {[
          { icon: Users,     label: "Add candidates", href: "/candidates" },
          { icon: Building2, label: "Post a job",      href: "/jobs/new"   },
          { icon: Upload,    label: "Import CSV",      href: "/candidates" },
        ].map(({ icon: Icon, label, href }) => (
          <a
            key={label}
            href={href}
            className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-4 text-center text-xs font-medium text-foreground hover:bg-accent transition-colors"
          >
            <Icon className="h-5 w-5 text-brand-600" />
            {label}
          </a>
        ))}
      </div>

      <button
        onClick={onFinish}
        className="w-full bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2.5 rounded-lg transition-colors"
      >
        Go to Dashboard →
      </button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();
  const [step,       setStep]       = useState<StepId>(1);
  const [agencyName, setAgencyName] = useState("");

  // ── Step 1: save agency name + website ──────────────────────────────────────
  async function handleAgencyProfile(data: { agencyName: string; website: string }) {
    const res = await fetch("/api/settings/agency-profile", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json", "x-csrf-token": "1" },
      body:    JSON.stringify({ name: data.agencyName, website: data.website }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? "Failed to save agency profile");
    }
    setAgencyName(data.agencyName);
    setStep(2);
  }

  // ── Step 2: send team invites ────────────────────────────────────────────────
  async function handleInvites(invites: Array<{ email: string; role: string }>) {
    const results = await Promise.allSettled(
      invites.map(inv =>
        fetch("/api/invite", {
          method:  "POST",
          headers: { "Content-Type": "application/json", "x-csrf-token": "1" },
          body:    JSON.stringify({ email: inv.email, role: inv.role }),
        })
      )
    );
    const succeeded = results.filter(r => r.status === "fulfilled").length;
    const failed    = results.length - succeeded;
    if (succeeded > 0) toast.success(`${succeeded} invitation${succeeded > 1 ? "s" : ""} sent!`);
    if (failed > 0)    toast.error(`${failed} invite${failed > 1 ? "s" : ""} failed — check email addresses.`);
    setStep(3);
  }

  // ── Step 3: save CAN-SPAM address ───────────────────────────────────────────
  async function handleEmailSetup(data: { canSpamAddress: string }) {
    await fetch("/api/settings/agency-profile", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json", "x-csrf-token": "1" },
      body:    JSON.stringify({ can_spam_address: data.canSpamAddress }),
    });
    setStep(4);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-brand-50 flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        {/* Logo / brand */}
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-brand-600 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold text-foreground">Ikhaya ATS</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((s, i) => {
            const done    = s.id < step;
            const current = s.id === step;
            return (
              <div key={s.id} className="flex items-center gap-2">
                <div className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all",
                  done    ? "bg-emerald-500 text-white" :
                  current ? "bg-brand-600 text-white ring-4 ring-brand-100" :
                            "bg-muted text-muted-foreground"
                )}>
                  {done ? <Check className="h-3.5 w-3.5" /> : s.id}
                </div>
                <span className={cn("text-xs font-medium hidden sm:block", current ? "text-foreground" : "text-muted-foreground/60")}>
                  {s.label}
                </span>
                {i < STEPS.length - 1 && (
                  <div className={cn("w-6 h-px mx-1", done ? "bg-emerald-400" : "bg-border")} />
                )}
              </div>
            );
          })}
        </div>

        {/* Card */}
        <div className="bg-card rounded-2xl shadow-sm border border-border p-8">
          {step === 1 && (
            <StepAgencyProfile onNext={handleAgencyProfile} />
          )}
          {step === 2 && (
            <StepInviteTeam
              onNext={handleInvites}
              onSkip={() => setStep(3)}
            />
          )}
          {step === 3 && (
            <StepEmailSetup
              onNext={handleEmailSetup}
              onSkip={() => setStep(4)}
            />
          )}
          {step === 4 && (
            <StepDone
              agencyName={agencyName || "your agency"}
              onFinish={() => router.push("/dashboard")}
            />
          )}
        </div>

        {step > 1 && step < 4 && (
          <button
            onClick={() => setStep(s => (s - 1) as StepId)}
            className="mt-4 text-sm text-muted-foreground/60 hover:text-muted-foreground mx-auto block"
          >
            ← Back
          </button>
        )}
      </div>
    </div>
  );
}
