"use client";

/**
 * AlertsSettings — configure alert rules and view recent alert events.
 */

import { useState } from "react";
import {
  AlertTriangle, Bell, Plus, Trash2, Loader2,
  CheckCircle2, Info, X, ToggleLeft, ToggleRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useAlertRules, useAlertEvents,
  type AlertTriggerType, type AlertSeverity,
} from "@/lib/supabase/hooks";
import { toast } from "sonner";

const TRIGGER_LABELS: Record<AlertTriggerType, { label: string; description: string; defaultConditions: Record<string, unknown> }> = {
  candidate_stale:               { label: "Candidate stale",              description: "No activity on a candidate for N days",                defaultConditions: { days: 7 }                        },
  sla_breach:                    { label: "SLA breach",                   description: "Pipeline stage exceeds its target duration",           defaultConditions: { multiplier: 1.5 }                 },
  no_submission:                 { label: "No submission",                description: "Job open for N days with no candidate submitted",      defaultConditions: { days: 10 }                        },
  approaching_fill_date:         { label: "Approaching fill date",        description: "Job fill date is within N days",                       defaultConditions: { days_before: 14 }                 },
  interview_no_feedback:         { label: "Interview — no feedback",      description: "Interview passed, no scorecard after N days",          defaultConditions: { days: 2 }                         },
  offer_expiring:                { label: "Offer expiring",               description: "Offer letter expires within N days",                   defaultConditions: { days_before: 3 }                  },
  no_new_candidates:             { label: "No new candidates",            description: "Job open N days with fewer than min_count candidates", defaultConditions: { days: 7, min_count: 3 }           },
  placement_guarantee_expiring:  { label: "Guarantee expiring",          description: "Placement guarantee period ends within N days",         defaultConditions: { days_before: 14 }                 },
};

const SEVERITY_CFG: Record<AlertSeverity, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  info:     { label: "Info",     color: "text-brand-700",    bg: "bg-brand-100",    icon: Info         },
  warning:  { label: "Warning",  color: "text-amber-700",   bg: "bg-amber-100",   icon: AlertTriangle },
  critical: { label: "Critical", color: "text-red-700",     bg: "bg-red-100",     icon: X            },
};

