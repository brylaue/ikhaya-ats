"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Zap, Users, Upload, Briefcase, Send, Check, ChevronRight,
  X, ArrowRight, Sparkles, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Step {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  iconBg: string;
  cta: string;
  href?: string;
  action?: () => void;
  estimatedMins: number;
}

// ─── Step Card ────────────────────────────────────────────────────────────────

function StepCard({
  step,
  index,
  isComplete,
  isCurrent,
  onComplete,
}: {
  step: Step;
  index: number;
  isComplete: boolean;
  isCurrent: boolean;
  onComplete: () => void;
}) {
  const Icon = step.icon;

  return (
    <div
      className={cn(
        "flex items-start gap-4 rounded-xl border p-4 transition-all",
        isComplete
          ? "border-emerald-200 bg-emerald-50/50 opacity-75"
          : isCurrent
          ? "border-brand-200 bg-brand-50/50 shadow-sm"
          : "border-border bg-card opacity-60"
      )}
    >
      {/* Step number / check */}
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold",
          isComplete
            ? "bg-emerald-500 text-white"
            : isCurrent
            ? "bg-brand-600 text-white"
            : "bg-muted text-muted-foreground"
        )}
      >
        {isComplete ? <Check className="h-4 w-4" /> : index + 1}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={cn("text-sm font-semibold", isComplete ? "text-emerald-700 line-through" : isCurrent ? "text-foreground" : "text-muted-foreground")}>
            {step.title}
          </p>
          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
            <Clock className="h-3 w-3" />~{step.estimatedMins} min
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{step.description}</p>

        {isCurrent && !isComplete && (
          <div className="mt-3 flex gap-2">
            {step.href ? (
              <Link
                href={step.href}
                className="flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
              >
                {step.cta}<ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : (
              <button
                onClick={step.action}
                className="flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
              >
                {step.cta}<ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={onComplete}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
            >
              Mark done
            </button>
          </div>
        )}
      </div>

      {/* Icon badge */}
      <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", step.iconBg)}>
        <Icon className="h-4 w-4 text-white" />
      </div>
    </div>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ completed, total }: { completed: number; total: number }) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-xs font-medium text-muted-foreground">{completed} of {total} steps complete</p>
        <p className="text-xs font-bold text-foreground">{pct}%</p>
      </div>
      <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
        <div
          className="h-full rounded-full bg-brand-600 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

interface OnboardingModalProps {
  onDismiss: () => void;
}

export function OnboardingModal({ onDismiss }: OnboardingModalProps) {
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());

  const STEPS: Step[] = [
    {
      id: "org",
      title: "Set up your agency profile",
      description: "Add your agency name, logo, and portal subdomain so clients see your brand.",
      icon: Zap,
      iconBg: "bg-brand-600",
      cta: "Go to Settings",
      href: "/settings",
      estimatedMins: 2,
    },
    {
      id: "team",
      title: "Invite your team",
      description: "Add your recruiters and researchers so everyone is working from one platform.",
      icon: Users,
      iconBg: "bg-brand-600",
      cta: "Invite teammates",
      href: "/settings?section=users",
      estimatedMins: 3,
    },
    {
      id: "candidates",
      title: "Import your candidate database",
      description: "Upload a CSV or connect LinkedIn Recruiter to bring your existing network in.",
      icon: Upload,
      iconBg: "bg-violet-600",
      cta: "Import candidates",
      href: "/candidates",
      estimatedMins: 5,
    },
    {
      id: "job",
      title: "Create your first search",
      description: "Add the role you're currently working on and configure the pipeline stages.",
      icon: Briefcase,
      iconBg: "bg-emerald-600",
      cta: "Create a job",
      href: "/jobs",
      estimatedMins: 3,
    },
    {
      id: "submit",
      title: "Submit a candidate to a client",
      description: "Share a candidate via the client portal — they'll get a branded review experience.",
      icon: Send,
      iconBg: "bg-amber-600",
      cta: "View pipelines",
      href: "/pipeline",
      estimatedMins: 5,
    },
  ];

  const currentIndex  = STEPS.findIndex((s) => !completedSteps.has(s.id));
  const allComplete   = completedSteps.size === STEPS.length;

  function markComplete(id: string) {
    setCompletedSteps((prev) => new Set([...prev, id]));
  }

  function handleDismiss() {
    if (!allComplete) {
      toast("You can reopen setup from the ? button in the sidebar");
    }
    onDismiss();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleDismiss} />

      <div className="relative z-10 flex w-full max-w-lg flex-col rounded-2xl border border-border bg-card shadow-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="shrink-0 px-6 pt-6 pb-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 shadow-sm">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-base font-bold text-foreground">Get started with Ikhaya</h2>
                <p className="text-xs text-muted-foreground">Your first placement in under 20 minutes</p>
              </div>
            </div>
            <button onClick={handleDismiss} className="text-muted-foreground hover:text-foreground transition-colors mt-0.5">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4">
            <ProgressBar completed={completedSteps.size} total={STEPS.length} />
          </div>
        </div>

        {/* Steps */}
        <div className="flex-1 overflow-y-auto px-6 pb-2 space-y-2">
          {allComplete ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 mb-4">
                <Check className="h-8 w-8 text-emerald-600" />
              </div>
              <h3 className="text-lg font-bold text-foreground">You're all set! 🎉</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Your agency is ready to go. Now let's make some placements.
              </p>
              <Link
                href="/pipeline"
                onClick={onDismiss}
                className="mt-4 flex items-center gap-1.5 rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
              >
                Go to Pipeline <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            STEPS.map((step, i) => (
              <StepCard
                key={step.id}
                step={step}
                index={i}
                isComplete={completedSteps.has(step.id)}
                isCurrent={i === currentIndex}
                onComplete={() => markComplete(step.id)}
              />
            ))
          )}
        </div>

        {/* Footer */}
        {!allComplete && (
          <div className="shrink-0 border-t border-border px-6 py-3 flex items-center justify-between">
            <button onClick={handleDismiss} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              I'll do this later
            </button>
            <p className="text-[10px] text-muted-foreground">
              Step {Math.min(currentIndex + 1, STEPS.length)} of {STEPS.length}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
