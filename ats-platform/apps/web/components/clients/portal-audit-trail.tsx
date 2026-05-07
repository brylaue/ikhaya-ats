"use client";

/**
 * PortalAuditTrail — US-046: Client Portal Audit Trail
 *
 * Shows a log of all portal interactions for a given client company.
 */

import { useState } from "react";
import {
  Eye, MessageSquare, Download, LogIn, ThumbsUp, CheckSquare,
  FileText, Star, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePortalAuditTrail } from "@/lib/supabase/hooks";

const EVENT_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  portal_login:        { label: "Logged in",           icon: LogIn,       color: "text-slate-500" },
  portal_view:         { label: "Viewed portal",       icon: Eye,         color: "text-blue-500"  },
  candidate_viewed:    { label: "Viewed candidate",    icon: Users,       color: "text-blue-600"  },
  feedback_submitted:  { label: "Submitted feedback",  icon: MessageSquare, color: "text-emerald-600" },
  feedback_updated:    { label: "Updated feedback",    icon: MessageSquare, color: "text-amber-600" },
  shortlist_viewed:    { label: "Viewed shortlist",    icon: FileText,    color: "text-violet-600" },
  scorecard_submitted: { label: "Submitted scorecard", icon: Star,        color: "text-emerald-600" },
  document_downloaded: { label: "Downloaded doc",      icon: Download,    color: "text-slate-600"  },
  invite_accepted:     { label: "Accepted invite",     icon: CheckSquare, color: "text-brand-600"  },
};

const ACTOR_LABELS: Record<string, string> = {
  recruiter:       "Recruiter",
  client_contact:  "Client",
  system:          "System",
};

interface Props { companyId: string }

export function PortalAuditTrail({ companyId }: Props) {
  const { events, loading } = usePortalAuditTrail(companyId);
  const [filter, setFilter] = useState<string>("all");

  const filtered = filter === "all" ? events : events.filter(e => e.eventType === filter);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Portal Activity</h3>
        <select
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="text-xs px-2.5 py-1.5 border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-brand-600 bg-card"
        >
          <option value="all">All events</option>
          {Object.entries(EVENT_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-muted/10 p-8 text-center">
          <Eye className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No portal activity yet.</p>
        </div>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
          {filtered.map(evt => {
            const cfg = EVENT_CONFIG[evt.eventType] ?? { label: evt.eventType, icon: Eye, color: "text-muted-foreground" };
            const Icon = cfg.icon;
            return (
              <div key={evt.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors">
                <Icon className={cn("h-3.5 w-3.5 shrink-0", cfg.color)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-foreground">{cfg.label}</span>
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                      evt.actorType === "client_contact" ? "bg-blue-50 text-blue-700" :
                      evt.actorType === "recruiter" ? "bg-violet-50 text-violet-700" :
                      "bg-slate-50 text-slate-600"
                    )}>
                      {ACTOR_LABELS[evt.actorType] ?? evt.actorType}
                    </span>
                  </div>
                  {evt.actorEmail && <p className="text-[10px] text-muted-foreground truncate">{evt.actorEmail}</p>}
                </div>
                <p className="text-[10px] text-muted-foreground whitespace-nowrap">
                  {new Date(evt.occurredAt).toLocaleString()}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
