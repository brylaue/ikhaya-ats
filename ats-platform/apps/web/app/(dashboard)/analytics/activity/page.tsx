"use client";

/**
 * Activity Metrics Dashboard — US-067
 *
 * Leading-indicator activity per recruiter: calls logged, meetings, emails sent,
 * submissions made. Surfaced for managers to spot underperformance early.
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { Phone, Video, Mail, Send, TrendingUp, Users, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useAgencyUsers, useFeatureFlag } from "@/lib/supabase/hooks";
import { FeatureGate } from "@/components/ui/feature-gate";

interface RecruiterActivity {
  userId:      string;
  name:        string;
  calls:       number;
  meetings:    number;
  emails:      number;
  submissions: number;
  total:       number;
}

const WINDOWS = [
  { label: "7 days",   days: 7 },
  { label: "30 days",  days: 30 },
  { label: "90 days",  days: 90 },
];

export default function ActivityMetricsDashboard() {
  // US-513: Activity metrics sit inside analytics — Growth-tier gate.
  const { enabled: analyticsEnabled, loading: analyticsLoading } = useFeatureFlag("analytics");
  const supabase = createClient();
  const { users: teamUsers, loading: usersLoading } = useAgencyUsers?.() ?? { users: [], loading: false };
  const [window, setWindow] = useState(30);
  const [data, setData] = useState<RecruiterActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const since = new Date(Date.now() - window * 86_400_000).toISOString();

      // Fetch activities grouped by actor and type
      const { data: acts } = await supabase
        .from("activities")
        .select("actor_id, type, users(full_name)")
        .in("type", ["call", "meeting", "email", "submission"])
        .gte("created_at", since);

      // Build per-recruiter aggregates
      const map: Record<string, RecruiterActivity> = {};
      for (const a of acts ?? []) {
        if (!a.actor_id) continue;
        if (!map[a.actor_id]) {
          map[a.actor_id] = {
            userId:      a.actor_id,
            name:        (a as any).users?.full_name ?? "Unknown",
            calls:       0,
            meetings:    0,
            emails:      0,
            submissions: 0,
            total:       0,
          };
        }
        const rec = map[a.actor_id];
        if (a.type === "call")       rec.calls++;
        if (a.type === "meeting")    rec.meetings++;
        if (a.type === "email")      rec.emails++;
        if (a.type === "submission") rec.submissions++;
        rec.total++;
      }

      setData(Object.values(map).sort((a, b) => b.total - a.total));
      setLoading(false);
    }
    load();
  }, [window]);

  const maxTotal = Math.max(...data.map(d => d.total), 1);

  // US-513: plan gate — activity metrics live behind `analytics` (Growth).
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
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href="/analytics" className="text-sm text-brand-600 hover:text-brand-700 font-medium">
            ← Analytics
          </Link>
          <div className="flex-1 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Activity Metrics</h1>
              <p className="text-sm text-muted-foreground mt-1">Leading-indicator activity per recruiter</p>
            </div>
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
              {WINDOWS.map(w => (
                <button
                  key={w.days}
                  type="button"
                  onClick={() => setWindow(w.days)}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                    window === w.days ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* KPI strip */}
        {!loading && data.length > 0 && (
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: "Calls logged",      icon: Phone, value: data.reduce((s, d) => s + d.calls, 0),       color: "text-blue-600" },
              { label: "Meetings logged",   icon: Video, value: data.reduce((s, d) => s + d.meetings, 0),    color: "text-violet-600" },
              { label: "Emails sent",       icon: Mail,  value: data.reduce((s, d) => s + d.emails, 0),      color: "text-emerald-600" },
              { label: "Submissions made",  icon: Send,  value: data.reduce((s, d) => s + d.submissions, 0), color: "text-amber-600" },
            ].map(kpi => {
              const Icon = kpi.icon;
              return (
                <div key={kpi.label} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={cn("h-4 w-4", kpi.color)} />
                    <span className="text-xs text-muted-foreground">{kpi.label}</span>
                  </div>
                  <p className="text-3xl font-bold text-foreground">{kpi.value.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">last {window} days</p>
                </div>
              );
            })}
          </div>
        )}

        {/* Per-recruiter table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">Per-Recruiter Breakdown</h2>
          </div>
          {loading ? (
            <div className="divide-y divide-border">
              {[...Array(5)].map((_, i) => <div key={i} className="h-14 animate-pulse bg-muted/20 m-4 rounded-lg" />)}
            </div>
          ) : data.length === 0 ? (
            <div className="py-12 text-center">
              <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No activity logged in the last {window} days.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {/* Header */}
              <div className="grid grid-cols-[1fr,80px,80px,80px,80px,100px] gap-4 px-5 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/30">
                <span>Recruiter</span>
                <span className="text-center">Calls</span>
                <span className="text-center">Meetings</span>
                <span className="text-center">Emails</span>
                <span className="text-center">Submissions</span>
                <span>Activity</span>
              </div>
              {data.map((rec, i) => (
                <div key={rec.userId} className={cn(
                  "grid grid-cols-[1fr,80px,80px,80px,80px,100px] gap-4 px-5 py-3 items-center",
                  i === 0 && "bg-brand-50/30"
                )}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground w-4">{i + 1}</span>
                    <p className="text-sm font-medium text-foreground">{rec.name}</p>
                  </div>
                  <p className="text-sm text-center text-foreground">{rec.calls}</p>
                  <p className="text-sm text-center text-foreground">{rec.meetings}</p>
                  <p className="text-sm text-center text-foreground">{rec.emails}</p>
                  <p className="text-sm text-center text-foreground">{rec.submissions}</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full bg-brand-600 rounded-full transition-all"
                        style={{ width: `${Math.round((rec.total / maxTotal) * 100)}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground w-8 text-right">{rec.total}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
