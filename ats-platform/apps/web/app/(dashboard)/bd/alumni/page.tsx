"use client";

/**
 * Alumni Signals Page — US-157: Alumni & Expansion Signals
 *
 * Surfaces placed candidates who have recently changed roles or
 * companies — warm re-engagement opportunities.
 */

import { useState } from "react";
import Link from "next/link";
import {
  TrendingUp, CheckCircle2, Briefcase, Building2, ArrowRight,
  ChevronLeft, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAlumniSignals, useFeatureFlag, type AlumniSignal } from "@/lib/supabase/hooks";
import { toast } from "sonner";
import { FeatureGate } from "@/components/ui/feature-gate";

const SIGNAL_CONFIG: Record<AlumniSignal["signalType"], { label: string; color: string; icon: React.ElementType }> = {
  role_change:     { label: "Role change",     color: "bg-blue-100 text-blue-700",    icon: Briefcase   },
  company_change:  { label: "Company change",  color: "bg-violet-100 text-violet-700", icon: Building2  },
  promotion:       { label: "Promotion",       color: "bg-emerald-100 text-emerald-700", icon: TrendingUp },
  left_company:    { label: "Left company",    color: "bg-amber-100 text-amber-700",   icon: ArrowRight  },
};

export default function AlumniSignalsPage() {
  // US-513: Alumni signals is part of BD — Pro tier.
  const { enabled: bdEnabled, loading: bdLoading } = useFeatureFlag("business_development");
  const { signals, loading, markActioned } = useAlumniSignals();
  const [noteMap, setNoteMap] = useState<Record<string, string>>({});

  async function handleAction(id: string) {
    await markActioned(id, noteMap[id] || undefined);
    toast.success("Signal actioned");
  }

  if (!bdLoading && !bdEnabled) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <FeatureGate feature="business_development" className="max-w-sm" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="space-y-6 p-8">
        <div className="flex items-center gap-4">
          <Link href="/bd" className="text-sm text-brand-600 hover:text-brand-700 font-medium">
            ← BD Pipeline
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Alumni Signals</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Placed candidates who recently moved — potential re-engagement or backfill opportunities
            </p>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />)}
          </div>
        ) : signals.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-12 text-center">
            <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-medium text-foreground mb-1">No new signals</p>
            <p className="text-xs text-muted-foreground">
              Alumni signals are detected nightly. You&apos;ve actioned all current signals.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {signals.map((signal) => {
              const cfg = SIGNAL_CONFIG[signal.signalType];
              const Icon = cfg.icon;
              return (
                <div key={signal.id} className="rounded-xl border border-border bg-card p-4 flex items-start gap-4">
                  <div className={cn("rounded-lg p-2 shrink-0", cfg.color.replace("text-", "text-").split(" ")[0])}>
                    <Icon className={cn("h-4 w-4", cfg.color.split(" ")[1])} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/candidates/${signal.candidateId}`}
                            className="text-sm font-semibold text-foreground hover:text-brand-600"
                          >
                            View candidate
                          </Link>
                          <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full", cfg.color)}>
                            {cfg.label}
                          </span>
                        </div>

                        {signal.originalTitle && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Was: <span className="text-foreground">{signal.originalTitle}</span>
                          </p>
                        )}
                        {(signal.newTitle || signal.newCompany) && (
                          <p className="text-xs text-muted-foreground">
                            Now:{" "}
                            <span className="text-foreground">
                              {[signal.newTitle, signal.newCompany].filter(Boolean).join(" @ ")}
                            </span>
                          </p>
                        )}
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Detected {new Date(signal.detectedAt).toLocaleDateString()}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <input
                          type="text"
                          value={noteMap[signal.id] ?? ""}
                          onChange={(e) => setNoteMap((m) => ({ ...m, [signal.id]: e.target.value }))}
                          placeholder="Action note (optional)"
                          className="text-xs px-2.5 py-1.5 border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-brand-600 bg-card w-40"
                        />
                        <button
                          type="button"
                          onClick={() => handleAction(signal.id)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-brand-600 text-white rounded-md text-xs font-medium hover:bg-brand-700 transition-colors"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Actioned
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
