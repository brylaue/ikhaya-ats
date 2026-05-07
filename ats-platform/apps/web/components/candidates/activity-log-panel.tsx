"use client";

/**
 * ActivityLogPanel — US-054: Call / Meeting Activity Log (Manual)
 *
 * Shows recent calls & meetings for any entity (candidate, client, application).
 * Includes a "Log activity" form for manual entry.
 */

import { useState } from "react";
import { Phone, Video, Plus, Clock, ChevronDown, ChevronUp, X, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useActivityLog, type ActivityLogType, type ActivityDirection, type ActivityOutcomeTag } from "@/lib/supabase/hooks";
import { toast } from "sonner";

const OUTCOME_LABELS: Record<ActivityOutcomeTag, string> = {
  connected:    "Connected",
  voicemail:    "Voicemail",
  left_message: "Left message",
  no_answer:    "No answer",
  meeting_held: "Meeting held",
  rescheduled:  "Rescheduled",
};

interface Props {
  entityType: "candidate" | "client" | "application";
  entityId:   string;
}

export function ActivityLogPanel({ entityType, entityId }: Props) {
  const { logs, loading, logActivity } = useActivityLog(entityType, entityId);
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [form, setForm] = useState({
    type:           "call" as ActivityLogType,
    direction:      "outbound" as ActivityDirection,
    participants:   "",
    durationMins:   "",
    occurredAt:     new Date().toISOString().slice(0, 16),
    summary:        "",
    outcomeTag:     "" as ActivityOutcomeTag | "",
  });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.summary.trim()) { toast.error("Summary is required"); return; }
    setSaving(true);
    try {
      await logActivity({
        type:         form.type,
        direction:    form.direction,
        entityType,
        entityId,
        participants: form.participants ? form.participants.split(",").map(s => s.trim()) : [],
        durationMins: form.durationMins ? parseInt(form.durationMins) : undefined,
        occurredAt:   new Date(form.occurredAt).toISOString(),
        summary:      form.summary,
        outcomeTag:   form.outcomeTag || undefined,
      });
      toast.success("Activity logged");
      setShowForm(false);
      setForm(f => ({ ...f, summary: "", participants: "", durationMins: "", outcomeTag: "" }));
    } catch {
      toast.error("Failed to log activity");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Calls & Meetings</h3>
        <button
          type="button"
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium"
        >
          <Plus className="h-3.5 w-3.5" />
          Log activity
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">Type</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as ActivityLogType }))}
                className="w-full px-2.5 py-1.5 border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-brand-600 bg-card">
                <option value="call">Call</option>
                <option value="meeting">Meeting</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">Direction</label>
              <select value={form.direction} onChange={e => setForm(f => ({ ...f, direction: e.target.value as ActivityDirection }))}
                className="w-full px-2.5 py-1.5 border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-brand-600 bg-card">
                <option value="outbound">Outbound</option>
                <option value="inbound">Inbound</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">Date & time</label>
              <input type="datetime-local" value={form.occurredAt}
                onChange={e => setForm(f => ({ ...f, occurredAt: e.target.value }))}
                className="w-full px-2.5 py-1.5 border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-brand-600 bg-card" />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">Duration (mins)</label>
              <input type="number" min={0} value={form.durationMins}
                onChange={e => setForm(f => ({ ...f, durationMins: e.target.value }))}
                placeholder="e.g. 20"
                className="w-full px-2.5 py-1.5 border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-brand-600 bg-card" />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">Outcome</label>
              <select value={form.outcomeTag} onChange={e => setForm(f => ({ ...f, outcomeTag: e.target.value as ActivityOutcomeTag | "" }))}
                className="w-full px-2.5 py-1.5 border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-brand-600 bg-card">
                <option value="">— Select —</option>
                {Object.entries(OUTCOME_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">Participants</label>
              <input type="text" value={form.participants}
                onChange={e => setForm(f => ({ ...f, participants: e.target.value }))}
                placeholder="Names or emails, comma-separated"
                className="w-full px-2.5 py-1.5 border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-brand-600 bg-card" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">Summary *</label>
            <textarea rows={2} value={form.summary}
              onChange={e => setForm(f => ({ ...f, summary: e.target.value }))}
              placeholder="What was discussed?"
              className="w-full px-2.5 py-1.5 border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-brand-600 bg-card resize-none" />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving}
              className="px-3 py-1.5 bg-brand-600 text-white rounded-md text-xs font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors">
              {saving ? "Saving…" : "Log activity"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Log list */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(2)].map((_, i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />)}
        </div>
      ) : logs.length === 0 ? (
        <div className="rounded-lg border border-border bg-muted/10 p-6 text-center">
          <Phone className="h-5 w-5 text-muted-foreground mx-auto mb-1" />
          <p className="text-xs text-muted-foreground">No calls or meetings logged yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map(log => {
            const Icon = log.type === "meeting" ? Video : Phone;
            const DirIcon = log.direction === "inbound" ? ArrowDownLeft : ArrowUpRight;
            const isExpanded = expanded === log.id;
            return (
              <div key={log.id} className="rounded-lg border border-border bg-card p-3 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs font-medium text-foreground capitalize">{log.type}</span>
                    <DirIcon className="h-3 w-3 text-muted-foreground" />
                    {log.outcomeTag && (
                      <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full text-muted-foreground">
                        {OUTCOME_LABELS[log.outcomeTag as ActivityOutcomeTag]}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <Clock className="h-2.5 w-2.5" />
                    {new Date(log.occurredAt).toLocaleDateString()}
                    {log.durationMins && <span>{log.durationMins}m</span>}
                    <button onClick={() => setExpanded(isExpanded ? null : log.id)}>
                      {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                  </div>
                </div>
                <p className={cn("text-xs text-muted-foreground", !isExpanded && "line-clamp-1")}>{log.summary}</p>
                {isExpanded && log.participants.length > 0 && (
                  <p className="text-[10px] text-muted-foreground">Participants: {log.participants.join(", ")}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
