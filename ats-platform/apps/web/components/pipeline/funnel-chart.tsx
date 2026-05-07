"use client";

import { useMemo } from "react";
import type { PipelineStage, Application } from "@/types";
import { cn } from "@/lib/utils";
import { TrendingDown, Clock, Users } from "lucide-react";

interface FunnelStageData {
  stage: PipelineStage;
  count: number;
  conversionRate: number;   // % from previous stage
  dropOffRate: number;      // % lost vs previous
  avgDays: number;
  width: number;            // visual width %
}

interface FunnelChartProps {
  stages: PipelineStage[];
  applications: Application[];
  className?: string;
}

const STAGE_COLORS: Record<string, string> = {
  sourced:       "bg-slate-400",
  screened:      "bg-brand-500",
  submitted:     "bg-violet-500",
  client_review: "bg-amber-500",
  interview:     "bg-emerald-500",
  offer:         "bg-cyan-500",
  placed:        "bg-teal-500",
  rejected:      "bg-red-400",
  custom:        "bg-brand-500",
};

const STAGE_TEXT_COLORS: Record<string, string> = {
  sourced:       "text-slate-600",
  screened:      "text-brand-600",
  submitted:     "text-violet-600",
  client_review: "text-amber-600",
  interview:     "text-emerald-600",
  offer:         "text-cyan-600",
  placed:        "text-teal-600",
  rejected:      "text-red-500",
  custom:        "text-brand-600",
};

const STAGE_BG_LIGHT: Record<string, string> = {
  sourced:       "bg-slate-50",
  screened:      "bg-brand-50",
  submitted:     "bg-violet-50",
  client_review: "bg-amber-50",
  interview:     "bg-emerald-50",
  offer:         "bg-cyan-50",
  placed:        "bg-teal-50",
  rejected:      "bg-red-50",
  custom:        "bg-brand-50",
};

export function FunnelChart({ stages, applications, className }: FunnelChartProps) {
  const funnelData = useMemo<FunnelStageData[]>(() => {
    const appsByStage: Record<string, Application[]> = {};
    stages.forEach((s) => (appsByStage[s.id] = []));
    applications.forEach((a) => {
      if (appsByStage[a.stageId]) appsByStage[a.stageId].push(a);
    });

    // Exclude rejected/placed from funnel flow
    const funnelStages = stages.filter((s) => s.type !== "rejected");
    const maxCount = Math.max(...funnelStages.map((s) => appsByStage[s.id]?.length ?? 0), 1);

    return funnelStages.map((stage, i) => {
      const count = appsByStage[stage.id]?.length ?? 0;
      const prevCount = i > 0 ? (appsByStage[funnelStages[i - 1].id]?.length ?? 0) : count;
      const conversionRate = prevCount > 0 ? Math.round((count / prevCount) * 100) : 100;
      const dropOffRate = 100 - conversionRate;
      const apps = appsByStage[stage.id] ?? [];
      const avgDays = apps.length
        ? Math.round(apps.reduce((s, a) => s + a.daysInStage, 0) / apps.length)
        : 0;

      return {
        stage,
        count,
        conversionRate,
        dropOffRate,
        avgDays,
        width: maxCount > 0 ? Math.max((count / maxCount) * 100, 8) : 8,
      };
    });
  }, [stages, applications]);

  const totalIn  = funnelData[0]?.count ?? 0;
  const totalOut = funnelData[funnelData.length - 1]?.count ?? 0;
  const overallConversion = totalIn > 0 ? ((totalOut / totalIn) * 100).toFixed(1) : "0";

  return (
    <div className={cn("space-y-1", className)}>
      {/* Header stats */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <p className="text-2xl font-bold text-foreground">{totalIn}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Total entered</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <p className="text-2xl font-bold text-foreground">{overallConversion}%</p>
          <p className="mt-0.5 text-xs text-muted-foreground">End-to-end conversion</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 text-center">
          <p className="text-2xl font-bold text-foreground">
            {Math.round(funnelData.reduce((s, d) => s + d.avgDays, 0))}d
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">Avg total time</p>
        </div>
      </div>

      {/* Funnel rows */}
      {funnelData.map((d, i) => {
        const colorBar  = STAGE_COLORS[d.stage.type] ?? STAGE_COLORS.custom;
        const colorText = STAGE_TEXT_COLORS[d.stage.type] ?? STAGE_TEXT_COLORS.custom;
        const colorBg   = STAGE_BG_LIGHT[d.stage.type] ?? STAGE_BG_LIGHT.custom;
        const isLast    = i === funnelData.length - 1;

        return (
          <div key={d.stage.id} className="group">
            {/* Stage row */}
            <div className="flex items-center gap-3">
              {/* Stage name + count */}
              <div className="w-36 shrink-0 text-right">
                <p className="text-xs font-semibold text-foreground truncate">{d.stage.name}</p>
                <p className={cn("text-xs font-bold", colorText)}>{d.count} candidates</p>
              </div>

              {/* Bar */}
              <div className="relative flex-1">
                <div
                  className={cn(
                    "h-9 rounded-md transition-all duration-500",
                    colorBg,
                    "border border-border overflow-hidden"
                  )}
                  style={{ width: `${d.width}%` }}
                >
                  <div className={cn("h-full w-1.5 shrink-0", colorBar)} />
                  <div className="absolute inset-0 flex items-center px-3 pl-4">
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {d.count > 0 && (
                        <>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {d.avgDays}d avg
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {d.count}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Conversion from previous */}
              <div className="w-20 shrink-0 text-right">
                {i > 0 ? (
                  <div className="inline-flex flex-col items-end">
                    <span
                      className={cn(
                        "text-xs font-semibold",
                        d.conversionRate >= 70 ? "text-emerald-600" :
                        d.conversionRate >= 40 ? "text-amber-600" :
                                                  "text-red-500"
                      )}
                    >
                      {d.conversionRate}%
                    </span>
                    <span className="text-[10px] text-muted-foreground">converted</span>
                  </div>
                ) : (
                  <span className="text-[10px] text-muted-foreground">start</span>
                )}
              </div>
            </div>

            {/* Drop-off indicator between stages */}
            {!isLast && d.dropOffRate > 0 && (
              <div className="my-0.5 flex items-center gap-3">
                <div className="w-36 shrink-0" />
                <div className="flex flex-1 items-center gap-1.5 pl-4">
                  <TrendingDown className="h-3 w-3 text-red-400" />
                  <span className="text-[10px] text-red-400 font-medium">
                    {d.dropOffRate}% drop-off ({Math.round((d.dropOffRate / 100) * d.count)} lost)
                  </span>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Clickable stage detail hint */}
      <p className="pt-2 text-center text-[10px] text-muted-foreground">
        Click any stage in the pipeline board to see candidates at that step
      </p>
    </div>
  );
}
