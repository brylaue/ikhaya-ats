"use client";

import { useState } from "react";
import {
  X, Briefcase, DollarSign, Users, Kanban,
  ChevronRight, ChevronLeft, Check, MapPin, Globe, Shield,
} from "lucide-react";
import { useCompanies } from "@/lib/supabase/hooks";
import { ChecklistConfigPanel } from "@/components/pipeline/submission-readiness-panel";
import { cn } from "@/lib/utils";
import type { Job, PipelineStage } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface NewJobForm {
  title: string;
  clientId: string;
  ownerId: string;
  location: string;
  remote: "onsite" | "hybrid" | "remote" | "flexible";
  priority: Job["priority"];
  status: Job["status"];
  salaryMin: string;
  salaryMax: string;
  currency: string;
  estimatedFee: string;
  feeProbability: string;
  description: string;
  pipeline: Array<{ name: string; type: PipelineStage["type"]; color: string }>;
}

const DEFAULT_PIPELINE = [
  { name: "Sourced",       type: "sourced"       as const, color: "#94a3b8" },
  { name: "Screened",      type: "screened"      as const, color: "#60a5fa" },
  { name: "Submitted",     type: "submitted"     as const, color: "#818cf8" },
  { name: "Client Review", type: "client_review" as const, color: "#a78bfa" },
  { name: "Interview",     type: "interview"     as const, color: "#34d399" },
  { name: "Offer",         type: "offer"         as const, color: "#fbbf24" },
  { name: "Placed",        type: "placed"        as const, color: "#10b981" },
];

// ─── Step indicators ──────────────────────────────────────────────────────────

const STEPS = [
  { id: "role",      label: "Role",      icon: Briefcase },
  { id: "comp",      label: "Comp",      icon: DollarSign },
  { id: "team",      label: "Team",      icon: Users },
  { id: "pipeline",  label: "Pipeline",  icon: Kanban },
  { id: "checklist", label: "Checklist", icon: Shield },
] as const;

type StepId = typeof STEPS[number]["id"];

