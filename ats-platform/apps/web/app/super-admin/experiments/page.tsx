"use client";

/**
 * /super-admin/experiments
 * US-511: A/B test / percentage-rollout console.
 *
 * Lists experiments with controls to start/pause/complete and tweak rollout %.
 * "New Experiment" form supports key, name, variants (with weights), targeting.
 */
import { useState, useEffect } from "react";
import { FlaskConical, RefreshCw, Plus, Play, Pause, CheckCircle2, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Variant { key: string; weight: number }

interface Experiment {
  id:                 string;
  key:                string;
  name:               string;
  description:        string | null;
  variants:           Variant[];
  rollout_pct:        number;
  target_plans:       string[] | null;
  agency_allowlist:   string[] | null;
  agency_denylist:    string[] | null;
  status:             "draft" | "running" | "paused" | "completed";
  created_at:         string;
  started_at:         string | null;
  ended_at:           string | null;
  assignmentsTotal:   number;
  assignmentsByVariant: Record<string, number>;
}

const STATUS_STYLES: Record<string, string> = {
  draft:     "bg-slate-700 text-slate-300",
  running:   "bg-emerald-900 text-emerald-300",
  paused:    "bg-amber-900 text-amber-300",
  completed: "bg-sky-900 text-sky-300",
};

export default function ExperimentsPage() {
  const [experiments, setExps] = useState<Experiment[]>([]);
  const [loading, setLoad]     = useState(true);
  const [showNew, setShowNew]  = useState(false);

  function load() {
    setLoad(true);
    fetch("/api/super-admin/experiments")
      .then(r => r.json())
      .then(d => { setExps(d.experiments ?? []); setLoad(false); })
      .catch(() => setLoad(false));
  }
  useEffect(load, []);

  async function setStatus(id: string, status: Experiment["status"]) {
    const res = await fetch(`/api/super-admin/experiments/${id}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }),
    });
    const d = await res.json();
    if (d.experiment) { toast.success(`Set to ${status}`); load(); }
    else toast.error(d.error ?? "Failed");
  }

  async function setRollout(id: string, pct: number) {
    const res = await fetch(`/api/super-admin/experiments/${id}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ rollout_pct: pct }),
    });
    const d = await res.json();
    if (d.experiment) load();
    else toast.error(d.error ?? "Failed");
  }

  async function deleteExp(id: string) {
    if (!confirm("Delete experiment + all assignments?")) return;
    const res = await fetch(`/api/super-admin/experiments/${id}`, { method: "DELETE" });
    const d = await res.json();
    if (d.ok) { toast.success("Deleted"); load(); }
    else toast.error(d.error ?? "Failed");
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <FlaskConical className="h-6 w-6 text-violet-400" /> Experiments
          </h1>
          <p className="mt-0.5 text-sm text-slate-400">
            A/B tests &amp; percentage rollouts. Resolved at runtime via <code className="text-indigo-300">useExperiment(key)</code>.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowNew(s => !s)}
            className="flex items-center gap-1.5 rounded-md border border-indigo-700 bg-indigo-950/50 px-3 py-1.5 text-xs text-indigo-300 hover:bg-indigo-900/50">
            <Plus className="h-3.5 w-3.5" /> New Experiment
          </button>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-40">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      {showNew && <NewExperimentForm onCreated={() => { setShowNew(false); load(); }} onCancel={() => setShowNew(false)} />}

      {loading ? (
        <p className="text-slate-500 text-sm">Loading…</p>
      ) : experiments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-700 p-10 text-center">
          <FlaskConical className="h-8 w-8 mx-auto text-slate-600 mb-3" />
          <p className="text-slate-400 text-sm">No experiments yet. Create one to start a percentage rollout or A/B test.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {experiments.map(e => (
            <div key={e.id} className="rounded-xl border border-slate-800 bg-slate-900 p-5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <code className="text-sm font-mono text-indigo-300">{e.key}</code>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_STYLES[e.status]}`}>{e.status}</span>
                  </div>
                  <h3 className="text-base font-semibold text-white">{e.name}</h3>
                  {e.description && <p className="text-xs text-slate-400 mt-1">{e.description}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  {e.status === "draft" && (
                    <button onClick={() => setStatus(e.id, "running")} title="Start"
                      className="p-1.5 rounded border border-emerald-700 bg-emerald-950/50 text-emerald-300 hover:bg-emerald-900/50">
                      <Play className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {e.status === "running" && (
                    <>
                      <button onClick={() => setStatus(e.id, "paused")} title="Pause"
                        className="p-1.5 rounded border border-amber-700 bg-amber-950/50 text-amber-300 hover:bg-amber-900/50">
                        <Pause className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => setStatus(e.id, "completed")} title="Complete"
                        className="p-1.5 rounded border border-sky-700 bg-sky-950/50 text-sky-300 hover:bg-sky-900/50">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                  {e.status === "paused" && (
                    <button onClick={() => setStatus(e.id, "running")} title="Resume"
                      className="p-1.5 rounded border border-emerald-700 bg-emerald-950/50 text-emerald-300 hover:bg-emerald-900/50">
                      <Play className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button onClick={() => deleteExp(e.id)} title="Delete"
                    className="p-1.5 rounded border border-slate-700 text-slate-500 hover:text-red-300 hover:bg-red-950/30">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 text-xs">
                {/* Rollout % */}
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Rollout</div>
                  <div className="flex items-center gap-2">
                    <input type="range" min={0} max={100} value={e.rollout_pct}
                      onChange={ev => setRollout(e.id, parseInt(ev.target.value, 10))}
                      className="flex-1 accent-indigo-600" />
                    <span className="text-white tabular-nums w-9 text-right">{e.rollout_pct}%</span>
                  </div>
                </div>

                {/* Variants */}
                <div className="col-span-2">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Variants &amp; assignments</div>
                  <div className="flex flex-wrap gap-2">
                    {e.variants.map(v => (
                      <span key={v.key} className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-slate-300">
                        <span className="font-mono text-indigo-300">{v.key}</span>
                        <span className="text-slate-500 ml-2">w={v.weight}</span>
                        <span className="text-emerald-300 ml-2 tabular-nums">{e.assignmentsByVariant[v.key] ?? 0}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-500">
                <span>Total assigned: <span className="text-slate-300 tabular-nums">{e.assignmentsTotal}</span></span>
                {e.target_plans && e.target_plans.length > 0 && (
                  <span>Plans: <span className="text-slate-300">{e.target_plans.join(", ")}</span></span>
                )}
                {e.agency_allowlist && e.agency_allowlist.length > 0 && (
                  <span>Allowlist: <span className="text-slate-300">{e.agency_allowlist.length} tenants</span></span>
                )}
                <span>Created {new Date(e.created_at).toLocaleDateString()}</span>
                {e.started_at && <span>Started {new Date(e.started_at).toLocaleDateString()}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NewExperimentForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [key, setKey]           = useState("");
  const [name, setName]         = useState("");
  const [description, setDesc]  = useState("");
  const [variants, setVariants] = useState<Variant[]>([{ key: "control", weight: 50 }, { key: "treatment", weight: 50 }]);
  const [rollout, setRollout]   = useState(100);
  const [submitting, setSub]    = useState(false);

  async function submit() {
    if (!key.trim() || !name.trim()) { toast.error("key and name required"); return; }
    if (variants.some(v => !v.key.trim())) { toast.error("all variants need a key"); return; }
    setSub(true);
    const res = await fetch("/api/super-admin/experiments", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: key.trim(), name: name.trim(), description: description.trim() || null, variants, rollout_pct: rollout }),
    });
    const d = await res.json();
    setSub(false);
    if (d.experiment) { toast.success("Created"); onCreated(); }
    else toast.error(d.error ?? "Failed");
  }

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 p-5 mb-5">
      <h3 className="text-sm font-semibold text-white mb-3">New experiment</h3>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <Field label="Key (snake_case)">
          <input value={key} onChange={e => setKey(e.target.value)} placeholder="new_kanban_layout"
            className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-white font-mono focus:outline-none focus:border-indigo-500" />
        </Field>
        <Field label="Name">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="New Kanban layout"
            className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500" />
        </Field>
      </div>
      <Field label="Description">
        <textarea value={description} onChange={e => setDesc(e.target.value)} rows={2}
          className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500" />
      </Field>

      <div className="mt-3">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Variants</div>
        {variants.map((v, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <input value={v.key} onChange={e => setVariants(prev => prev.map((p, j) => j === i ? { ...p, key: e.target.value } : p))}
              className="flex-1 rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-white font-mono" />
            <input type="number" value={v.weight} onChange={e => setVariants(prev => prev.map((p, j) => j === i ? { ...p, weight: parseInt(e.target.value, 10) || 0 } : p))}
              className="w-24 rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-white tabular-nums" />
            <button onClick={() => setVariants(prev => prev.filter((_, j) => j !== i))} disabled={variants.length <= 2}
              className="p-1.5 rounded border border-slate-700 text-slate-500 hover:text-red-300 disabled:opacity-30">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button onClick={() => setVariants(prev => [...prev, { key: `variant_${prev.length}`, weight: 0 }])}
          className="text-xs text-indigo-400 hover:text-indigo-300">+ add variant</button>
      </div>

      <div className="mt-3">
        <Field label={`Rollout: ${rollout}%`}>
          <input type="range" min={0} max={100} value={rollout} onChange={e => setRollout(parseInt(e.target.value, 10))}
            className="w-full accent-indigo-600" />
        </Field>
      </div>

      <div className="mt-4 flex gap-2 justify-end">
        <button onClick={onCancel} className="px-3 py-1.5 rounded border border-slate-700 text-xs text-slate-400 hover:bg-slate-800">Cancel</button>
        <button onClick={submit} disabled={submitting}
          className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-xs text-white disabled:opacity-40">
          {submitting ? "Creating…" : "Create draft"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 block">{label}</span>
      {children}
    </label>
  );
}
