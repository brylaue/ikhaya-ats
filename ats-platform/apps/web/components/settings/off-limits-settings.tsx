"use client";

import { useState, useMemo } from "react";
import { ShieldOff, Plus, Trash2, AlertCircle, Clock, Search, Loader2 } from "lucide-react";
import { useOffLimitsRules, useCandidates, useCompanies } from "@/lib/supabase/hooks";
import type { NewOffLimitsInput } from "@/lib/supabase/hooks";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Add Rule Modal ───────────────────────────────────────────────────────────

interface AddRuleModalProps {
  onClose: () => void;
  onSave:  (input: NewOffLimitsInput) => Promise<void>;
}

function AddRuleModal({ onClose, onSave }: AddRuleModalProps) {
  const { candidates, loading: loadingCandidates } = useCandidates();
  const { companies, loading: loadingCompanies }    = useCompanies();

  const [candidateId, setCandidateId] = useState("");
  const [companyId, setCompanyId]     = useState("");  // "" = all clients
  const [reason, setReason]           = useState("");
  const [expiresAt, setExpiresAt]     = useState("");
  const [saving, setSaving]           = useState(false);
  const [candQuery, setCandQuery]     = useState("");

  const filteredCandidates = useMemo(() =>
    candidates.filter((c) =>
      !candQuery ||
      c.fullName.toLowerCase().includes(candQuery.toLowerCase()) ||
      c.currentTitle?.toLowerCase().includes(candQuery.toLowerCase())
    ).slice(0, 20),
    [candidates, candQuery]
  );

  async function handleSave() {
    if (!candidateId) { toast.error("Select a candidate"); return; }
    setSaving(true);
    try {
      await onSave({
        candidateId,
        companyId: companyId || undefined,
        reason:    reason.trim() || undefined,
        expiresAt: expiresAt || undefined,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ShieldOff className="h-4 w-4 text-rose-500" />
            Add Off-Limits Rule
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
        </div>

        <div className="space-y-4 p-5">
          {/* Candidate picker */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">Candidate *</label>
            <div className="relative mb-1.5">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={candQuery}
                onChange={(e) => setCandQuery(e.target.value)}
                placeholder="Search candidates…"
                className="w-full rounded-lg border border-border bg-background pl-8 pr-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            {loadingCandidates ? (
              <div className="flex items-center justify-center py-3">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="max-h-32 overflow-y-auto rounded-lg border border-border bg-background">
                {filteredCandidates.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCandidateId(c.id)}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                      candidateId === c.id && "bg-brand-50 text-brand-700 font-medium"
                    )}
                  >
                    <span className="truncate">{c.fullName}</span>
                    {c.currentTitle && (
                      <span className="truncate text-xs text-muted-foreground">· {c.currentTitle}</span>
                    )}
                  </button>
                ))}
                {filteredCandidates.length === 0 && (
                  <p className="py-3 text-center text-xs text-muted-foreground">No candidates found</p>
                )}
              </div>
            )}
          </div>

          {/* Client scope */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">Restrict to Client</label>
            {loadingCompanies ? (
              <div className="flex items-center justify-center py-2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <select
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">All clients (universal)</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              Leave blank to block this candidate from being submitted to any client.
            </p>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">Reason (optional)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="e.g. Placed at this client — 12-month off-limits per engagement terms"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
          </div>

          {/* Expiry */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">Expires (optional)</label>
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
            />
            <p className="mt-1 text-xs text-muted-foreground">Leave blank for a permanent restriction.</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
          <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !candidateId}
            className="flex items-center gap-1.5 rounded-md bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60 transition-colors"
          >
            {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving…</> : "Add Rule"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main settings component ──────────────────────────────────────────────────

export function OffLimitsSettings() {
  const { rules, loading, addRule, removeRule } = useOffLimitsRules();
  const [showModal, setShowModal] = useState(false);
  const [filter, setFilter]       = useState<"active" | "expired" | "all">("active");

  const filtered = useMemo(() => {
    if (filter === "active")  return rules.filter((r) => !r.expired);
    if (filter === "expired") return rules.filter((r) => r.expired);
    return rules;
  }, [rules, filter]);

  async function handleSave(input: NewOffLimitsInput) {
    const result = await addRule(input);
    if (result) {
      toast.success("Off-limits rule added");
    } else {
      toast.error("Failed to add rule");
      throw new Error("Failed");
    }
  }

  async function handleRemove(id: string, candidateName: string) {
    await removeRule(id);
    toast.success(`Off-limits rule removed for ${candidateName}`);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {(["active", "expired", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                filter === f
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-accent"
              )}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Rule
        </button>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-2.5 rounded-lg bg-amber-50 border border-amber-200 p-3">
        <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800">
          Off-limits rules prevent a candidate from being submitted to a specific client (or any client).
          Recruiters will see a warning when attempting to submit a restricted candidate.
        </p>
      </div>

      {/* Rules list */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="py-10 text-center">
          <ShieldOff className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-foreground">No {filter !== "all" ? filter : ""} rules</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {filter === "active" ? "Add a rule to restrict candidate submissions." : "No expired rules found."}
          </p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map((r) => (
            <div
              key={r.id}
              className={cn(
                "flex items-start gap-3 rounded-xl border p-3.5 transition-colors",
                r.expired
                  ? "border-border bg-muted/30 opacity-60"
                  : "border-rose-200 bg-rose-50"
              )}
            >
              <ShieldOff className={cn("h-4 w-4 shrink-0 mt-0.5", r.expired ? "text-muted-foreground" : "text-rose-500")} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-foreground">{r.candidateName}</span>
                  <span className="text-xs text-muted-foreground">→</span>
                  <span className={cn("text-xs font-medium rounded-full px-2 py-0.5",
                    r.companyId
                      ? "bg-orange-100 text-orange-700"
                      : "bg-red-100 text-red-700"
                  )}>
                    {r.companyName ?? "All Clients"}
                  </span>
                  {r.expired && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      Expired
                    </span>
                  )}
                </div>
                {r.reason && (
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{r.reason}</p>
                )}
                {r.expiresAt && (
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {r.expired ? "Expired" : "Expires"} {new Date(r.expiresAt).toLocaleDateString()}
                  </p>
                )}
              </div>
              <button
                onClick={() => handleRemove(r.id, r.candidateName)}
                className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Remove rule"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <AddRuleModal
          onClose={() => setShowModal(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