function StepIndicator({ current, completed }: { current: number; completed: Set<number> }) {
  return (
    <div className="flex items-center gap-0">
      {STEPS.map((step, i) => {
        const Icon    = step.icon;
        const isDone  = completed.has(i);
        const isActive = i === current;
        return (
          <div key={step.id} className="flex items-center">
            <div className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors",
              isDone   ? "bg-emerald-500 text-white" :
              isActive ? "bg-brand-600 text-white" :
                         "bg-muted text-muted-foreground"
            )}>
              {isDone ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
            </div>
            <span className={cn(
              "ml-1.5 text-xs font-medium hidden sm:block",
              isActive ? "text-foreground" : "text-muted-foreground"
            )}>
              {step.label}
            </span>
            {i < STEPS.length - 1 && (
              <div className={cn("mx-2 h-px w-6 sm:w-10", isDone ? "bg-emerald-400" : "bg-border")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Field components ─────────────────────────────────────────────────────────

function Field({ label, required, children, hint }: { label: string; required?: boolean; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-foreground">
        {label}{required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-brand-500 transition-colors";
const selectCls = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500 transition-colors";

// ─── Step panels ──────────────────────────────────────────────────────────────

function RoleStep({ form, set, companies }: { form: NewJobForm; set: (p: Partial<NewJobForm>) => void; companies: { id: string; name: string }[] }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Role details</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Basic information about the position</p>
      </div>

      <Field label="Job title" required>
        <input
          autoFocus
          value={form.title}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => set({ title: e.target.value })}
          placeholder="e.g. VP of Engineering"
          className={inputCls}
        />
      </Field>

      <Field label="Client" required>
        <select value={form.clientId} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => set({ clientId: e.target.value })} className={selectCls}>
          <option value="">Select a client…</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Priority">
          <select value={form.priority} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => set({ priority: e.target.value as Job["priority"] })} className={selectCls}>
            {["urgent","high","medium","low"].map((p) => (
              <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select value={form.status} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => set({ status: e.target.value as Job["status"] })} className={selectCls}>
            <option value="active">Active</option>
            <option value="draft">Draft</option>
            <option value="on_hold">On Hold</option>
          </select>
        </Field>
      </div>

      <Field label="Location">
        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={form.location}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => set({ location: e.target.value })}
            placeholder="e.g. San Francisco, CA or Remote"
            className={cn(inputCls, "pl-9")}
          />
        </div>
      </Field>

      <Field label="Work arrangement">
        <div className="grid grid-cols-4 gap-2">
          {(["onsite","hybrid","remote","flexible"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => set({ remote: r })}
              className={cn(
                "flex items-center justify-center gap-1 rounded-lg border py-2 text-xs font-medium capitalize transition-colors",
                form.remote === r
                  ? "border-brand-300 bg-brand-50 text-brand-700"
                  : "border-border text-muted-foreground hover:bg-accent"
              )}
            >
              {r === "remote" || r === "flexible" ? <Globe className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
              {r}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Job description" hint="Optional — visible to candidates">
        <textarea
          value={form.description}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => set({ description: e.target.value })}
          rows={3}
          placeholder="Brief overview of the role, team, and ideal background…"
          className={cn(inputCls, "resize-none")}
        />
      </Field>
    </div>
  );
}

function CompStep({ form, set }: { form: NewJobForm; set: (p: Partial<NewJobForm>) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Compensation & fee</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Salary range and your agency's fee structure</p>
      </div>

      <Field label="Currency">
        <select value={form.currency} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => set({ currency: e.target.value })} className={selectCls}>
          {["USD","GBP","EUR","AUD","CAD","SGD"].map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Salary min">
          <div className="relative">
            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="number"
              value={form.salaryMin}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => set({ salaryMin: e.target.value })}
              placeholder="200000"
              className={cn(inputCls, "pl-9")}
            />
          </div>
        </Field>
        <Field label="Salary max">
          <div className="relative">
            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="number"
              value={form.salaryMax}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => set({ salaryMax: e.target.value })}
              placeholder="280000"
              className={cn(inputCls, "pl-9")}
            />
          </div>
        </Field>
      </div>

      <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
        <p className="text-xs font-semibold text-foreground">Agency fee</p>

        <Field label="Estimated fee" hint="Total fee if placed — used for revenue pipeline tracking">
          <div className="relative">
            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="number"
              value={form.estimatedFee}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => set({ estimatedFee: e.target.value })}
              placeholder="68000"
              className={cn(inputCls, "pl-9")}
            />
          </div>
        </Field>

        <Field label="Close probability" hint="Your confidence this search will result in a placement">
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={form.feeProbability}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => set({ feeProbability: e.target.value })}
              className="flex-1"
            />
            <span className={cn(
              "w-10 text-right text-sm font-bold",
              parseInt(form.feeProbability) >= 70 ? "text-emerald-600" :
              parseInt(form.feeProbability) >= 40 ? "text-amber-600" : "text-red-500"
            )}>
              {form.feeProbability}%
            </span>
          </div>
          {form.estimatedFee && (
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              Weighted value: <span className="font-semibold text-foreground">
                ${Math.round(parseInt(form.estimatedFee || "0") * parseInt(form.feeProbability) / 100).toLocaleString()}
              </span>
            </p>
          )}
        </Field>
      </div>
    </div>
  );
}

function TeamStep({ form, set }: { form: NewJobForm; set: (p: Partial<NewJobForm>) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Team assignment</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Assign this search to a recruiter</p>
      </div>

      <div className="space-y-2">
        {/* Team assignment — populated from auth context once multi-user is live */}
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-xl border border-brand-300 bg-brand-50 p-3 text-left"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-500 text-sm font-bold text-white">
            Me
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">You</p>
            <p className="text-xs text-muted-foreground">Admin</p>
          </div>
          <Check className="h-4 w-4 shrink-0 text-brand-600" />
        </button>
      </div>
    </div>
  );
}

function PipelineStep({ form, set }: { form: NewJobForm; set: (p: Partial<NewJobForm>) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Pipeline stages</h3>
        <p className="text-xs text-muted-foreground mt-0.5">These are your default stages — you can customise per-search</p>
      </div>

      <div className="rounded-xl border border-border bg-card divide-y divide-border">
        {form.pipeline.map((stage, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-2.5">
            <div className="h-3 w-3 shrink-0 rounded-full" style={{ background: stage.color }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">{stage.name}</p>
              <p className="text-[10px] text-muted-foreground capitalize">{stage.type.replace(/_/g, " ")}</p>
            </div>
            <span className="text-[10px] font-medium text-muted-foreground">Stage {i + 1}</span>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-muted-foreground text-center">
        Manage your default stages in <span className="font-medium text-foreground">Settings → Pipeline Stages</span>
      </p>
    </div>
  );
}

function ChecklistStep({ clientId }: { clientId: string }) {
  if (!clientId) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Submission checklist</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Select a client in Step 1 to configure their checklist</p>
        </div>
        <div className="flex items-center justify-center rounded-xl border border-dashed border-border py-10 text-muted-foreground">
          <p className="text-xs">No client selected</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Submission checklist</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Customise what your team must verify before submitting candidates to this client.
          These override your agency defaults for this client only.
        </p>
      </div>
      <ChecklistConfigPanel
        clientId={clientId}
        title="Client-specific requirements"
      />
      <p className="text-[10px] text-muted-foreground text-center">
        Agency-wide defaults still apply — add items here to extend or override them for this client.
      </p>
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

interface AddJobModalProps {
  onClose: () => void;
  onAdd: (data: { title: string; companyId: string; location: string; remotePolicy: string; salaryMin?: number; salaryMax?: number; feeType?: string; feePct?: number; priority: string; description: string; headcount?: number }) => Promise<void> | void;
}

export function AddJobModal({ onClose, onAdd }: AddJobModalProps) {
  const { companies } = useCompanies();
  const [step, setStep]             = useState(0);
  const [completed, setCompleted]   = useState<Set<number>>(new Set());
  const [form, setForm]             = useState<NewJobForm>({
    title: "",
    clientId: "",
    ownerId: "",
    location: "",
    remote: "hybrid",
    priority: "high",
    status: "active",
    salaryMin: "",
    salaryMax: "",
    currency: "USD",
    estimatedFee: "",
    feeProbability: "60",
    description: "",
    pipeline: DEFAULT_PIPELINE,
  });

  function set(patch: Partial<NewJobForm>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function canAdvance() {
    if (step === 0) return form.title.trim() !== "" && form.clientId !== "";
    return true;
  }

  function handleNext() {
    if (step < STEPS.length - 1) {
      setCompleted((prev) => new Set([...prev, step]));
      setStep((s) => s + 1);
    }
  }

  function handleBack() {
    setStep((s) => Math.max(0, s - 1));
  }

  async function handleSubmit() {
    setCompleted((prev) => new Set([...prev, step]));
    await onAdd({
      title:         form.title,
      companyId:     form.clientId,
      location:      form.location,
      remotePolicy:  form.remote,
      salaryMin:     form.salaryMin ? Number(form.salaryMin) : undefined,
      salaryMax:     form.salaryMax ? Number(form.salaryMax) : undefined,
      feeType:       "contingency",
      feePct:        form.estimatedFee ? Number(form.estimatedFee) : undefined,
      priority:      form.priority,
      description:   form.description,
      headcount:     1,
    });
    onClose();
  }

  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex w-full max-w-lg flex-col rounded-2xl border border-border bg-card shadow-2xl max-h-[90vh] overflow-hidden">

        {/* Header */}
        <div className="shrink-0 border-b border-border px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-foreground">New Search</h2>
            <button onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
          <StepIndicator current={step} completed={completed} />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 0 && <RoleStep form={form} set={set} companies={companies} />}
          {step === 1 && <CompStep form={form} set={set} />}
          {step === 2 && <TeamStep form={form} set={set} />}
          {step === 3 && <PipelineStep form={form} set={set} />}
          {step === 4 && <ChecklistStep clientId={form.clientId} />}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-between border-t border-border px-6 py-4">
          <button
            onClick={step === 0 ? onClose : handleBack}
            className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
          >
            {step > 0 && <ChevronLeft className="h-3.5 w-3.5" />}
            {step === 0 ? "Cancel" : "Back"}
          </button>

          <div className="flex items-center gap-1">
            {STEPS.map((_, i) => (
              <div key={i} className={cn("h-1.5 rounded-full transition-all", i === step ? "w-4 bg-brand-600" : i < step ? "w-1.5 bg-emerald-400" : "w-1.5 bg-muted")} />
            ))}
          </div>

          {isLast ? (
            <button
              onClick={handleSubmit}
              className="flex items-center gap-1.5 rounded-md bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
            >
              <Check className="h-3.5 w-3.5" />Create Search
            </button>
          ) : (
            <button
              onClick={handleNext}
              disabled={!canAdvance()}
              className="flex items-center gap-1 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-40 transition-colors"
            >
              Next<ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
