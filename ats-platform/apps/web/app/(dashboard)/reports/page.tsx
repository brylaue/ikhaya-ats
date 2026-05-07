"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  FileText,
  Download,
  Send,
  TrendingUp,
  Users,
  Calendar,
  Building2,
  BadgeCheck,
  ChevronRight,
  Clock,
  BarChart2,
  Star,
  Filter,
  Eye,
  Printer,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { cn, formatSalary, getInitials, generateAvatarColor } from "@/lib/utils";
import { useCompanies, usePlacements, useJobs, type PlacementRecord } from "@/lib/supabase/hooks";
import { toast } from "sonner";

// ─── Report template definitions ─────────────────────────────────────────────

type ReportType = "placements" | "recruiter_performance" | "client_activity" | "pipeline_snapshot";

interface ReportTemplate {
  id: ReportType;
  title: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  tag: string;
}

const REPORT_TEMPLATES: ReportTemplate[] = [
  {
    id: "placements",
    title: "Placement Report",
    description: "All placements with fee breakdown, time-to-fill, and recruiter attribution. Suitable for sending to clients.",
    icon: BadgeCheck,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    tag: "Client-facing",
  },
  {
    id: "recruiter_performance",
    title: "Recruiter Performance",
    description: "Submissions, interviews, placements and conversion rates per recruiter over the selected period.",
    icon: Users,
    color: "text-brand-600",
    bg: "bg-brand-50",
    tag: "Internal",
  },
  {
    id: "client_activity",
    title: "Client Activity Summary",
    description: "Per-client breakdown of job volume, submission counts, placements, and average feedback response time.",
    icon: Building2,
    color: "text-violet-600",
    bg: "bg-violet-50",
    tag: "Client-facing",
  },
  {
    id: "pipeline_snapshot",
    title: "Pipeline Snapshot",
    description: "Current state of all active pipelines — stage distribution, SLA breaches, and days-in-stage heatmap.",
    icon: BarChart2,
    color: "text-amber-600",
    bg: "bg-amber-50",
    tag: "Internal",
  },
];

// ─── Period options ───────────────────────────────────────────────────────────

type Period = "this_month" | "last_month" | "this_quarter" | "last_quarter" | "ytd" | "custom";

const PERIOD_LABELS: Record<Period, string> = {
  this_month:    "This Month",
  last_month:    "Last Month",
  this_quarter:  "This Quarter",
  last_quarter:  "Last Quarter",
  ytd:           "Year to Date",
  custom:        "Custom Range",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {action}
    </div>
  );
}

// ─── Report previews ──────────────────────────────────────────────────────────

interface PlacementsPreviewProps {
  placements: PlacementRecord[];
  loading: boolean;
  period: Period;
  clientFilter: string;
}

