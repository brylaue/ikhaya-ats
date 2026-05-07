"use client";

/**
 * /super-admin/feature-flags
 * US-460: Per-tenant feature flag management.
 *
 * Select a tenant, view their plan defaults vs current overrides,
 * and toggle any feature on / off / back to plan default.
 */

import { useState, useEffect } from "react";
import { Search, ToggleLeft, ToggleRight, RotateCcw, ChevronDown } from "lucide-react";

// ─── Feature catalogue (mirrors lib/feature-flags.ts FeatureKey) ─────────────

const FEATURES: Array<{ key: string; label: string; minPlan: string; group: string }> = [
  // Starter
  { key: "candidates",           label: "Candidates",              minPlan: "starter",    group: "Core" },
  { key: "jobs",                 label: "Jobs",                    minPlan: "starter",    group: "Core" },
  { key: "pipeline",             label: "Pipeline",                minPlan: "starter",    group: "Core" },
  { key: "client_portal",        label: "Client Portal",           minPlan: "starter",    group: "Core" },
  { key: "email_outreach",       label: "Email Outreach",          minPlan: "starter",    group: "Core" },
  { key: "tags",                 label: "Tags",                    minPlan: "starter",    group: "Core" },
  { key: "custom_fields",        label: "Custom Fields",           minPlan: "starter",    group: "Core" },
  { key: "duplicate_detection",  label: "Duplicate Detection",     minPlan: "starter",    group: "Core" },
  // Growth
  { key: "ai_match_scoring",     label: "AI Match Scoring",        minPlan: "growth",     group: "Growth" },
  { key: "workflow_automation",  label: "Workflow Automation",     minPlan: "growth",     group: "Growth" },
  { key: "analytics",            label: "Analytics",               minPlan: "growth",     group: "Growth" },
  { key: "submission_pack",      label: "Submission Packs",        minPlan: "growth",     group: "Growth" },
  { key: "scorecard_templates",  label: "Scorecard Templates",     minPlan: "growth",     group: "Growth" },
  { key: "candidate_compare",    label: "Candidate Compare",       minPlan: "growth",     group: "Growth" },
  { key: "saved_searches",       label: "Saved Searches",          minPlan: "growth",     group: "Growth" },
  // Pro
  { key: "multi_meeting_integration", label: "Meeting Integration", minPlan: "pro",       group: "Pro" },
  { key: "esignature_integration",    label: "eSignature",          minPlan: "pro",       group: "Pro" },
  { key: "candidate_login_portal",    label: "Candidate Login Portal", minPlan: "pro",    group: "Pro" },
  { key: "advanced_reporting",        label: "Advanced Reporting",  minPlan: "pro",       group: "Pro" },
  { key: "api_access",                label: "API Access",          minPlan: "pro",       group: "Pro" },
  // Enterprise
  { key: "sso",                  label: "SSO",                     minPlan: "enterprise", group: "Enterprise" },
  { key: "custom_branding",      label: "Custom Branding",         minPlan: "enterprise", group: "Enterprise" },
  { key: "dedicated_support",    label: "Dedicated Support",       minPlan: "enterprise", group: "Enterprise" },
  { key: "sla_guarantee",        label: "SLA Guarantee",           minPlan: "enterprise", group: "Enterprise" },
];

const PLAN_RANK: Record<string, number> = { starter: 0, growth: 1, pro: 2, enterprise: 3 };

function planDefault(plan: string, minPlan: string): boolean {
  return (PLAN_RANK[plan] ?? 0) >= (PLAN_RANK[minPlan] ?? 0);
}

interface Tenant { id: string; name: string; plan: string; }

const GROUP_ORDER = ["Core", "Growth", "Pro", "Enterprise"];

