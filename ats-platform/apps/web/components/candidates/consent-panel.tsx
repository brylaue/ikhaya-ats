"use client";

/**
 * US-344: Privacy & Consent panel — displayed on the candidate profile page.
 *
 * Shows all 7 consent types with grant/withdraw controls. A collapsed header
 * shows the granted/issue count so recruiters can see status at a glance.
 */

import { useState } from "react";
import { useCandidateConsents, type ConsentType } from "@/lib/supabase/hooks";
import { cn } from "@/lib/utils";
import {
  ShieldCheck,
  ShieldAlert,
  ChevronDown,
  CheckCircle2,
  XCircle,
  Minus,
} from "lucide-react";
import { toast } from "sonner";

// ─── Consent type metadata ────────────────────────────────────────────────────

const CONSENT_TYPES: Array<{
  type: ConsentType;
  label: string;
  description: string;
  required?: boolean;
}> = [
  {
    type: "data_processing",
    label: "Data Processing",
    description: "Process personal data for recruitment purposes",
    required: true,
  },
  {
    type: "marketing_email",
    label: "Marketing Emails",
    description: "Send job alerts and recruitment updates by email",
  },
  {
    type: "sms",
    label: "SMS / Text Messages",
    description: "Contact via SMS for urgent updates or interview reminders",
  },
  {
    type: "portal_sharing",
    label: "Client Portal Sharing",
    description: "Share profile with client employers via the submission portal",
  },
  {
    type: "enrichment",
    label: "Data Enrichment",
    description: "Enrich profile from public sources (LinkedIn, GitHub, etc.)",
  },
  {
    type: "ai_processing",
    label: "AI Processing",
    description: "Use AI to score, rank, and generate insights from your profile",
  },
  {
    type: "third_party_ats",
    label: "Third-Party ATS Submission",
    description: "Submit profile to client ATS platforms on your behalf",
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

interface ConsentPanelProps {
  candidateId: string;
}

export function ConsentPanel({ candidateId }: ConsentPanelProps) {
  const { consents, loading, grantedCount, grantConsent, withdrawConsent } =
    useCandidateConsents(candidateId);
  const [expanded, setExpanded] = useState(false);
  const [acting, setActing] = useState<ConsentType | null>(null);

  const issueCount = CONSENT_TYPES.filter((ct) => {
    const c = consents.find((x) => x.consentType === ct.type);
    return ct.required && (!c || !c.granted);
  }).length;

  async function handleToggle(type: ConsentType, currentlyGranted: boolean) {
    setActing(type);
    try {
      if (currentlyGranted) {
        await withdrawConsent(type);
        toast.success("Consent withdrawn");
      } else {
        await grantConsent(type);
        toast.success("Consent recorded");
      }
    } catch {
      toast.error("Failed to update consent");
    } finally {
      setActing(null);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Collapsed header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2.5">
          {issueCount > 0 ? (
            <ShieldAlert className="h-4 w-4 text-amber-500 shrink-0" />
          ) : (
            <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0" />
          )}
          <span className="text-sm font-medium text-foreground">
            Privacy & Consent
          </span>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-emerald-700 font-medium">
              {loading ? "…" : `${grantedCount} granted`}
            </span>
            {issueCount > 0 && (
              <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-amber-700 font-medium">
                {issueCount} required missing
              </span>
            )}
          </div>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform duration-200",
            expanded && "rotate-180"
          )}
        />
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-border divide-y divide-border">
          {CONSENT_TYPES.map((ct) => {
            const record = consents.find((x) => x.consentType === ct.type);
            const isGranted = record?.granted === true;
            const isWithdrawn = record?.granted === false;
            const isActing = acting === ct.type;

            return (
              <div key={ct.type} className="flex items-center justify-between px-4 py-3 gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-foreground">
                      {ct.label}
                    </span>
                    {ct.required && (
                      <span className="text-[10px] text-amber-600 font-medium">required</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {ct.description}
                  </p>
                  {record && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {isGranted
                        ? `Granted ${new Date(record.grantedAt).toLocaleDateString()}`
                        : `Withdrawn ${record.withdrawnAt ? new Date(record.withdrawnAt).toLocaleDateString() : ""}`}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* Status icon */}
                  {isGranted ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : isWithdrawn ? (
                    <XCircle className="h-4 w-4 text-red-400" />
                  ) : (
                    <Minus className="h-4 w-4 text-muted-foreground/40" />
                  )}

                  {/* Toggle button */}
                  <button
                    onClick={() => handleToggle(ct.type, isGranted)}
                    disabled={isActing}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-40",
                      isGranted
                        ? "border border-border text-muted-foreground hover:border-red-300 hover:bg-red-50 hover:text-red-600"
                        : "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    )}
                  >
                    {isActing ? "…" : isGranted ? "Withdraw" : "Grant"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
