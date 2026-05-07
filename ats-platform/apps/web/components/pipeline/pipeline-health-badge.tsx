"use client";

/**
 * PipelineHealthBadge — shows a color-coded health score for a job.
 * PipelineHealthPanel  — at-risk requisitions panel for the dashboard.
 */

import Link from "next/link";
import { AlertTriangle, CheckCircle2, XCircle, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePipelineHealth, type JobHealthScore } from "@/lib/supabase/hooks";

// ── Badge ─────────────────────────────────────────────────────────────────────

const TIER_CFG = {
  healthy:  { color: "text-emerald-700",  bg: "bg-emerald-100",  border: "border-emerald-200", icon: CheckCircle2  },
  at_risk:  { color: "text-amber-700",    bg: "bg-amber-100",    border: "border-amber-200",   icon: AlertTriangle },
  critical: { color: "text-red-700",      bg: "bg-red-100",      border: "border-red-200",     icon: XCircle       },
} as const;

interface BadgeProps {
  score: number;
  tier:  JobHealthScore["tier"];
  size?: "sm" | "md";
}

export function PipelineHealthBadge({ score, tier, size = "sm" }: BadgeProps) {
  const cfg  = TIER_CFG[tier];
  const Icon = cfg.icon;
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full border font-semibold",
      cfg.bg, cfg.border, cfg.color,
      size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs"
    )}>
      <Icon className={size === "sm" ? "h-2.5 w-2.5" : "h-3.5 w-3.5"} />
      {score}
    </span>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export function PipelineHealthPanel() {
  const { atRisk, critical, loading } = usePipelineHealth();

  if (loading) return null;
  if (atRisk.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-amber-600" />
        <p className="text-sm font-semibold text-amber-900">
          {critical.length > 0
            ? `${critical.length} critical req${critical.length > 1 ? "s" : ""} need attention`
            : `${atRisk.length} at-risk req${atRisk.length > 1 ? "s" : ""}`}
        </p>
      </div>
      <div className="space-y-2">
        {atRisk.slice(0, 5).map((s) => {
          const cfg  = TIER_CFG[s.tier];
          const Icon = cfg.icon;
          return (
            <Link
              key={s.jobId}
              href={`/jobs/${s.jobId}`}
              className="flex items-start gap-3 rounded-lg border border-amber-100 bg-card p-2.5 hover:bg-amber-50/60 transition-colors"
            >
              <div className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full mt-0.5", cfg.bg)}>
                <Icon className={cn("h-3 w-3", cfg.color)} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">{s.jobTitle}</p>
                <p className="text-[10px] text-muted-foreground truncate">{s.companyName}</p>
                {s.signals[0] && (
                  <p className="text-[10px] text-amber-700 mt-0.5">{s.signals[0]}</p>
                )}
              </div>
              <PipelineHealthBadge score={s.score} tier={s.tier} />
            </Link>
          );
        })}
      </div>
      {atRisk.length > 5 && (
        <Link href="/jobs" className="block text-center text-[11px] text-amber-700 hover:text-amber-900 font-medium">
          +{atRisk.length - 5} more at-risk reqs →
        </Link>
      )}
    </div>
  );
}
