"use client";
/**
 * DEI Analytics — US-421: Adverse Impact Analysis
 * Selection rate by protected class + four-fifths rule violations.
 * Admin-only.
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useFeatureFlag } from "@/lib/supabase/hooks";
import { FeatureGate } from "@/components/ui/feature-gate";
import { cn } from "@/lib/utils";

interface GroupRate { group: string; apps: number; placements: number; rate: number; ratio: number; flagged: boolean }

export default function DeiAnalyticsPage() {
  // US-513: DEI adverse-impact analysis lives behind `analytics` (Growth).
  const { enabled: analyticsEnabled, loading: analyticsLoading } = useFeatureFlag("analytics");
  const supabase = createClient();
  const [genderData, setGenderData] = useState<GroupRate[]>([]);
  const [raceData, setRaceData] = useState<GroupRate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: eeo } = await supabase
        .from("candidate_eeo_data")
        .select("candidate_id, gender, race_ethnicity");

      const { data: placements } = await supabase
        .from("placements")
        .select("candidate_id");

      const placedIds = new Set((placements ?? []).map((p: any) => p.candidate_id));

      function calcRates(items: any[], field: "gender" | "race_ethnicity"): GroupRate[] {
        const groups: Record<string, { apps: number; placements: number }> = {};
        for (const item of items ?? []) {
          const g = item[field] ?? "declined";
          if (!groups[g]) groups[g] = { apps: 0, placements: 0 };
          groups[g].apps++;
          if (placedIds.has(item.candidate_id)) groups[g].placements++;
        }

        const rates = Object.entries(groups)
          .filter(([g]) => g !== "declined")
          .map(([group, { apps, placements }]) => ({
            group, apps, placements,
            rate: apps > 0 ? placements / apps : 0,
          }));

        const maxRate = Math.max(...rates.map(r => r.rate), 0.001);

        return rates.map(r => ({
          ...r,
          ratio: r.rate / maxRate,
          flagged: r.ratio < 0.8 && r.apps >= 5, // four-fifths rule; min 5 applicants
        }));
      }

      setGenderData(calcRates(eeo ?? [], "gender"));
      setRaceData(calcRates(eeo ?? [], "race_ethnicity"));
      setLoading(false);
    }
    load();
  }, []);

  function RateTable({ title, rows }: { title: string; rows: GroupRate[] }) {
    const flaggedCount = rows.filter(r => r.flagged).length;
    return (
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {flaggedCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] bg-red-50 text-red-700 px-2 py-0.5 rounded-full font-medium">
              <AlertTriangle className="h-2.5 w-2.5" />
              {flaggedCount} 4/5 violation{flaggedCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        {rows.length === 0 ? (
          <div className="py-8 text-center">
            <Users className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No EEO data collected yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            <div className="grid grid-cols-[1fr,60px,80px,80px,80px] gap-4 px-5 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/30">
              <span>Group</span><span className="text-center">Apps</span>
              <span className="text-center">Placements</span><span className="text-center">Rate</span>
              <span className="text-center">4/5 ratio</span>
            </div>
            {rows.sort((a, b) => b.rate - a.rate).map(r => (
              <div key={r.group} className={cn(
                "grid grid-cols-[1fr,60px,80px,80px,80px] gap-4 px-5 py-2.5 items-center",
                r.flagged && "bg-red-50/30"
              )}>
                <div className="flex items-center gap-2">
                  <p className="text-sm text-foreground capitalize">{r.group.replace(/_/g, " ")}</p>
                  {r.flagged && <AlertTriangle className="h-3 w-3 text-red-500" />}
                </div>
                <p className="text-sm text-center text-foreground">{r.apps}</p>
                <p className="text-sm text-center text-foreground">{r.placements}</p>
                <p className="text-sm text-center text-foreground">{(r.rate * 100).toFixed(1)}%</p>
                <p className={cn("text-sm text-center font-medium",
                  r.ratio >= 0.8 ? "text-emerald-600" : "text-red-600")}>
                  {r.ratio.toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // US-513: plan gate — DEI analytics requires `analytics` feature.
  if (!analyticsLoading && !analyticsEnabled) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <FeatureGate feature="analytics" className="max-w-sm" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="space-y-6 p-8">
        <div className="flex items-center gap-4">
          <Link href="/analytics" className="text-sm text-brand-600 hover:text-brand-700 font-medium">← Analytics</Link>
          <div>
            <h1 className="text-3xl font-bold text-foreground">DEI & Adverse Impact</h1>
            <p className="text-sm text-muted-foreground mt-1">Four-fifths rule analysis by protected class · admin only</p>
          </div>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-xs text-amber-800">
          <strong>Important:</strong> EEO-1 data is voluntary and stored separately from candidate scoring. Rates below 0.80 (80% rule) may indicate adverse impact and warrant investigation.
        </div>

        {loading ? (
          <div className="space-y-4">
            {[...Array(2)].map((_, i) => <div key={i} className="h-40 animate-pulse rounded-xl bg-muted" />)}
          </div>
        ) : (
          <div className="space-y-6">
            <RateTable title="By Gender" rows={genderData} />
            <RateTable title="By Race / Ethnicity" rows={raceData} />
          </div>
        )}
      </div>
    </div>
  );
}
