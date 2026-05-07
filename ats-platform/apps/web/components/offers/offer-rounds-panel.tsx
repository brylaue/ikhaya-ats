"use client";

/**
 * OfferRoundsPanel — US-201: Offer Negotiation & Counter-Offer Tracking
 *
 * Shows a timeline of negotiation rounds for a given offer letter.
 * Each round displays the salary/terms and type (initial / counter / accepted).
 * Includes an "Add Round" form for recording new counter-offers.
 */

import { useState } from "react";
import { Plus, DollarSign, CheckCircle2, XCircle, ArrowRightLeft, ChevronDown } from "lucide-react";
import { cn, formatSalary } from "@/lib/utils";
import { useOfferRounds, type OfferRound } from "@/lib/supabase/hooks";
import { toast } from "sonner";

const ROUND_TYPE_CONFIG: Record<OfferRound["roundType"], { label: string; color: string; icon: React.ElementType }> = {
  initial:           { label: "Initial offer",        color: "bg-blue-50 border-blue-200 text-blue-700",     icon: DollarSign },
  counter_candidate: { label: "Counter (candidate)",  color: "bg-amber-50 border-amber-200 text-amber-700",  icon: ArrowRightLeft },
  counter_client:    { label: "Counter (client)",     color: "bg-violet-50 border-violet-200 text-violet-700", icon: ArrowRightLeft },
  revised:           { label: "Revised offer",        color: "bg-indigo-50 border-indigo-200 text-indigo-700", icon: DollarSign },
  accepted:          { label: "Accepted",             color: "bg-emerald-50 border-emerald-200 text-emerald-700", icon: CheckCircle2 },
  rejected:          { label: "Rejected",             color: "bg-red-50 border-red-200 text-red-600",        icon: XCircle },
  withdrawn:         { label: "Withdrawn",            color: "bg-slate-50 border-slate-200 text-slate-600",  icon: XCircle },
};

interface Props {
  offerLetterId: string;
  candidateId: string;
  jobId: string;
}

interface NewRoundForm {
  roundType: OfferRound["roundType"];
  baseSalary: string;
  bonus: string;
  equityNotes: string;
  startDate: string;
  submittedBy: OfferRound["submittedBy"];
  notes: string;
}

const EMPTY_FORM: NewRoundForm = {
  roundType: "counter_candidate",
  baseSalary: "",
  bonus: "",
  equityNotes: "",
  startDate: "",
  submittedBy: "recruiter",
  notes: "",
};

export function OfferRoundsPanel({ offerLetterId, candidateId, jobId }: Props) {
  const { rounds, loading, addRound } = useOfferRounds(offerLetterId);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewRoundForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const isResolved = rounds.some((r) => r.roundType === "accepted" || r.roundType === "rejected" || r.roundType === "withdrawn");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await addRound({
        offerLetterId,
        candidateId,
        jobId,
        roundType: form.roundType,
        baseSalary: form.baseSalary ? Number(form.baseSalary) : null,
        bonus: form.bonus ? Number(form.bonus) : null,
        equityNotes: form.equityNotes || null,
        startDate: form.startDate || null,
        otherTerms: null,
        submittedBy: form.submittedBy,
        notes: form.notes || null,
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      toast.success("Round recorded");
    } catch {
      toast.error("Failed to record round");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="h-16 animate-pulse rounded-lg bg-muted" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Negotiation history</h3>
        {!isResolved && (
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700"
          >
            <Plus className="h-3.5 w-3.5" />
            Add round
          </button>
        )}
      </div>

      {/* Timeline */}
      {rounds.length === 0 && (
        <p className="text-sm text-muted-foreground py-4 text-center">
          No negotiation rounds recorded yet.
        </p>
      )}

      <div className="relative space-y-3">
        {rounds.map((round, i) => {
          const cfg = ROUND_TYPE_CONFIG[round.roundType];
          const Icon = cfg.icon;
          return (
            <div key={round.id} className="flex gap-3">
              {/* Connector line */}
              <div className="flex flex-col items-center">
                <div className={cn("rounded-full p-1.5 border", cfg.color)}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                {i < rounds.length - 1 && <div className="w-px flex-1 bg-border mt-1" />}
              </div>

              {/* Content */}
              <div className={cn("flex-1 rounded-lg border p-3 mb-1", cfg.color.split(" ").filter(c => c.startsWith("border")).join(" "), "bg-card")}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className={cn("text-[11px] font-semibold uppercase tracking-wider", cfg.color.split(" ").find(c => c.startsWith("text")))}>
                      Round {round.roundNumber} · {cfg.label}
                    </span>
                    {round.submittedBy !== "recruiter" && (
                      <span className="ml-2 text-[10px] text-muted-foreground">
                        via {round.submittedBy}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {new Date(round.createdAt).toLocaleDateString()}
                  </span>
                </div>

                {(round.baseSalary || round.bonus) && (
                  <div className="mt-1.5 flex items-center gap-4 text-sm font-medium text-foreground">
                    {round.baseSalary && (
                      <span>{formatSalary(round.baseSalary)} base</span>
                    )}
                    {round.bonus && (
                      <span className="text-muted-foreground">+ {formatSalary(round.bonus)} bonus</span>
                    )}
                    {round.startDate && (
                      <span className="text-muted-foreground text-xs">Start: {round.startDate}</span>
                    )}
                  </div>
                )}
                {round.equityNotes && (
                  <p className="mt-1 text-xs text-muted-foreground">{round.equityNotes}</p>
                )}
                {round.notes && (
                  <p className="mt-1.5 text-xs text-foreground/80 italic">{round.notes}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add round form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-muted/30 p-4 space-y-4">
          <h4 className="text-sm font-semibold text-foreground">Record new round</h4>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">Round type</label>
              <select
                value={form.roundType}
                onChange={(e) => setForm((f) => ({ ...f, roundType: e.target.value as OfferRound["roundType"] }))}
                className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 bg-card"
              >
                <option value="counter_candidate">Counter (candidate)</option>
                <option value="counter_client">Counter (client)</option>
                <option value="revised">Revised offer</option>
                <option value="accepted">Accepted ✓</option>
                <option value="rejected">Rejected ✗</option>
                <option value="withdrawn">Withdrawn</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">Submitted by</label>
              <select
                value={form.submittedBy}
                onChange={(e) => setForm((f) => ({ ...f, submittedBy: e.target.value as OfferRound["submittedBy"] }))}
                className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 bg-card"
              >
                <option value="recruiter">Recruiter</option>
                <option value="candidate">Candidate</option>
                <option value="client">Client</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">Base salary</label>
              <input
                type="number"
                value={form.baseSalary}
                onChange={(e) => setForm((f) => ({ ...f, baseSalary: e.target.value }))}
                placeholder="e.g. 150000"
                className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 bg-card"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">Bonus</label>
              <input
                type="number"
                value={form.bonus}
                onChange={(e) => setForm((f) => ({ ...f, bonus: e.target.value }))}
                placeholder="e.g. 20000"
                className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 bg-card"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">Start date</label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 bg-card"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">Equity notes</label>
              <input
                type="text"
                value={form.equityNotes}
                onChange={(e) => setForm((f) => ({ ...f, equityNotes: e.target.value }))}
                placeholder="e.g. 0.1% over 4yr"
                className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 bg-card"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-foreground mb-1 block">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              placeholder="Key points, context, candidate reaction..."
              className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 bg-card resize-none"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-brand-600 text-white rounded-md text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving…" : "Record round"}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
