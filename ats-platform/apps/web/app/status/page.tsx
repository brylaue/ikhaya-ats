/**
 * Public Status Page — US-405: Public Status Page & SLA Commitment
 * No auth required. Shows system health, incidents, SLA commitment.
 */

import { CheckCircle, AlertCircle, Clock } from "lucide-react";

// In a real deployment these would come from a status DB or external provider
const SERVICES = [
  { name: "API & Authentication",      status: "operational" },
  { name: "Pipeline & Candidates",     status: "operational" },
  { name: "Email Integration",         status: "operational" },
  { name: "AI Features",               status: "operational" },
  { name: "Client Portal",             status: "operational" },
  { name: "File Storage",              status: "operational" },
];

const SLA = {
  uptime: "99.5%",
  responseTime: "< 800ms p95",
  supportResponse: "< 4 business hours (Pro)",
};

function StatusBadge({ status }: { status: string }) {
  if (status === "operational") return (
    <span className="flex items-center gap-1.5 text-emerald-600 text-sm font-medium">
      <CheckCircle className="h-4 w-4" /> Operational
    </span>
  );
  if (status === "degraded") return (
    <span className="flex items-center gap-1.5 text-amber-600 text-sm font-medium">
      <AlertCircle className="h-4 w-4" /> Degraded
    </span>
  );
  return (
    <span className="flex items-center gap-1.5 text-red-600 text-sm font-medium">
      <AlertCircle className="h-4 w-4" /> Outage
    </span>
  );
}

export default function StatusPage() {
  const allOk = SERVICES.every(s => s.status === "operational");

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-6 py-16 space-y-10">
        {/* Header */}
        <div className="text-center">
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium mb-4 ${
            allOk ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
          }`}>
            {allOk ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            {allOk ? "All systems operational" : "Some systems affected"}
          </div>
          <h1 className="text-3xl font-bold text-foreground">Ikhaya Status</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Last updated: {new Date().toLocaleString()}
          </p>
        </div>

        {/* Service status */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">System Status</h2>
          </div>
          <div className="divide-y divide-border">
            {SERVICES.map(s => (
              <div key={s.name} className="flex items-center justify-between px-6 py-3">
                <p className="text-sm text-foreground">{s.name}</p>
                <StatusBadge status={s.status} />
              </div>
            ))}
          </div>
        </div>

        {/* 90-day uptime (placeholder) */}
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-sm font-semibold text-foreground mb-3">90-Day Uptime</h2>
          <div className="flex gap-0.5">
            {[...Array(90)].map((_, i) => (
              <div key={i} className="flex-1 h-8 rounded-sm bg-emerald-400 opacity-80" title={`Day ${i + 1}: Operational`} />
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground mt-2">
            <span>90 days ago</span>
            <span className="font-medium text-emerald-600">100.0% uptime</span>
            <span>Today</span>
          </div>
        </div>

        {/* SLA */}
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-sm font-semibold text-foreground mb-4">SLA Commitments</h2>
          <div className="grid grid-cols-3 gap-4 text-center">
            {Object.entries(SLA).map(([key, val]) => (
              <div key={key}>
                <p className="text-xl font-bold text-foreground">{val}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 capitalize">
                  {key.replace(/([A-Z])/g, ' $1').toLowerCase()}
                </p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Subscribe to updates · <a href="mailto:support@ikhaya.io" className="text-brand-600 hover:underline">Contact support</a>
        </p>
      </div>
    </div>
  );
}
