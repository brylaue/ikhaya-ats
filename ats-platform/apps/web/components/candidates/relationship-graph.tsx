"use client";
/**
 * RelationshipGraph — US-014: Relationship Graph
 * Shows referral connections, past submissions, client overlaps for a candidate.
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { Users, Building2, GitBranch, ArrowRight, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface RelNode {
  type:     "client" | "referral" | "submission" | "placement";
  label:    string;
  sublabel: string;
  date:     string;
  href?:    string;
}

interface Props { candidateId: string }

export function RelationshipGraph({ candidateId }: Props) {
  const supabase = createClient();
  const [nodes, setNodes] = useState<RelNode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [appsRes, refRes, placRes] = await Promise.all([
        // Submissions (applications with job + client)
        supabase.from("applications")
          .select("id, created_at, jobs(id, title, companies(id, name))")
          .eq("candidate_id", candidateId)
          .order("created_at", { ascending: false })
          .limit(10),

        // Referrals where this candidate referred someone or was referred
        supabase.from("referrals")
          .select("id, referred_name, referred_by_name, referral_type, created_at")
          .eq("status", "converted")
          .limit(5),

        // Placements
        supabase.from("placements")
          .select("id, placed_at, companies(id, name), jobs(id, title)")
          .eq("candidate_id", candidateId)
          .order("placed_at", { ascending: false })
          .limit(5),
      ]);

      const result: RelNode[] = [];

      for (const app of appsRes.data ?? []) {
        const job = (app as any).jobs;
        const company = job?.companies;
        result.push({
          type:     "submission",
          label:    job?.title ?? "Unknown role",
          sublabel: company?.name ?? "Unknown client",
          date:     app.created_at,
          href:     company?.id ? `/clients/${company.id}` : undefined,
        });
      }

      for (const p of placRes.data ?? []) {
        const company = (p as any).companies;
        const job = (p as any).jobs;
        result.push({
          type:     "placement",
          label:    job?.title ?? "Placement",
          sublabel: company?.name ?? "Client",
          date:     p.placed_at,
          href:     company?.id ? `/clients/${company.id}` : undefined,
        });
      }

      setNodes(result);
      setLoading(false);
    }
    load();
  }, [candidateId]);

  const TYPE_CONFIG = {
    submission: { icon: GitBranch,   color: "text-blue-600 bg-blue-50",     label: "Submitted" },
    placement:  { icon: Star,        color: "text-amber-600 bg-amber-50",   label: "Placed" },
    client:     { icon: Building2,   color: "text-violet-600 bg-violet-50", label: "Client" },
    referral:   { icon: Users,       color: "text-emerald-600 bg-emerald-50", label: "Referral" },
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Relationship Map</h3>
      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />)}
        </div>
      ) : nodes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <GitBranch className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">No relationship history yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {nodes.map((n, i) => {
            const cfg = TYPE_CONFIG[n.type];
            const Icon = cfg.icon;
            const content = (
              <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-muted/20 transition-colors">
                <div className={`p-1.5 rounded-md shrink-0 ${cfg.color}`}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{n.label}</p>
                  <p className="text-[10px] text-muted-foreground">{n.sublabel} · {new Date(n.date).toLocaleDateString()}</p>
                </div>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>
                {n.href && <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />}
              </div>
            );
            return n.href
              ? <Link key={i} href={n.href}>{content}</Link>
              : <div key={i}>{content}</div>;
          })}
        </div>
      )}
    </div>
  );
}
