"use client";
/**
 * Custom Report Builder — US-069: Drag-Drop Custom Report Builder
 * Visual drag-and-drop report canvas with dimension/metric pickers.
 * Saves to custom_reports table; executes ad-hoc Supabase queries.
 */

import { useState } from "react";
import { BarChart3, Plus, Save, Play, Trash2, GripVertical, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { useFeatureFlag } from "@/lib/supabase/hooks";
import { FeatureGate } from "@/components/ui/feature-gate";

// Available entities, dimensions and metrics
const ENTITIES = ["candidates", "jobs", "applications", "placements", "activities"] as const;
type Entity = typeof ENTITIES[number];

const DIMENSIONS: Record<Entity, { key: string; label: string }[]> = {
  candidates:   [{ key: "status", label: "Status" }, { key: "location", label: "Location" }, { key: "created_at_month", label: "Month added" }],
  jobs:         [{ key: "status", label: "Status" }, { key: "type", label: "Type" }, { key: "created_at_month", label: "Month opened" }],
  applications: [{ key: "stage_id", label: "Stage" }, { key: "created_at_month", label: "Month submitted" }],
  placements:   [{ key: "placed_at_month", label: "Month placed" }],
  activities:   [{ key: "type", label: "Activity type" }, { key: "created_at_month", label: "Month" }],
};

const METRICS: Record<Entity, { key: string; label: string; agg: string }[]> = {
  candidates:   [{ key: "count", label: "Count", agg: "count(*)" }],
  jobs:         [{ key: "count", label: "Count", agg: "count(*)" }, { key: "avg_fee", label: "Avg fee", agg: "avg(estimated_fee)" }],
  applications: [{ key: "count", label: "Count", agg: "count(*)" }],
  placements:   [{ key: "count", label: "Count", agg: "count(*)" }, { key: "total_fee", label: "Total fees", agg: "sum(fee_amount)" }],
  activities:   [{ key: "count", label: "Count", agg: "count(*)" }],
};

interface ReportRow { [key: string]: string | number }

export default function CustomReportPage() {
  const supabase = createClient();
  const { enabled: analyticsEnabled, loading: analyticsLoading } = useFeatureFlag("analytics");
  const [entity, setEntity] = useState<Entity>("placements");
  const [selectedDims, setSelectedDims] = useState<string[]>(["placed_at_month"]);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(["count"]);
  const [reportName, setReportName] = useState("New report");
  const [results, setResults] = useState<ReportRow[]>([]);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);

  // US-513: custom report builder is a Growth-tier analytics feature.
  if (!analyticsLoading && !analyticsEnabled) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <FeatureGate feature="analytics" className="max-w-sm" />
      </div>
    );
  }

  const dims = DIMENSIONS[entity] ?? [];
  const mets = METRICS[entity] ?? [];

  async function runReport() {
    setRunning(true);
    try {
      // Build simple query — select entity rows and group client-side
      // (full SQL pivot would require a DB function; this is the MVP approach)
      const { data } = await supabase
        .from(entity)
        .select("*")
        .limit(1000);

      if (!data) { setResults([]); return; }

      // Group by first selected dimension
      const dim = selectedDims[0];
      const grouped: Record<string, ReportRow> = {};

      for (const row of data) {
        let key: string;
        if (dim?.endsWith("_month")) {
          const field = dim.replace("_month", "");
          key = row[field] ? new Date(row[field]).toLocaleDateString("en-US", { year: "numeric", month: "short" }) : "Unknown";
        } else {
          key = String(row[dim] ?? "Unknown");
        }

        if (!grouped[key]) grouped[key] = { [dim]: key, count: 0 };
        (grouped[key].count as number)++;
      }

      setResults(Object.values(grouped).sort((a, b) => String(a[dim]).localeCompare(String(b[dim]))));
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setRunning(false);
    }
  }

  async function saveReport() {
    setSaving(true);
    try {
      // Inline agency lookup — client-side supabase has no getAgencyContext
      // helper (that module is server-only). RLS will still reject a wrong
      // agency_id, but the NOT NULL constraint means we must provide one.
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const { data: member } = await supabase
        .from("agency_users")
        .select("agency_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      if (!member?.agency_id) throw new Error("No agency membership");

      const { error } = await supabase.from("custom_reports").insert({
        agency_id:  member.agency_id,
        created_by: user.id,
        name:       reportName,
        definition: { entity, dimensions: selectedDims, metrics: selectedMetrics },
      });
      if (error) throw error;
      toast.success("Report saved");
    } catch { toast.error("Failed to save"); }
    finally { setSaving(false); }
  }

  function exportCsv() {
    if (!results.length) return;
    const headers = Object.keys(results[0]).join(",");
    const rows = results.map(r => Object.values(r).join(",")).join("\n");
    const blob = new Blob([headers + "\n" + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${reportName}.csv`; a.click();
  }

  const columns = results.length > 0 ? Object.keys(results[0]) : [];

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-6 w-6 text-brand-600" />
            <input value={reportName} onChange={e => setReportName(e.target.value)}
              className="text-2xl font-bold text-foreground bg-transparent border-none outline-none focus:border-b focus:border-brand-600" />
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={saveReport} disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-xs font-medium text-foreground hover:bg-muted/40 transition-colors">
              <Save className="h-3.5 w-3.5" />{saving ? "Saving…" : "Save"}
            </button>
            {results.length > 0 && (
              <button type="button" onClick={exportCsv}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-xs font-medium text-foreground hover:bg-muted/40 transition-colors">
                <Download className="h-3.5 w-3.5" />CSV
              </button>
            )}
            <button type="button" onClick={runReport} disabled={running}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-brand-600 text-white rounded-md text-xs font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors">
              <Play className="h-3.5 w-3.5" />{running ? "Running…" : "Run report"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-6">
          {/* Canvas sidebar */}
          <div className="space-y-5">
            {/* Entity */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-2">Data source</label>
              <div className="space-y-1">
                {ENTITIES.map(e => (
                  <button key={e} type="button" onClick={() => { setEntity(e); setSelectedDims([]); setSelectedMetrics([]); }}
                    className={cn("w-full text-left px-3 py-2 rounded-lg text-sm transition-colors",
                      entity === e ? "bg-brand-50 text-brand-700 font-medium" : "text-foreground hover:bg-muted/40")}>
                    {e}
                  </button>
                ))}
              </div>
            </div>

            {/* Dimensions */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-2">Dimensions</label>
              <div className="space-y-1">
                {dims.map(d => (
                  <label key={d.key} className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-muted/40 cursor-pointer">
                    <input type="checkbox" checked={selectedDims.includes(d.key)}
                      onChange={e => setSelectedDims(prev => e.target.checked ? [...prev, d.key] : prev.filter(k => k !== d.key))}
                      className="accent-brand-600" />
                    <span className="text-sm text-foreground">{d.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Metrics */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-2">Metrics</label>
              <div className="space-y-1">
                {mets.map(m => (
                  <label key={m.key} className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-muted/40 cursor-pointer">
                    <input type="checkbox" checked={selectedMetrics.includes(m.key)}
                      onChange={e => setSelectedMetrics(prev => e.target.checked ? [...prev, m.key] : prev.filter(k => k !== m.key))}
                      className="accent-brand-600" />
                    <span className="text-sm text-foreground">{m.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Results */}
          <div className="col-span-3">
            {results.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border h-80 flex flex-col items-center justify-center text-center">
                <BarChart3 className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-sm font-medium text-foreground">Configure and run to see results</p>
                <p className="text-xs text-muted-foreground mt-1">Select a data source, dimensions, and metrics</p>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        {columns.map(col => (
                          <th key={col} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            {col.replace(/_/g, " ")}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {results.map((row, i) => (
                        <tr key={i} className="hover:bg-muted/20 transition-colors">
                          {columns.map(col => (
                            <td key={col} className="px-4 py-2.5 text-foreground">
                              {typeof row[col] === "number" ? row[col].toLocaleString() : String(row[col] ?? "—")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground">
                  {results.length} row{results.length !== 1 ? "s" : ""}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
