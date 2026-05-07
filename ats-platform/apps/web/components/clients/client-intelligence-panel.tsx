"use client";

/**
 * ClientIntelligencePanel — US-156 + US-221 + US-481
 *
 * Tabbed panel for the client detail page covering:
 *   - Health Score (US-156): computed risk level + score breakdown
 *   - SLA Config (US-221): configurable SLA targets per client
 *   - Firmographic Enrichment (US-481): company intel overlay
 *
 * Embedded in the clients/[id] page as an "Intelligence" tab.
 */

import { useState } from "react";
import {
  Activity, Clock, Building2, ThumbsUp, AlertTriangle,
  Shield, Save, ExternalLink, Plus, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useClientSlaConfig, useCompanyEnrichment, useClientHealthScores } from "@/lib/supabase/hooks";
import { toast } from "sonner";

// ── Health Score ──────────────────────────────────────────────────────────────

const RISK_CONFIG = {
  low:      { label: "Low risk",      color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
  medium:   { label: "Moderate risk", color: "text-amber-600",   bg: "bg-amber-50",   border: "border-amber-200" },
  high:     { label: "High risk",     color: "text-orange-600",  bg: "bg-orange-50",  border: "border-orange-200" },
  critical: { label: "Critical",      color: "text-red-600",     bg: "bg-red-50",     border: "border-red-200" },
};

const FLAG_LABELS: Record<string, string> = {
  no_contact_60d:    "No contact in 60 days",
  no_contact_30d:    "No contact in 30 days",
  invoice_overdue:   "Invoice overdue",
  no_active_roles:   "No active roles",
  no_placements_12mo:"No placements in 12 months",
  low_revenue:       "Revenue below average",
};

interface ScoreBarProps { label: string; value: number; color?: string }
function ScoreBar({ label, value, color = "bg-brand-600" }: ScoreBarProps) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium text-foreground">{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function HealthScoreSection({ companyId }: { companyId: string }) {
  const { scores } = useClientHealthScores();
  const score = scores.find((s) => s.companyId === companyId);

  if (!score) {
    return (
      <div className="text-center py-8">
        <Activity className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Health score not computed yet.</p>
        <p className="text-xs text-muted-foreground mt-1">Scores are computed nightly based on activity signals.</p>
      </div>
    );
  }

  const risk = RISK_CONFIG[score.riskLevel];

  return (
    <div className="space-y-6">
      {/* Score badge */}
      <div className={cn("rounded-xl border p-5 flex items-center gap-5", risk.bg, risk.border)}>
        <div className="text-center">
          <div className={cn("text-4xl font-bold", risk.color)}>{score.score}</div>
          <div className={cn("text-xs font-semibold mt-0.5", risk.color)}>/100</div>
        </div>
        <div className="flex-1">
          <p className={cn("font-semibold text-base", risk.color)}>{risk.label}</p>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            {score.scoreDelta !== 0 && (
              <span className={score.scoreDelta > 0 ? "text-emerald-600" : "text-red-500"}>
                {score.scoreDelta > 0 ? "+" : ""}{score.scoreDelta} vs prior period
              </span>
            )}
            <span>Updated {new Date(score.computedAt).toLocaleDateString()}</span>
          </div>
          {/* Risk flags */}
          {score.riskFlags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {score.riskFlags.map((flag) => (
                <span key={flag} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-white/70 border border-current text-orange-600">
                  <AlertTriangle className="h-2.5 w-2.5" />
                  {FLAG_LABELS[flag] ?? flag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Score breakdown */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Score breakdown</p>
        <ScoreBar label="Active roles"       value={score.activeRolesScore} color="bg-indigo-500" />
        <ScoreBar label="Placements (12mo)"  value={score.placementScore}   color="bg-violet-500" />
        <ScoreBar label="Engagement"         value={score.engagementScore}  color="bg-blue-500"   />
        <ScoreBar label="Revenue"            value={score.revenueScore}     color="bg-brand-600"  />
      </div>

      {/* Signals */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div className="rounded-lg bg-muted/50 p-3">
          <p className="text-xs text-muted-foreground">Active roles</p>
          <p className="text-lg font-bold text-foreground">{score.activeRoleCount}</p>
        </div>
        <div className="rounded-lg bg-muted/50 p-3">
          <p className="text-xs text-muted-foreground">Placements (12mo)</p>
          <p className="text-lg font-bold text-foreground">{score.placements12mo}</p>
        </div>
        <div className="rounded-lg bg-muted/50 p-3">
          <p className="text-xs text-muted-foreground">Days since contact</p>
          <p className="text-lg font-bold text-foreground">{score.daysSinceContact ?? "—"}</p>
        </div>
        <div className="rounded-lg bg-muted/50 p-3">
          <p className="text-xs text-muted-foreground">Revenue (12mo)</p>
          <p className="text-lg font-bold text-foreground">
            ${(score.revenue12mo / 1000).toFixed(1)}k
          </p>
        </div>
      </div>
    </div>
  );
}

// ── SLA Config ────────────────────────────────────────────────────────────────

function SlaConfigSection({ companyId }: { companyId: string }) {
  const { config, loading, saveConfig } = useClientSlaConfig(companyId);
  const [form, setForm] = useState<{
    submittralDays: string;
    clientResponseDays: string;
    offerDecisionDays: string;
    alertOnBreach: boolean;
    notes: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  // Initialise form from config once loaded
  const displayConfig = form ?? {
    submittralDays: String(config?.submittralDays ?? 5),
    clientResponseDays: String(config?.clientResponseDays ?? 3),
    offerDecisionDays: String(config?.offerDecisionDays ?? 10),
    alertOnBreach: config?.alertOnBreach ?? true,
    notes: config?.notes ?? "",
  };

  async function handleSave() {
    setSaving(true);
    try {
      await saveConfig({
        submittralDays: Number(displayConfig.submittralDays),
        clientResponseDays: Number(displayConfig.clientResponseDays),
        offerDecisionDays: Number(displayConfig.offerDecisionDays),
        alertOnBreach: displayConfig.alertOnBreach,
        notes: displayConfig.notes || null,
      });
      toast.success("SLA config saved");
    } catch {
      toast.error("Failed to save SLA config");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="h-40 animate-pulse rounded-lg bg-muted" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/40 rounded-lg px-4 py-3">
        <Clock className="h-4 w-4 shrink-0" />
        <p>SLA targets define expected turnaround times and trigger alerts when breached.</p>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "CV submittal (days after req open)", key: "submittralDays", hint: "Business days" },
            { label: "Client feedback (days after submission)", key: "clientResponseDays", hint: "Business days" },
            { label: "Offer decision (days after first interview)", key: "offerDecisionDays", hint: "Business days" },
          ].map(({ label, key, hint }) => (
            <div key={key}>
              <label className="text-xs font-medium text-foreground block mb-1">{label}</label>
              <input
                type="number"
                min={1}
                max={90}
                value={displayConfig[key as keyof typeof displayConfig] as string}
                onChange={(e) => setForm((f) => ({ ...(f ?? displayConfig), [key]: e.target.value }))}
                className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 bg-card"
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>
            </div>
          ))}
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={displayConfig.alertOnBreach}
            onChange={(e) => setForm((f) => ({ ...(f ?? displayConfig), alertOnBreach: e.target.checked }))}
            className="rounded text-brand-600 focus:ring-brand-600"
          />
          <span className="text-sm text-foreground">Alert recruiter when SLA is breached</span>
        </label>

        <div>
          <label className="text-xs font-medium text-foreground block mb-1">Notes</label>
          <textarea
            rows={2}
            value={displayConfig.notes}
            onChange={(e) => setForm((f) => ({ ...(f ?? displayConfig), notes: e.target.value }))}
            placeholder="Any special agreements or exceptions..."
            className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 bg-card resize-none"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white rounded-md text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
      >
        <Save className="h-3.5 w-3.5" />
        {saving ? "Saving…" : "Save SLA config"}
      </button>
    </div>
  );
}

// ── Enrichment ────────────────────────────────────────────────────────────────

function EnrichmentSection({ companyId }: { companyId: string }) {
  const { enrichment, loading, saveEnrichment } = useCompanyEnrichment(companyId);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    employeeRange: "",
    revenueRange: "",
    fundingStage: "",
    foundedYear: "",
    industry: "",
    subIndustry: "",
    hqCity: "",
    hqCountry: "",
    linkedinUrl: "",
    crunchbaseUrl: "",
    technologies: [] as string[],
    notes: "",
  });
  const [techInput, setTechInput] = useState("");
  const [saving, setSaving] = useState(false);

  function openEdit() {
    setForm({
      employeeRange: enrichment?.employeeRange ?? "",
      revenueRange: enrichment?.revenueRange ?? "",
      fundingStage: enrichment?.fundingStage ?? "",
      foundedYear: String(enrichment?.foundedYear ?? ""),
      industry: enrichment?.industry ?? "",
      subIndustry: enrichment?.subIndustry ?? "",
      hqCity: enrichment?.hqCity ?? "",
      hqCountry: enrichment?.hqCountry ?? "",
      linkedinUrl: enrichment?.linkedinUrl ?? "",
      crunchbaseUrl: enrichment?.crunchbaseUrl ?? "",
      technologies: enrichment?.technologies ?? [],
      notes: enrichment?.notes ?? "",
    });
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveEnrichment({
        employeeRange: form.employeeRange || null,
        revenueRange: form.revenueRange || null,
        fundingStage: form.fundingStage || null,
        foundedYear: form.foundedYear ? Number(form.foundedYear) : null,
        industry: form.industry || null,
        subIndustry: form.subIndustry || null,
        hqCity: form.hqCity || null,
        hqCountry: form.hqCountry || null,
        linkedinUrl: form.linkedinUrl || null,
        crunchbaseUrl: form.crunchbaseUrl || null,
        technologies: form.technologies,
        notes: form.notes || null,
        source: "manual",
      });
      setEditing(false);
      toast.success("Enrichment saved");
    } catch {
      toast.error("Failed to save enrichment");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="h-40 animate-pulse rounded-lg bg-muted" />;

  if (!enrichment && !editing) {
    return (
      <div className="text-center py-8">
        <Building2 className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm font-medium text-foreground mb-1">No firmographic data</p>
        <p className="text-xs text-muted-foreground mb-4">Add company intel to power BD prioritisation.</p>
        <button
          type="button"
          onClick={openEdit}
          className="flex items-center gap-1.5 mx-auto px-4 py-2 bg-brand-600 text-white rounded-md text-sm font-medium hover:bg-brand-700"
        >
          <Plus className="h-3.5 w-3.5" />
          Add firmographic data
        </button>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {[
            { label: "Employee range", key: "employeeRange", placeholder: "e.g. 50-200" },
            { label: "Revenue range", key: "revenueRange", placeholder: "e.g. $10M-$50M" },
            { label: "Industry", key: "industry", placeholder: "e.g. FinTech" },
            { label: "Sub-industry", key: "subIndustry", placeholder: "e.g. Payments" },
            { label: "HQ city", key: "hqCity", placeholder: "e.g. San Francisco" },
            { label: "HQ country", key: "hqCountry", placeholder: "e.g. USA" },
            { label: "Founded year", key: "foundedYear", placeholder: "e.g. 2018" },
            { label: "Funding stage", key: "fundingStage", placeholder: "e.g. Series B" },
          ].map(({ label, key, placeholder }) => (
            <div key={key}>
              <label className="text-xs font-medium text-foreground block mb-1">{label}</label>
              <input
                type="text"
                value={form[key as keyof typeof form] as string}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder}
                className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 bg-card"
              />
            </div>
          ))}
        </div>

        <div>
          <label className="text-xs font-medium text-foreground block mb-1">Technologies</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {form.technologies.map((t) => (
              <span key={t} className="flex items-center gap-1 text-xs bg-muted rounded-full px-2.5 py-0.5">
                {t}
                <button type="button" onClick={() => setForm((f) => ({ ...f, technologies: f.technologies.filter((x) => x !== t) }))}>
                  <X className="h-2.5 w-2.5 text-muted-foreground hover:text-red-500" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={techInput}
              onChange={(e) => setTechInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && techInput.trim()) {
                  e.preventDefault();
                  setForm((f) => ({ ...f, technologies: [...f.technologies, techInput.trim()] }));
                  setTechInput("");
                }
              }}
              placeholder="Add technology, press Enter"
              className="flex-1 px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 bg-card"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">LinkedIn URL</label>
            <input type="url" value={form.linkedinUrl} onChange={(e) => setForm((f) => ({ ...f, linkedinUrl: e.target.value }))} placeholder="https://linkedin.com/company/..." className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 bg-card" />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">Crunchbase URL</label>
            <input type="url" value={form.crunchbaseUrl} onChange={(e) => setForm((f) => ({ ...f, crunchbaseUrl: e.target.value }))} placeholder="https://crunchbase.com/organization/..." className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 bg-card" />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-foreground block mb-1">Notes</label>
          <textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Additional intel..." className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 bg-card resize-none" />
        </div>

        <div className="flex gap-2">
          <button type="button" onClick={handleSave} disabled={saving} className="px-4 py-2 bg-brand-600 text-white rounded-md text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
        </div>
      </div>
    );
  }

  // Read view
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Firmographic data</p>
        <button type="button" onClick={openEdit} className="text-xs text-brand-600 hover:text-brand-700 font-medium">Edit</button>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        {[
          { label: "Employees", value: enrichment?.employeeRange },
          { label: "Revenue", value: enrichment?.revenueRange },
          { label: "Industry", value: enrichment?.industry },
          { label: "Funding", value: enrichment?.fundingStage },
          { label: "HQ", value: [enrichment?.hqCity, enrichment?.hqCountry].filter(Boolean).join(", ") || null },
          { label: "Founded", value: enrichment?.foundedYear ? String(enrichment.foundedYear) : null },
        ].map(({ label, value }) => value ? (
          <div key={label}>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="font-medium text-foreground">{value}</p>
          </div>
        ) : null)}
      </div>

      {enrichment?.technologies && enrichment.technologies.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-1.5">Technologies</p>
          <div className="flex flex-wrap gap-1.5">
            {enrichment.technologies.map((t) => (
              <span key={t} className="text-xs bg-muted rounded-full px-2.5 py-0.5">{t}</span>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        {enrichment?.linkedinUrl && (
          <a href={enrichment.linkedinUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-brand-600 hover:underline">
            <ExternalLink className="h-3 w-3" />LinkedIn
          </a>
        )}
        {enrichment?.crunchbaseUrl && (
          <a href={enrichment.crunchbaseUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-brand-600 hover:underline">
            <ExternalLink className="h-3 w-3" />Crunchbase
          </a>
        )}
      </div>

      {enrichment?.notes && (
        <p className="text-xs text-foreground/70 italic border-t border-border pt-3">{enrichment.notes}</p>
      )}
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────

type Tab = "health" | "sla" | "enrichment";

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "health",     label: "Health Score",  icon: Activity    },
  { key: "sla",        label: "SLA Targets",   icon: Clock       },
  { key: "enrichment", label: "Company Intel", icon: Building2   },
];

interface Props {
  companyId: string;
}

export function ClientIntelligencePanel({ companyId }: Props) {
  const [tab, setTab] = useState<Tab>("health");

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 bg-muted/50 rounded-lg p-1 mb-6">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-colors",
              tab === key
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === "health"     && <HealthScoreSection companyId={companyId} />}
      {tab === "sla"        && <SlaConfigSection companyId={companyId} />}
      {tab === "enrichment" && <EnrichmentSection companyId={companyId} />}
    </div>
  );
}
