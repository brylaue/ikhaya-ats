"use client";

/**
 * FeatureGate — conditionally renders children based on the agency's plan.
 *
 * Usage:
 *   <FeatureGate feature="ai_match_scoring">
 *     <AIMatchPanel />
 *   </FeatureGate>
 *
 *   <FeatureGate feature="workflow_automation" fallback={<UpgradeCTA />}>
 *     <AutomationBuilder />
 *   </FeatureGate>
 */

import React from "react";
import { Lock, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFeatureFlag } from "@/lib/supabase/hooks";
import { FEATURES, type FeatureKey } from "@/lib/feature-flags";

const PLAN_COLORS: Record<string, { badge: string; cta: string }> = {
  starter:    { badge: "bg-slate-100 text-slate-700 border-slate-200",    cta: "bg-slate-700 hover:bg-slate-800"    },
  growth:     { badge: "bg-brand-100 text-brand-700 border-brand-200",       cta: "bg-brand-600 hover:bg-brand-700"       },
  pro:        { badge: "bg-indigo-100 text-indigo-700 border-indigo-200", cta: "bg-indigo-600 hover:bg-indigo-700"   },
  enterprise: { badge: "bg-purple-100 text-purple-700 border-purple-200", cta: "bg-purple-600 hover:bg-purple-700"   },
};

interface FeatureGateProps {
  feature:   FeatureKey;
  children?: React.ReactNode;
  /**
   * Custom fallback. If omitted, renders a default locked-feature card.
   */
  fallback?: React.ReactNode;
  /**
   * Show nothing while loading (instead of fallback).
   */
  hideWhileLoading?: boolean;
  /**
   * Override the upgrade message shown in the default locked card.
   */
  upgradeNote?: string;
  /**
   * Additional className for the locked card wrapper.
   */
  className?: string;
}

export function FeatureGate({
  feature,
  children,
  fallback,
  hideWhileLoading,
  upgradeNote,
  className,
}: FeatureGateProps) {
  const { enabled, loading } = useFeatureFlag(feature);

  if (loading) {
    return hideWhileLoading ? null : <>{children ?? null}</>;
  }

  if (enabled) return <>{children ?? null}</>;

  if (fallback !== undefined) return <>{fallback}</>;

  const def    = FEATURES[feature];
  const plan   = def?.minPlan ?? "pro";
  const colors = PLAN_COLORS[plan] ?? PLAN_COLORS.pro;
  const note   = upgradeNote ?? def?.upgradeNote ?? `Upgrade to ${plan} to unlock this feature`;

  return (
    <div className={cn(
      "flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-10 text-center",
      className
    )}>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Lock className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{def?.label ?? feature}</p>
        <p className="text-xs text-muted-foreground max-w-xs">{def?.description}</p>
      </div>
      <span className={cn(
        "rounded-full border px-3 py-0.5 text-[11px] font-semibold capitalize",
        colors.badge
      )}>
        {plan} plan
      </span>
      <button
        onClick={() => window.open("/settings/billing", "_self")}
        className={cn(
          "flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white transition-colors",
          colors.cta
        )}
      >
        <Sparkles className="h-3.5 w-3.5" />
        {note}
      </button>
    </div>
  );
}

/**
 * useGate — inline version for conditional rendering without JSX gate wrapper.
 *
 * const { enabled, loading } = useGate("ai_match_scoring");
 */
export { useFeatureFlag as useGate } from "@/lib/supabase/hooks";
