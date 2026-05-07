"use client";
/**
 * Integration Marketplace — US-443: Integration Marketplace & Connector Registry
 * Browse and enable third-party connectors (meetings, e-sig, job boards, etc.)
 */

import { useAgencyConnectors } from "@/lib/supabase/hooks";
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle } from "lucide-react";
import { toast } from "sonner";

const CONNECTORS = [
  { key: "gong",         name: "Gong",          category: "Meeting Intelligence", description: "Ingest sales & intake call transcripts",      status: "beta" },
  { key: "otter",        name: "Otter.ai",       category: "Meeting Intelligence", description: "Auto-transcribe interviews & meetings",        status: "available" },
  { key: "fireflies",    name: "Fireflies",      category: "Meeting Intelligence", description: "AI notetaker for team meetings",               status: "available" },
  { key: "docusign",     name: "DocuSign",       category: "E-Signature",          description: "Send & track MSAs and offer letters",          status: "coming_soon" },
  { key: "adobesign",    name: "Adobe Sign",     category: "E-Signature",          description: "Enterprise e-signature platform",              status: "coming_soon" },
  { key: "broadbean",    name: "Broadbean",      category: "Job Distribution",     description: "Post to 180+ job boards simultaneously",       status: "coming_soon" },
  { key: "idibu",        name: "Idibu",          category: "Job Distribution",     description: "Multi-board posting & applicant tracking",     status: "coming_soon" },
  { key: "crosschq",    name: "Crosschq",       category: "Reference Checks",     description: "Automated reference checking at scale",        status: "coming_soon" },
  { key: "greenhouse",   name: "Greenhouse",     category: "Client ATS",           description: "Push candidates & sync job statuses",          status: "coming_soon" },
  { key: "lever",        name: "Lever",          category: "Client ATS",           description: "Bidirectional candidate sync",                 status: "coming_soon" },
  { key: "contactout",   name: "ContactOut",     category: "Enrichment",           description: "Email & phone data for candidates",            status: "available" },
  { key: "apollo",       name: "Apollo",         category: "Enrichment",           description: "Company & contact enrichment",                 status: "available" },
  { key: "zapier",       name: "Zapier",         category: "Automation",           description: "Connect to 5000+ apps via Zapier",            status: "available" },
  { key: "make",         name: "Make",           category: "Automation",           description: "Visual no-code automation workflows",          status: "available" },
];

const CATEGORIES = [...new Set(CONNECTORS.map(c => c.category))];

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  available:   { label: "Available",   color: "bg-emerald-50 text-emerald-700" },
  beta:        { label: "Beta",        color: "bg-blue-50 text-blue-700" },
  coming_soon: { label: "Coming soon", color: "bg-slate-100 text-slate-500" },
};

export default function MarketplacePage() {
  const { loading, toggleConnector, enabledKeys } = useAgencyConnectors();

  async function handleToggle(key: string, currentlyEnabled: boolean) {
    const connector = CONNECTORS.find(c => c.key === key);
    if (connector?.status === "coming_soon") { toast.info("Coming soon — join the waitlist"); return; }
    try {
      await toggleConnector(key, !currentlyEnabled);
      toast.success(currentlyEnabled ? "Connector disabled" : "Connector enabled");
    } catch { toast.error("Failed to update connector"); }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Integration Marketplace</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Enable connectors to extend your workflow</p>
      </div>

      {CATEGORIES.map(cat => (
        <div key={cat} className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{cat}</h3>
          <div className="grid grid-cols-2 gap-3">
            {CONNECTORS.filter(c => c.category === cat).map(conn => {
              const enabled = enabledKeys.has(conn.key);
              const statusCfg = STATUS_CONFIG[conn.status];
              return (
                <div key={conn.key}
                  className={cn("rounded-xl border p-4 transition-colors",
                    enabled ? "border-brand-300 bg-brand-50/30" : "border-border bg-card"
                  )}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-foreground">{conn.name}</p>
                        <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", statusCfg.color)}>
                          {statusCfg.label}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{conn.description}</p>
                    </div>
                    <button type="button"
                      onClick={() => handleToggle(conn.key, enabled)}
                      disabled={loading}
                      className={cn("shrink-0 transition-colors",
                        conn.status === "coming_soon" ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
                      )}>
                      {enabled
                        ? <CheckCircle2 className="h-5 w-5 text-brand-600" />
                        : <Circle className="h-5 w-5 text-muted-foreground hover:text-brand-600" />
                      }
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
