"use client";

/**
 * Referrals Page — US-159: Client & Candidate Referral Program
 *
 * Track referrals from candidates, clients, and employees.
 * Shows pipeline from referral received → contacted → converted.
 */

import { useState } from "react";
import Link from "next/link";
import {
  Plus, Users, GitBranch, CheckCircle2, Clock, XCircle,
  Gift, ChevronLeft, UserCheck, Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useReferrals, useFeatureFlag, type Referral } from "@/lib/supabase/hooks";
import { toast } from "sonner";
import { FeatureGate } from "@/components/ui/feature-gate";

const STATUS_CONFIG: Record<Referral["status"], { label: string; color: string; icon: React.ElementType }> = {
  pending:   { label: "Pending",    color: "bg-slate-100 text-slate-600",   icon: Clock       },
  contacted: { label: "Contacted",  color: "bg-blue-100 text-blue-700",    icon: UserCheck   },
  converted: { label: "Converted",  color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  declined:  { label: "Declined",   color: "bg-red-100 text-red-600",      icon: XCircle     },
  expired:   { label: "Expired",    color: "bg-amber-100 text-amber-700",  icon: XCircle     },
};

const BY_TYPE_CONFIG = {
  candidate: { label: "From candidate", icon: Users,     color: "bg-violet-50 text-violet-700 border-violet-200" },
  client:    { label: "From client",    icon: Building2,  color: "bg-blue-50 text-blue-700 border-blue-200"     },
  employee:  { label: "From employee",  icon: UserCheck,  color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  other:     { label: "Other",          icon: GitBranch,  color: "bg-slate-50 text-slate-600 border-slate-200" },
};

// ─── New Referral Form ────────────────────────────────────────────────────────

interface NewReferralFormProps { onClose: () => void }

function NewReferralForm({ onClose }: NewReferralFormProps) {
  const { addReferral } = useReferrals();
  const [form, setForm] = useState({
    referralType: "candidate" as "candidate" | "client",
    referredByType: "candidate" as Referral["referredByType"],
    referredByName: "",
    referredName: "",
    rewardDescription: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.referredByName.trim() || !form.referredName.trim()) {
      toast.error("Referrer and referred name are required");
      return;
    }
    setSaving(true);
    try {
      await addReferral({
        referralType: form.referralType,
        referredByType: form.referredByType,
        referredByName: form.referredByName,
        referredName: form.referredName,
        rewardDescription: form.rewardDescription || null,
        notes: form.notes || null,
      });
      toast.success("Referral recorded");
      onClose();
    } catch {
      toast.error("Failed to record referral");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-card p-6 space-y-4 mb-6">
      <h3 className="text-sm font-semibold text-foreground">New referral</h3>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-foreground block mb-1">Referral type</label>
          <select
            value={form.referralType}
            onChange={(e) => setForm((f) => ({ ...f, referralType: e.target.value as "candidate" | "client" }))}
            className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 bg-card"
          >
            <option value="candidate">Candidate referral</option>
            <option value="client">Client referral</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-foreground block mb-1">Referred by</label>
          <select
            value={form.referredByType}
            onChange={(e) => setForm((f) => ({ ...f, referredByType: e.target.value as Referral["referredByType"] }))}
            className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 bg-card"
          >
            <option value="candidate">Candidate</option>
            <option value="client">Client</option>
            <option value="employee">Employee</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-foreground block mb-1">Referrer name</label>
          <input
            type="text"
            value={form.referredByName}
            onChange={(e) => setForm((f) => ({ ...f, referredByName: e.target.value }))}
            placeholder="Who sent the referral?"
            className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 bg-card"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-foreground block mb-1">Referred person / company</label>
          <input
            type="text"
            value={form.referredName}
            onChange={(e) => setForm((f) => ({ ...f, referredName: e.target.value }))}
            placeholder="Who was referred?"
            className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 bg-card"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-foreground block mb-1">Reward / incentive</label>
          <input
            type="text"
            value={form.rewardDescription}
            onChange={(e) => setForm((f) => ({ ...f, rewardDescription: e.target.value }))}
            placeholder="e.g. $500 gift card on placement"
            className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 bg-card"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-foreground block mb-1">Notes</label>
          <input
            type="text"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="Any context..."
            className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 bg-card"
          />
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-brand-600 text-white rounded-md text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving…" : "Record referral"}
        </button>
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReferralsPage() {
  // US-513: Referrals is part of the BD pipeline suite — Pro tier.
  const { enabled: bdEnabled, loading: bdLoading } = useFeatureFlag("business_development");
  const { referrals, loading, updateStatus, markRewardIssued } = useReferrals();
  const [showForm, setShowForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState<Referral["status"] | "all">("all");

  if (!bdLoading && !bdEnabled) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <FeatureGate feature="business_development" className="max-w-sm" />
      </div>
    );
  }

  const filtered = filterStatus === "all" ? referrals : referrals.filter((r) => r.status === filterStatus);

  const counts = {
    pending:   referrals.filter((r) => r.status === "pending").length,
    contacted: referrals.filter((r) => r.status === "contacted").length,
    converted: referrals.filter((r) => r.status === "converted").length,
    declined:  referrals.filter((r) => r.status === "declined").length,
    expired:   referrals.filter((r) => r.status === "expired").length,
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="space-y-6 p-8">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href="/bd" className="text-sm text-brand-600 hover:text-brand-700 font-medium">
            ← BD Pipeline
          </Link>
          <div className="flex-1 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Referrals</h1>
              <p className="text-sm text-muted-foreground mt-1">Track candidate and client referrals through your network</p>
            </div>
            <button
              type="button"
              onClick={() => setShowForm((v) => !v)}
              className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white rounded-md text-sm font-medium hover:bg-brand-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Record referral
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-5 gap-3">
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
            const Icon = cfg.icon;
            const count = counts[key as keyof typeof counts];
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilterStatus(filterStatus === key ? "all" : key as Referral["status"])}
                className={cn(
                  "rounded-xl border p-4 text-left transition-colors",
                  filterStatus === key ? "border-brand-300 ring-1 ring-brand-300" : "border-border hover:bg-muted/30"
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">{cfg.label}</span>
                </div>
                <p className="text-2xl font-bold text-foreground">{count}</p>
              </button>
            );
          })}
        </div>

        {/* Form */}
        {showForm && <NewReferralForm onClose={() => setShowForm(false)} />}

        {/* List */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {loading ? (
            <div className="divide-y divide-border">
              {[...Array(4)].map((_, i) => <div key={i} className="h-16 animate-pulse bg-muted/20 m-4 rounded-lg" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <GitBranch className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                {filterStatus === "all" ? "No referrals recorded yet." : `No ${filterStatus} referrals.`}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {/* Header row */}
              <div className="grid grid-cols-[1fr,1fr,1fr,140px,100px] gap-4 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground bg-muted/30">
                <span>Referred</span>
                <span>Referred by</span>
                <span>Reward</span>
                <span>Status</span>
                <span>Date</span>
              </div>

              {filtered.map((r) => {
                const statusCfg = STATUS_CONFIG[r.status];
                const byCfg    = BY_TYPE_CONFIG[r.referredByType];
                const StatusIcon = statusCfg.icon;
                const ByIcon     = byCfg.icon;

                return (
                  <div key={r.id} className="grid grid-cols-[1fr,1fr,1fr,140px,100px] gap-4 px-4 py-3 items-center hover:bg-muted/20 transition-colors">
                    {/* Referred */}
                    <div>
                      <p className="text-sm font-medium text-foreground">{r.referredName ?? "—"}</p>
                      <span className={cn("inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-medium", byCfg.color)}>
                        <ByIcon className="h-2.5 w-2.5" />
                        {r.referralType === "candidate" ? "Candidate" : "Client"}
                      </span>
                    </div>

                    {/* Referred by */}
                    <div>
                      <p className="text-sm text-foreground">{r.referredByName}</p>
                      <p className="text-[10px] text-muted-foreground capitalize">{r.referredByType}</p>
                    </div>

                    {/* Reward */}
                    <div className="flex items-center gap-1.5">
                      {r.rewardDescription ? (
                        <>
                          <Gift className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                          <div>
                            <p className="text-xs text-foreground">{r.rewardDescription}</p>
                            {r.rewardIssued && (
                              <p className="text-[10px] text-emerald-600 font-medium">Issued ✓</p>
                            )}
                            {!r.rewardIssued && r.status === "converted" && (
                              <button
                                type="button"
                                onClick={() => markRewardIssued(r.id)}
                                className="text-[10px] text-brand-600 hover:underline"
                              >
                                Mark issued
                              </button>
                            )}
                          </div>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>

                    {/* Status */}
                    <div>
                      <select
                        value={r.status}
                        onChange={(e) => updateStatus(r.id, e.target.value as Referral["status"])}
                        className={cn(
                          "text-[11px] font-medium px-2.5 py-1 rounded-full border-0 focus:outline-none focus:ring-1 focus:ring-brand-600 cursor-pointer",
                          statusCfg.color
                        )}
                      >
                        {Object.entries(STATUS_CONFIG).map(([k, c]) => (
                          <option key={k} value={k}>{c.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* Date */}
                    <p className="text-xs text-muted-foreground">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
