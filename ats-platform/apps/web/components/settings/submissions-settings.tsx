"use client";

/**
 * SubmissionsSettings — agency-level submission checklist configuration.
 *
 * Lives in Settings → Submissions. Shows the agency default checklist
 * (items with client_id IS NULL, job_id IS NULL).
 *
 * Per the US-027 design constraint: the PRIMARY config surface for the
 * per-client checklist is inside the first-req-at-new-client onboarding
 * flow (ChecklistConfigPanel rendered inline in that flow). This settings
 * page covers agency-wide defaults and gives admins an overview.
 */

import { Shield, Info } from "lucide-react";
import { ChecklistConfigPanel } from "@/components/pipeline/submission-readiness-panel";

export function SubmissionsSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-bold text-foreground">Submission Checklist</h2>
        <p className="mt-1 text-xs text-muted-foreground max-w-lg">
          Define agency-wide defaults that every recruiter must satisfy before submitting a candidate.
          Client-specific overrides are configured during the first search for that client.
        </p>
      </div>

      {/* Info callout */}
      <div className="flex items-start gap-3 rounded-lg border border-brand-200 bg-brand-50 p-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
        <div>
          <p className="text-xs font-semibold text-brand-900">Three-tier inheritance</p>
          <p className="mt-0.5 text-xs text-brand-700">
            Agency defaults apply to all submissions. Client overrides (set during the first search for a client) add or disable
            items for that specific company. Req-level overrides handle edge cases for a single position.
            More specific settings always win.
          </p>
        </div>
      </div>

      {/* Toggle: block vs warn */}
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
        <Shield className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div>
          <p className="text-xs font-semibold text-amber-900">Required vs. optional</p>
          <p className="mt-0.5 text-xs text-amber-700">
            Items marked <strong>Required</strong> block submission and show a warning — recruiters must confirm or
            explicitly override. <strong>Optional</strong> items show a warning but don't block.
            Toggle the switch on each item to change its mode.
          </p>
        </div>
      </div>

      {/* Agency defaults config */}
      <ChecklistConfigPanel
        title="Agency Default Checklist"
      />
    </div>
  );
}
