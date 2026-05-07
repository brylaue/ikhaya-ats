"use client";

import { Sparkles, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Score ring ───────────────────────────────────────────────────────────────

export function AiScoreRing({
  score,
  size = "md",
}: {
  score: number;
  size?: "sm" | "md" | "lg";
}) {
  const dim  = size === "sm" ? 36 : size === "lg" ? 64 : 48;
  const r    = (dim / 2) - 4;
  const circ = 2 * Math.PI * r;
  const pct  = score / 100;
  const color = score >= 80 ? "#10b981" : score >= 60 ? "#6366f1" : score >= 40 ? "#f59e0b" : "#f87171";
  const fontSize = size === "sm" ? 9 : size === "lg" ? 16 : 12;

  return (
    <svg width={dim} height={dim} viewBox={`0 0 ${dim} ${dim}`} className="shrink-0">
      <circle
        cx={dim / 2} cy={dim / 2} r={r}
        fill="none" stroke="currentColor" strokeWidth="3"
        className="text-muted/20"
      />
      <circle
        cx={dim / 2} cy={dim / 2} r={r}
        fill="none" stroke={color} strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={`${circ * pct} ${circ * (1 - pct)}`}
        transform={`rotate(-90 ${dim / 2} ${dim / 2})`}
      />
      <text
        x={dim / 2} y={dim / 2 + fontSize * 0.4}
        textAnchor="middle"
        fontSize={fontSize}
        fontWeight="700"
        fill={color}
      >
        {Math.round(score)}
      </text>
    </svg>
  );
}

// ─── Inline badge (for lists / cards) ────────────────────────────────────────

interface AiMatchBadgeProps {
  score?:      number;
  loading?:    boolean;
  generating?: boolean;
  onRequest?:  () => void;
  showLabel?:  boolean;
  className?:  string;
}

export function AiMatchBadge({
  score,
  loading,
  generating,
  onRequest,
  showLabel = false,
  className,
}: AiMatchBadgeProps) {
  const color =
    score === undefined ? "text-muted-foreground"
    : score >= 80 ? "text-emerald-600"
    : score >= 60 ? "text-violet-600"
    : score >= 40 ? "text-amber-600"
    : "text-rose-500";

  const bg =
    score === undefined ? "bg-muted"
    : score >= 80 ? "bg-emerald-100"
    : score >= 60 ? "bg-violet-100"
    : score >= 40 ? "bg-amber-100"
    : "bg-rose-100";

  if (loading || generating) {
    return (
      <div className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] bg-muted text-muted-foreground", className)}>
        <Loader2 className="h-3 w-3 animate-spin" />
        {generating ? "Scoring…" : "Loading…"}
      </div>
    );
  }

  if (score === undefined) {
    return onRequest ? (
      <button
        onClick={onRequest}
        title="Generate AI match score"
        className={cn(
          "flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground hover:bg-violet-100 hover:text-violet-600 transition-colors",
          className
        )}
      >
        <Sparkles className="h-3 w-3" />
        Score
      </button>
    ) : null;
  }

  return (
    <div className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold", bg, color, className)}>
      <Sparkles className="h-3 w-3" />
      {score}%
      {showLabel && (
        <span className="font-normal opacity-75">
          {score >= 80 ? "Excellent" : score >= 60 ? "Good" : score >= 40 ? "Fair" : "Low"}
        </span>
      )}
      {onRequest && (
        <button
          onClick={onRequest}
          title="Refresh score"
          className="ml-0.5 hover:opacity-75 transition-opacity"
        >
          <RefreshCw className="h-2.5 w-2.5" />
        </button>
      )}
    </div>
  );
}
