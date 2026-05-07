"use client";

/**
 * Search Analytics Dashboard — US-493
 *
 * Top searched skills/titles/locations, thin-supply detection,
 * recruiter search-to-pipeline conversion funnel, saved-search usage.
 * Admin-only. Data sourced from search_signals (migration 066).
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { Search, TrendingUp, AlertTriangle, Users, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

interface TopTerm { term: string; count: number; clickRate: number; isThin: boolean }
interface RecruiterFunnel { userId: string; name: string; searches: number; clicks: number; views: number; pipelineAdds: number }

const WINDOWS = [{ label: "30 days", days: 30 }, { label: "90 days", days: 90 }];

export default function SearchAnalyticsDashboard() {
  const supabase = createClient();
  const [windowDays, setWindowDays] = useState(30);
  const [topSkills, setTopSkills] = useState<TopTerm[]>([]);
  const [funnel, setFunnel] = useState<RecruiterFunnel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();

      // Fetch search signals
      const { data: signals } = await supabase
        .from("search_signals")
        .select("signal_type, query_fingerprint, candidate_id, user_id, metadata, created_at, users(full_name)")
        .gte("created_at", since);

      const sigs = signals ?? [];

      // Build recruiter funnel
      const recruiterMap: Record<string, RecruiterFunnel> = {};
      for (const s of sigs) {
        if (!s.user_id) continue;
        if (!recruiterMap[s.user_id]) {
          recruiterMap[s.user_id] = {
            userId: s.user_id,
            name:   (s as any).users?.full_name ?? "Unknown",
            searches: 0, clicks: 0, views: 0, pipelineAdds: 0,
          };
        }
        const r = recruiterMap[s.user_id];
        if (s.signal_type === "search")       r.searches++;
        if (s.signal_type === "click")        r.clicks++;
        if (s.signal_type === "view")         r.views++;
        if (s.signal_type === "pipeline_add") r.pipelineAdds++;
      }

      setFunnel(Object.values(recruiterMap).sort((a, b) => b.searches - a.searches));

      // Extract top searched terms from metadata
      const termCounts: Record<string, { count: number; clicks: number }> = {};
      for (const s of sigs) {
        if (s.signal_type !== "search") continue;
        const meta = (s as any).metadata ?? {};
        const terms: string[] = [
          ...(meta.skills ?? []),
          ...(meta.titles ?? []),
        ];
        for (const t of terms) {
          if (!termCounts[t]) termCounts[t] = { count: 0, clicks: 0 };
          termCounts[t].count++;
        }
        // Count clicks for this fingerprint
        if (s.signal_type === "click") {
          for (const t of terms) {
            termCounts[t].clicks++;
          }
        }
      }

      const topTerms = Object.entries(termCounts)
        .map(([term, { count, clicks }]) => ({
          term,
          count,
          clickRate: count > 0 ? clicks / count : 0,
          isThin:    count >= 3 && (clicks / Math.max(count, 1)) < 0.1,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20);

      setTopSkills(topTerms);
      setLoading(false);
    }
    load();
  }, [windowDays]);

  const thinSupply = topSkills.filter(t => t.isThin);

  return (
    <div className="flex-1 overflow-auto">
      <div className="space-y-6 p-8">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href="/analytics" className="text-sm text-brand-600 hover:text-brand-700 font-medium">
            ← Analytics
          </Link>
          <div className="flex-1 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Search Analytics</h1>
              <p className="text-sm text-muted-foreground mt-1">Team search patterns, market supply signals, recruiter conversion</p>
            </div>
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
              {WINDOWS.map(w => (
                <button key={w.days} type="button" onClick={() => setWindowDays(w.days)}
                  className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                    windowDays === w.days ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                  {w.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => <div key={i} className="h-48 animate-pulse rounded-xl bg-muted" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-6">
            {/* Top searched terms */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
                <Search className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Top Searched Skills & Titles</h2>
              </div>
              {topSkills.length === 0 ? (
                <div className="py-10 text-center">
                  <Search className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">No search data yet.</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {topSkills.map((t, i) => (
                    <div key={t.term} className="flex items-center gap-3 px-5 py-2.5">
                      <span className="text-xs text-muted-foreground w-5">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-foreground truncate">{t.term}</span>
                          {t.isThin && (
                            <span className="flex items-center gap-0.5 text-[10px] text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full font-medium">
                              <AlertTriangle className="h-2.5 w-2.5" />Thin supply
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground">{t.count} searches</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Thin supply alert */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <h2 className="text-sm font-semibold text-foreground">Thin Supply Alerts</h2>
              </div>
              {thinSupply.length === 0 ? (
                <div className="py-10 text-center">
                  <TrendingUp className="h-6 w-6 text-emerald-500 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">No thin-supply signals detected.</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {thinSupply.map(t => (
                    <div key={t.term} className="px-5 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-foreground">{t.term}</p>
                        <span className="text-[10px] text-red-600 font-medium">{Math.round(t.clickRate * 100)}% click rate</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Searched {t.count}× but candidates rarely clicked — limited supply in your pool
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recruiter conversion funnel */}
            <div className="col-span-2 rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Recruiter Conversion Funnel</h2>
              </div>
              {funnel.length === 0 ? (
                <div className="py-10 text-center">
                  <Users className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">No search funnel data yet.</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  <div className="grid grid-cols-[1fr,80px,80px,80px,100px] gap-4 px-5 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/30">
                    <span>Recruiter</span>
                    <span className="text-center">Searches</span>
                    <span className="text-center">Clicks</span>
                    <span className="text-center">Views</span>
                    <span className="text-center">Pipeline adds</span>
                  </div>
                  {funnel.map(r => (
                    <div key={r.userId} className="grid grid-cols-[1fr,80px,80px,80px,100px] gap-4 px-5 py-2.5 items-center hover:bg-muted/20">
                      <p className="text-sm font-medium text-foreground">{r.name}</p>
                      <p className="text-sm text-center text-foreground">{r.searches}</p>
                      <p className="text-sm text-center text-foreground">{r.clicks}</p>
                      <p className="text-sm text-center text-foreground">{r.views}</p>
                      <p className={cn("text-sm text-center font-medium", r.pipelineAdds > 0 ? "text-emerald-600" : "text-muted-foreground")}>
                        {r.pipelineAdds}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
