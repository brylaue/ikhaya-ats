"use client";
/**
 * RoPA Page — US-351: Article 30 Record of Processing Activities
 * GDPR Art. 30 register of all data processing activities.
 */

import { useState } from "react";
import { Shield, CheckCircle2, AlertTriangle, Plus, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRopa } from "@/lib/supabase/hooks";
import { toast } from "sonner";

const LEGAL_BASIS_LABELS: Record<string, string> = {
  consent:               "Consent",
  contract:              "Contract",
  legal_obligation:      "Legal obligation",
  vital_interests:       "Vital interests",
  public_task:           "Public task",
  legitimate_interests:  "Legitimate interests",
};

export default function RopaPage() {
  const { records, loading, markReviewed, overdueReview } = useRopa();

  async function handleReview(id: string) {
    try { await markReviewed(id); toast.success("Marked as reviewed"); }
    catch { toast.error("Failed to mark reviewed"); }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Record of Processing Activities</h2>
          <p className="text-sm text-muted-foreground mt-0.5">GDPR Article 30 register · review annually</p>
        </div>
        {overdueReview.length > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 font-medium">
            <AlertTriangle className="h-3.5 w-3.5" />
            {overdueReview.length} overdue for review
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />)}
        </div>
      ) : (
        <div className="space-y-3">
          {records.map(r => {
            const isOverdue = !r.lastReviewedAt ||
              (Date.now() - new Date(r.lastReviewedAt).getTime()) > 365 * 86_400_000;
            return (
              <div key={r.id} className={cn(
                "rounded-xl border bg-card p-5",
                isOverdue ? "border-amber-200" : "border-border"
              )}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-foreground">{r.activityName}</h3>
                      <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
                        {LEGAL_BASIS_LABELS[r.legalBasis] ?? r.legalBasis}
                      </span>
                      {r.isSeeded && <span className="text-[10px] text-brand-600 font-medium">Standard</span>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{r.purpose}</p>
                    <div className="flex flex-wrap gap-2 mt-2 text-[10px] text-muted-foreground">
                      {r.dataCategories.length > 0 && (
                        <span>Data: {r.dataCategories.join(", ")}</span>
                      )}
                      {r.retentionPeriod && <span>· Retention: {r.retentionPeriod}</span>}
                      {r.thirdCountryTransfers.length > 0 && (
                        <span>· Transfers: {r.thirdCountryTransfers.join(", ")} ({r.transferMechanism ?? "no mechanism"})</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {r.lastReviewedAt ? (
                      <div className="text-right">
                        <div className={cn("flex items-center gap-1 text-[10px]", isOverdue ? "text-amber-600" : "text-emerald-600")}>
                          {isOverdue ? <AlertTriangle className="h-2.5 w-2.5" /> : <CheckCircle2 className="h-2.5 w-2.5" />}
                          {isOverdue ? "Overdue" : "Reviewed"}
                        </div>
                        <p className="text-[9px] text-muted-foreground">
                          {new Date(r.lastReviewedAt).toLocaleDateString()}
                        </p>
                      </div>
                    ) : (
                      <span className="text-[10px] text-amber-600 flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5" /> Never reviewed
                      </span>
                    )}
                    <button type="button" onClick={() => handleReview(r.id)}
                      className="px-3 py-1.5 border border-border rounded-md text-[11px] font-medium text-foreground hover:bg-muted/40 transition-colors">
                      Mark reviewed
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