function PlacementsReportPreview({ placements, loading, period, clientFilter }: PlacementsPreviewProps) {
  const filtered = clientFilter === "all" ? placements : placements.filter((p) => p.clientId === clientFilter);
  const totalFees = filtered.reduce((s, p) => s + p.feeAmount, 0);
  const avgDays   = 0; // daysToFill not stored on PlacementRecord — shown as "—" until added

  if (loading) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />Loading placements…</div>;
  }

  if (filtered.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No placements recorded yet.</p>;
  }

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Placements",  value: filtered.length,                    icon: BadgeCheck, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Total Fees",        value: formatSalary(totalFees, "USD", true), icon: TrendingUp, color: "text-brand-600",   bg: "bg-brand-50"   },
          { label: "Fees Collected",    value: formatSalary(filtered.reduce((s, p) => s + p.amountCollected, 0), "USD", true), icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="rounded-lg border border-border bg-background p-3">
            <div className="flex items-center gap-2 mb-1">
              <div className={cn("flex h-6 w-6 items-center justify-center rounded-md", bg)}>
                <Icon className={cn("h-3 w-3", color)} />
              </div>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
            </div>
            <p className="text-lg font-bold text-foreground">{value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="grid grid-cols-[1fr_100px_80px_80px] bg-muted/40 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span>Candidate / Role</span><span>Client</span><span className="text-right">Fee</span><span className="text-right">Status</span>
        </div>
        {filtered.map((p) => (
          <div key={p.id} className="grid grid-cols-[1fr_100px_80px_80px] items-center border-t border-border px-4 py-2.5 hover:bg-accent/30">
            <div>
              <p className="text-xs font-medium text-foreground">{p.candidateName}</p>
              <p className="text-[10px] text-muted-foreground">{p.jobTitle}</p>
            </div>
            <p className="text-xs text-muted-foreground truncate">{p.clientName}</p>
            <p className="text-xs font-semibold text-foreground text-right">{formatSalary(p.feeAmount, p.currency, true)}</p>
            <p className="text-xs text-muted-foreground text-right capitalize">{p.invoiceStatus}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

interface RecruiterStat {
  name: string;
  placements: number;
  fees: number;
  currency: string;
}

interface RecruiterPerformanceProps {
  placements: PlacementRecord[];
  loading: boolean;
}

function RecruiterPerformancePreview({ placements, loading }: RecruiterPerformanceProps) {
  const recruiterStats = useMemo((): RecruiterStat[] => {
    const map: Record<string, RecruiterStat> = {};
    for (const p of placements) {
      const key = p.recruiterName || "Unknown";
      if (!map[key]) map[key] = { name: key, placements: 0, fees: 0, currency: p.currency };
      map[key].placements++;
      map[key].fees += p.feeAmount;
    }
    return Object.values(map).sort((a, b) => b.fees - a.fees);
  }, [placements]);

  if (loading) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />Loading data…</div>;
  }

  if (recruiterStats.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No placement data to summarise yet.</p>;
  }

  const maxFees = Math.max(...recruiterStats.map((r) => r.fees), 1);

  return (
    <div className="space-y-3">
      {recruiterStats.map((r) => (
        <div key={r.name} className="rounded-lg border border-border bg-background p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white", generateAvatarColor(r.name))}>
              {getInitials(r.name)}
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">{r.name}</p>
              <p className="text-[10px] text-muted-foreground">{r.placements} placement{r.placements !== 1 ? "s" : ""} · {formatSalary(r.fees, r.currency, true)} fees</p>
            </div>
          </div>
          {/* Fee bar */}
          <div className="mt-1 h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${(r.fees / maxFees) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

interface ClientActivityRow {
  clientId: string;
  name: string;
  openJobs: number;
  placements: number;
}

interface ClientActivityProps {
  placements: PlacementRecord[];
  jobs: { clientId?: string; companyName?: string; status?: string }[];
  loading: boolean;
}

function ClientActivityPreview({ placements, jobs, loading }: ClientActivityProps) {
  const rows = useMemo((): ClientActivityRow[] => {
    // Build client map from placements
    const map: Record<string, ClientActivityRow> = {};
    for (const p of placements) {
      if (!p.clientId) continue;
      if (!map[p.clientId]) map[p.clientId] = { clientId: p.clientId, name: p.clientName, openJobs: 0, placements: 0 };
      map[p.clientId].placements++;
    }
    // Count open jobs per client
    for (const j of jobs) {
      if (!j.clientId || (j.status !== "open" && j.status !== "active")) continue;
      if (!map[j.clientId]) map[j.clientId] = { clientId: j.clientId, name: j.companyName ?? "Unknown", openJobs: 0, placements: 0 };
      map[j.clientId].openJobs++;
    }
    return Object.values(map).sort((a, b) => b.placements - a.placements);
  }, [placements, jobs]);

  if (loading) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />Loading data…</div>;
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No client data available yet.</p>;
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="grid grid-cols-[1fr_80px_80px] bg-muted/40 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span>Client</span>
        <span className="text-right">Open Jobs</span>
        <span className="text-right">Placements</span>
      </div>
      {rows.map((c) => (
        <div key={c.clientId} className="grid grid-cols-[1fr_80px_80px] items-center border-t border-border px-4 py-3 hover:bg-accent/30">
          <div className="flex items-center gap-2">
            <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-white", generateAvatarColor(c.clientId))}>
              {getInitials(c.name)}
            </div>
            <p className="text-xs font-medium text-foreground">{c.name}</p>
          </div>
          <p className="text-xs text-muted-foreground text-right">{c.openJobs}</p>
          <p className="text-xs font-semibold text-foreground text-right">{c.placements}</p>
        </div>
      ))}
    </div>
  );
}

interface PipelineSnapshotProps {
  jobs: { id: string; title: string; status?: string; candidateCount?: number }[];
  loading: boolean;
}

function PipelineSnapshotPreview({ jobs, loading }: PipelineSnapshotProps) {
  const activeJobs = jobs.filter((j) => j.status === "active");
  const stageSummary = activeJobs.map((j) => ({
    stage: j.title,
    count: j.candidateCount ?? 0,
  })).filter((s) => s.count > 0).slice(0, 8);
  const total = stageSummary.reduce((s, r) => s + r.count, 0);

  if (loading) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />Loading pipeline…</div>;
  }

  if (stageSummary.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No active pipeline data yet.</p>;
  }

  return (
    <div className="space-y-3">
      {/* Distribution bar */}
      <div>
        <p className="text-[11px] text-muted-foreground mb-2">{total} candidates across {stageSummary.length} active searches</p>
        <div className="flex h-3 w-full rounded-full overflow-hidden gap-px">
          {stageSummary.map((s, i) => {
            const colors = ["bg-slate-400","bg-brand-400","bg-violet-500","bg-amber-500","bg-emerald-500","bg-cyan-500"];
            return (
              <div
                key={s.stage}
                className={cn("transition-all rounded-full", colors[i])}
                style={{ width: `${(s.count / total) * 100}%` }}
                title={s.stage}
              />
            );
          })}
        </div>
      </div>

      {/* Job rows */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="grid grid-cols-[1fr_80px] bg-muted/40 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span>Search / Job</span><span className="text-right">Candidates</span>
        </div>
        {stageSummary.map((s) => (
          <div key={s.stage} className="grid grid-cols-[1fr_80px] items-center border-t border-border px-4 py-2.5">
            <p className="text-xs font-medium text-foreground truncate">{s.stage}</p>
            <p className="text-xs text-foreground font-semibold text-right">{s.count}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

// ─── CSV export helper ────────────────────────────────────────────────────────

function exportCsv(filename: string, rows: Record<string, string | number | null>[], columns: string[]) {
  const header = columns.join(",");
  const body   = rows.map((r) => columns.map((c) => JSON.stringify(r[c] ?? "")).join(",")).join("\n");
  const blob   = new Blob([`${header}\n${body}`], { type: "text/csv" });
  const url    = URL.createObjectURL(blob);
  const a      = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── Column config per report type ───────────────────────────────────────────

const REPORT_COLUMNS: Record<ReportType, { key: string; label: string }[]> = {
  placements: [
    { key: "candidateName", label: "Candidate" },
    { key: "jobTitle",      label: "Job Title" },
    { key: "clientName",    label: "Client" },
    { key: "recruiterName", label: "Recruiter" },
    { key: "feeAmount",     label: "Fee" },
    { key: "currency",      label: "Currency" },
    { key: "invoiceStatus", label: "Invoice Status" },
    { key: "placedAt",      label: "Placed Date" },
    { key: "amountCollected", label: "Amount Collected" },
  ],
  recruiter_performance: [
    { key: "recruiterName", label: "Recruiter" },
    { key: "placements",    label: "Placements" },
    { key: "fees",          label: "Total Fees" },
  ],
  client_activity: [
    { key: "clientName",  label: "Client" },
    { key: "jobTitle",    label: "Job Title" },
    { key: "status",      label: "Status" },
    { key: "priority",    label: "Priority" },
    { key: "candidateCount", label: "Candidates" },
  ],
  pipeline_snapshot: [
    { key: "jobTitle",       label: "Job Title" },
    { key: "clientName",     label: "Client" },
    { key: "candidateCount", label: "Candidates" },
    { key: "priority",       label: "Priority" },
    { key: "status",         label: "Status" },
  ],
};

export default function ReportsPage() {
  const { companies }                     = useCompanies();
  const { placements, loading: plLoading } = usePlacements();
  const { jobs,       loading: jobsLoading } = useJobs();
  const dataLoading = plLoading || jobsLoading;

  const [activeReport, setActiveReport]   = useState<ReportType>("placements");
  const [period, setPeriod]               = useState<Period>("ytd");
  const [clientFilter, setClientFilter]   = useState<string>("all");
  const [previewMode, setPreviewMode]     = useState(false);
  const [showConfig, setShowConfig]       = useState(false);
  const [selectedCols, setSelectedCols]   = useState<Set<string>>(() =>
    new Set(REPORT_COLUMNS["placements"].map((c) => c.key))
  );

  // Reset selected columns when report type changes
  const handleSetReport = (id: ReportType) => {
    setActiveReport(id);
    setPreviewMode(false);
    setSelectedCols(new Set(REPORT_COLUMNS[id].map((c) => c.key)));
  };

  const template = REPORT_TEMPLATES.find((r) => r.id === activeReport)!;
  const Icon = template.icon;

  function toggleCol(key: string) {
    setSelectedCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) { if (next.size > 1) next.delete(key); }
      else next.add(key);
      return next;
    });
  }

  function handleExportCsv() {
    const cols = REPORT_COLUMNS[activeReport].filter((c) => selectedCols.has(c.key));
    const colKeys = cols.map((c) => c.key);
    let rows: Record<string, string | number | null>[] = [];

    if (activeReport === "placements") {
      const filtered = clientFilter === "all" ? placements : placements.filter((p) => p.clientId === clientFilter);
      rows = filtered.map((p) => ({
        candidateName: p.candidateName, jobTitle: p.jobTitle, clientName: p.clientName,
        recruiterName: p.recruiterName, feeAmount: p.feeAmount, currency: p.currency,
        invoiceStatus: p.invoiceStatus, placedAt: p.placedAt ?? null, amountCollected: p.amountCollected,
      }));
    } else if (activeReport === "client_activity" || activeReport === "pipeline_snapshot") {
      rows = jobs.map((j) => ({
        jobTitle: j.title, clientName: j.client?.name ?? null, status: j.status,
        priority: j.priority, candidateCount: j.candidateCount ?? 0,
      }));
    } else if (activeReport === "recruiter_performance") {
      const map: Record<string, { recruiterName: string; placements: number; fees: number }> = {};
      for (const p of placements) {
        const k = p.recruiterName || "Unknown";
        if (!map[k]) map[k] = { recruiterName: k, placements: 0, fees: 0 };
        map[k].placements++; map[k].fees += p.feeAmount;
      }
      rows = Object.values(map);
    }

    exportCsv(`${template.title.replace(/\s+/g, "_")}_${period}.csv`, rows, colKeys);
    toast.success("CSV downloaded");
  }

  function handleSendToClient() {
    toast.success("Report sent to client", {
      description: "A copy has been added to the outreach log.",
    });
  }

  return (
    <div className="flex h-screen overflow-hidden">

      {/* ── Left sidebar: template picker ──────────────────────────────────── */}
      <div className="w-72 shrink-0 border-r border-border bg-card flex flex-col">
        <div className="border-b border-border px-4 py-4">
          <h1 className="text-sm font-bold text-foreground">Reports</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Generate and export reports</p>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {REPORT_TEMPLATES.map((tmpl) => {
            const TIcon = tmpl.icon;
            const active = activeReport === tmpl.id;
            return (
              <button
                key={tmpl.id}
                onClick={() => handleSetReport(tmpl.id)}
                className={cn(
                  "w-full rounded-xl border p-3 text-left transition-all",
                  active
                    ? "border-brand-200 bg-brand-50 shadow-sm"
                    : "border-transparent hover:border-border hover:bg-accent"
                )}
              >
                <div className="flex items-start gap-2.5">
                  <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg mt-0.5", active ? tmpl.bg : "bg-muted/60")}>
                    <TIcon className={cn("h-3.5 w-3.5", active ? tmpl.color : "text-muted-foreground")} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <p className={cn("text-xs font-semibold", active ? "text-foreground" : "text-foreground")}>{tmpl.title}</p>
                      <span className={cn(
                        "rounded-full px-1.5 py-px text-[9px] font-semibold",
                        tmpl.tag === "Client-facing" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                      )}>{tmpl.tag}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-snug line-clamp-2">{tmpl.description}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Recent reports */}
        <div className="border-t border-border p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Recent</p>
          {[
            { name: "Apex Ventures — Q1 2026",   date: "Apr 12" },
            { name: "Recruiter Review — Mar",      date: "Apr 1"  },
            { name: "Pipeline Snapshot",           date: "Mar 28" },
          ].map((r) => (
            <button key={r.name} className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 hover:bg-accent transition-colors">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="text-[11px] text-foreground truncate">{r.name}</span>
              </div>
              <span className="text-[10px] text-muted-foreground shrink-0">{r.date}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Main area ──────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Toolbar */}
        <div className="shrink-0 border-b border-border bg-card px-5 py-3 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg", template.bg)}>
              <Icon className={cn("h-3.5 w-3.5", template.color)} />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground leading-tight">{template.title}</p>
              <p className="text-[10px] text-muted-foreground">{PERIOD_LABELS[period]}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {/* Period selector */}
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as Period)}
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-brand-500"
            >
              {(Object.entries(PERIOD_LABELS) as [Period, string][]).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>

            {/* Client filter (for client-facing reports) */}
            {(activeReport === "placements" || activeReport === "client_activity") && (
              <select
                value={clientFilter}
                onChange={(e) => setClientFilter(e.target.value)}
                className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="all">All Clients</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}

            <button
              onClick={() => setShowConfig((v) => !v)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                showConfig ? "border-brand-300 bg-brand-50 text-brand-700" : "border-border text-muted-foreground hover:bg-accent"
              )}
            >
              <Filter className="h-3.5 w-3.5" />
              Configure
            </button>

            <button
              onClick={() => setPreviewMode((v) => !v)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                previewMode ? "border-brand-300 bg-brand-50 text-brand-700" : "border-border text-muted-foreground hover:bg-accent"
              )}
            >
              <Eye className="h-3.5 w-3.5" />
              {previewMode ? "Editing" : "Preview"}
            </button>

            <button
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>

            <button
              onClick={() => toast.info("PDF export coming soon — use CSV for now")}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
            >
              <Printer className="h-3.5 w-3.5" />
              PDF
            </button>

            {template.tag === "Client-facing" && (
              <button
                onClick={handleSendToClient}
                className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
              >
                <Send className="h-3.5 w-3.5" />
                Send to Client
              </button>
            )}
          </div>
        </div>

        {/* Config panel */}
        {showConfig && (
          <div className="shrink-0 border-b border-border bg-card px-5 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Columns to include</p>
            <div className="flex flex-wrap gap-2">
              {REPORT_COLUMNS[activeReport].map((col) => (
                <button
                  key={col.key}
                  onClick={() => toggleCol(col.key)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    selectedCols.has(col.key)
                      ? "border-brand-300 bg-brand-50 text-brand-700"
                      : "border-border text-muted-foreground hover:bg-accent"
                  )}
                >
                  {selectedCols.has(col.key) && <CheckCircle2 className="h-3 w-3" />}
                  {col.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto">

            {/* Report header (mimics what the client would see) */}
            <div className={cn(
              "rounded-xl border p-5 mb-5 transition-all",
              previewMode ? "border-brand-200 bg-card shadow-lg" : "border-border bg-card"
            )}>
              {previewMode && (
                <div className="flex items-center justify-between mb-5 pb-4 border-b border-border">
                  <div>
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 mb-1">
                      <BadgeCheck className="h-4 w-4 text-white" />
                    </div>
                    <p className="text-[10px] text-muted-foreground">Prepared by Agency · {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-foreground">{template.title}</p>
                    <p className="text-xs text-muted-foreground">{PERIOD_LABELS[period]}</p>
                  </div>
                </div>
              )}

              {activeReport === "placements"           && <PlacementsReportPreview placements={placements} loading={dataLoading} period={period} clientFilter={clientFilter} />}
              {activeReport === "recruiter_performance" && <RecruiterPerformancePreview placements={placements} loading={dataLoading} />}
              {activeReport === "client_activity"       && <ClientActivityPreview placements={placements} jobs={jobs} loading={dataLoading} />}
              {activeReport === "pipeline_snapshot"     && <PipelineSnapshotPreview jobs={jobs} loading={jobsLoading} />}
            </div>

            {/* Notes section */}
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="text-xs font-semibold text-foreground mb-2">Notes / Commentary</p>
              <textarea
                placeholder="Add context or commentary to include with this report…"
                rows={3}
                className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-brand-500"
              />
              <p className="mt-2 text-[10px] text-muted-foreground">Notes are included in PDF exports and client emails.</p>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