export function AlertsSettings() {
  const { rules, loading: rulesLoading, createRule, toggleRule, deleteRule } = useAlertRules();
  const { events, activeCount, loading: eventsLoading, dismiss, dismissAll } = useAlertEvents(false);
  const [tab,        setTab]        = useState<"rules" | "events">("rules");
  const [showForm,   setShowForm]   = useState(false);
  const [saving,     setSaving]     = useState(false);

  // New rule form state
  const [newTrigger,   setNewTrigger]   = useState<AlertTriggerType>("candidate_stale");
  const [newSeverity,  setNewSeverity]  = useState<AlertSeverity>("warning");
  const [newName,      setNewName]      = useState("");
  const [newConditions,setNewConditions]= useState<Record<string, unknown>>({ days: 7 });

  function handleTriggerChange(t: AlertTriggerType) {
    setNewTrigger(t);
    setNewConditions(TRIGGER_LABELS[t].defaultConditions);
    if (!newName || Object.values(TRIGGER_LABELS).some((tl) => tl.label === newName)) {
      setNewName(TRIGGER_LABELS[t].label);
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    setSaving(true);
    const result = await createRule({
      name:            newName.trim(),
      description:     null,
      triggerType:     newTrigger,
      conditions:      newConditions,
      severity:        newSeverity,
      notifyRoles:     ["owner", "admin"],
      notifyAssignee:  true,
      isActive:        true,
    });
    if ("error" in result) { toast.error(result.error ?? "Failed to save"); }
    else { toast.success("Alert rule created"); setShowForm(false); setNewName(""); }
    setSaving(false);
  }

  if (rulesLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-0 border-b border-border">
        {(["rules", "events"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === t ? "border-brand-600 text-brand-600" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t === "rules"  && "Alert Rules"}
            {t === "events" && <>Active Alerts {activeCount > 0 && <span className="ml-1 rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-bold text-red-700">{activeCount}</span>}</>}
          </button>
        ))}
      </div>

      {/* ── Rules ── */}
      {tab === "rules" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setShowForm((p) => !p)} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors">
              <Plus className="h-4 w-4" />{showForm ? "Cancel" : "New Rule"}
            </button>
          </div>

          {showForm && (
            <div className="rounded-xl border border-brand-200 bg-brand-50/30 p-5 space-y-4">
              <p className="text-sm font-semibold text-foreground">New Alert Rule</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Trigger type</label>
                  <select
                    value={newTrigger}
                    onChange={(e) => handleTriggerChange(e.target.value as AlertTriggerType)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    {(Object.entries(TRIGGER_LABELS) as [AlertTriggerType, typeof TRIGGER_LABELS[AlertTriggerType]][]).map(([key, cfg]) => (
                      <option key={key} value={key}>{cfg.label}</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-muted-foreground">{TRIGGER_LABELS[newTrigger].description}</p>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Rule name</label>
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Warn if candidate stale 7 days"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Severity</label>
                  <select
                    value={newSeverity}
                    onChange={(e) => setNewSeverity(e.target.value as AlertSeverity)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    {(["info","warning","critical"] as AlertSeverity[]).map((s) => (
                      <option key={s} value={s} className="capitalize">{SEVERITY_CFG[s].label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Conditions (JSON)</label>
                  <input
                    value={JSON.stringify(newConditions)}
                    onChange={(e) => { try { setNewConditions(JSON.parse(e.target.value)); } catch { /* no-op */ } }}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>
              <button onClick={handleCreate} disabled={!newName.trim() || saving} className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}Create Rule
              </button>
            </div>
          )}

          {rules.length === 0 && !showForm ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Bell className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No alert rules configured.</p>
              <p className="text-xs text-muted-foreground">Create rules to get notified when pipeline conditions need attention.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {rules.map((rule) => {
                const sev = SEVERITY_CFG[rule.severity];
                const SevIcon = sev.icon;
                return (
                  <div key={rule.id} className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
                    <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", sev.bg)}>
                      <SevIcon className={cn("h-4 w-4", sev.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-foreground">{rule.name}</p>
                        <span className={cn("rounded-full px-2 py-0.5 text-[9px] font-semibold capitalize", sev.bg, sev.color)}>{sev.label}</span>
                        {!rule.isActive && <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] font-semibold text-muted-foreground">Disabled</span>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{TRIGGER_LABELS[rule.triggerType]?.description}</p>
                      <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{JSON.stringify(rule.conditions)}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => toggleRule(rule.id, !rule.isActive)} className="rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors" title={rule.isActive ? "Disable" : "Enable"}>
                        {rule.isActive ? <ToggleRight className="h-5 w-5 text-brand-600" /> : <ToggleLeft className="h-5 w-5" />}
                      </button>
                      <button onClick={() => deleteRule(rule.id)} className="rounded-md p-1 text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Events ── */}
      {tab === "events" && (
        <div className="space-y-4">
          {events.filter((e) => !e.dismissed).length > 0 && (
            <div className="flex justify-end">
              <button onClick={dismissAll} className="text-xs text-muted-foreground hover:text-foreground transition-colors underline">
                Dismiss all
              </button>
            </div>
          )}
          {eventsLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-400/50" />
              <p className="text-sm text-muted-foreground">No alerts. Everything looks good!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {events.map((event) => {
                const sev = SEVERITY_CFG[event.severity];
                const SevIcon = sev.icon;
                return (
                  <div key={event.id} className={cn(
                    "flex items-start gap-3 rounded-xl border p-4 transition-opacity",
                    event.dismissed ? "opacity-40 border-border" : "border-border bg-card"
                  )}>
                    <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full", sev.bg)}>
                      <SevIcon className={cn("h-3.5 w-3.5", sev.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground">{event.message}</p>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                        <span>{event.ruleName}</span>
                        <span>·</span>
                        <span>{new Date(event.createdAt).toLocaleString()}</span>
                        {event.dismissed && <><span>·</span><span className="text-emerald-600">Dismissed</span></>}
                      </div>
                    </div>
                    {!event.dismissed && (
                      <button onClick={() => dismiss(event.id)} className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