export default function FeatureFlagsPage() {
  const [tenants, setTenants]         = useState<Tenant[]>([]);
  const [selected, setSelected]       = useState<Tenant | null>(null);
  const [overrides, setOverrides]     = useState<Record<string, boolean | null>>({});
  const [loading, setLoading]         = useState(false);
  const [saving, setSaving]           = useState<string | null>(null);
  const [search, setSearch]           = useState("");

  // Load tenant list
  useEffect(() => {
    fetch("/api/super-admin/tenants")
      .then(r => r.json())
      .then(d => setTenants(d.tenants ?? []));
  }, []);

  // Load flags for selected tenant
  function loadFlags(tenant: Tenant) {
    setSelected(tenant);
    setLoading(true);
    fetch(`/api/super-admin/tenants/${tenant.id}/feature-flags`)
      .then(r => r.json())
      .then(d => { setOverrides(d.overrides ?? {}); setLoading(false); })
      .catch(() => setLoading(false));
  }

  async function toggle(feature: string, newVal: boolean | null) {
    if (!selected) return;
    setSaving(feature);
    const res = await fetch(`/api/super-admin/tenants/${selected.id}/feature-flags`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feature, enabled: newVal }),
    });
    const data = await res.json();
    if (data.ok) setOverrides(data.overrides ?? {});
    setSaving(null);
  }

  const filteredFeatures = FEATURES.filter(f =>
    f.label.toLowerCase().includes(search.toLowerCase()) ||
    f.key.toLowerCase().includes(search.toLowerCase())
  );

  const groups = GROUP_ORDER.filter(g => filteredFeatures.some(f => f.group === g));

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Feature Flags</h1>
        <p className="mt-0.5 text-sm text-slate-400">Override plan defaults for individual tenants</p>
      </div>

      <div className="flex gap-6">
        {/* Tenant picker */}
        <div className="w-56 shrink-0">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Select Tenant</p>
          <div className="space-y-0.5 max-h-[calc(100vh-240px)] overflow-y-auto pr-1">
            {tenants.map(t => (
              <button
                key={t.id}
                onClick={() => loadFlags(t)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  selected?.id === t.id
                    ? "bg-indigo-900/50 text-indigo-200 border border-indigo-700"
                    : "text-slate-300 hover:bg-slate-800"
                }`}
              >
                <p className="font-medium truncate">{t.name}</p>
                <p className="text-[10px] text-slate-500 capitalize">{t.plan}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Flags table */}
        <div className="flex-1">
          {!selected ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-12 text-center text-slate-500 text-sm">
              Select a tenant to manage their feature flags
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-4">
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search features…"
                    className="w-full rounded-md border border-slate-700 bg-slate-900 pl-9 pr-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <span className="text-xs text-slate-500">
                  {Object.keys(overrides).length} override{Object.keys(overrides).length !== 1 ? "s" : ""} active
                </span>
              </div>

              {loading ? (
                <p className="text-sm text-slate-500">Loading flags…</p>
              ) : (
                <div className="space-y-4">
                  {groups.map(group => (
                    <div key={group} className="rounded-xl border border-slate-800 overflow-hidden">
                      <div className="bg-slate-800/60 px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        {group}
                      </div>
                      <div className="divide-y divide-slate-800">
                        {filteredFeatures.filter(f => f.group === group).map(feat => {
                          const def  = planDefault(selected.plan, feat.minPlan);
                          const over = overrides[feat.key];
                          const effective = over !== undefined && over !== null ? over : def;
                          const hasOverride = over !== undefined && over !== null;
                          const isSaving = saving === feat.key;

                          return (
                            <div key={feat.key} className="flex items-center justify-between px-4 py-3 hover:bg-slate-800/20">
                              <div>
                                <p className="text-sm text-white">{feat.label}</p>
                                <p className="text-[11px] text-slate-500 font-mono">{feat.key}</p>
                              </div>
                              <div className="flex items-center gap-3">
                                {hasOverride && (
                                  <span className="text-[10px] rounded-full bg-amber-900/50 text-amber-300 px-2 py-0.5">
                                    override
                                  </span>
                                )}
                                <span className="text-xs text-slate-500">
                                  plan default: <span className={def ? "text-emerald-400" : "text-slate-600"}>{def ? "on" : "off"}</span>
                                </span>
                                {/* Reset to default */}
                                {hasOverride && (
                                  <button
                                    onClick={() => toggle(feat.key, null)}
                                    disabled={!!isSaving}
                                    className="p-1 rounded text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-40"
                                    title="Reset to plan default"
                                  >
                                    <RotateCcw className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                {/* Toggle */}
                                <button
                                  onClick={() => toggle(feat.key, !effective)}
                                  disabled={!!isSaving}
                                  className="disabled:opacity-40 transition-colors"
                                  title={effective ? "Disable" : "Enable"}
                                >
                                  {effective
                                    ? <ToggleRight className="h-6 w-6 text-indigo-400" />
                                    : <ToggleLeft  className="h-6 w-6 text-slate-600"   />
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
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
