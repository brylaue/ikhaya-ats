"use client";

/**
 * CandidateConsentPanel
 * Displayed on the candidate profile page (right-column, below tasks).
 * Shows the current consent state for each consent type and allows
 * recruiters to grant, withdraw, or document legal basis changes.
 */

import { useState } from "react";
import {
  Shield,
  ShieldCheck,
  ShieldX,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Plus,
  Clock,
} from "lucide-react";
import {
  useCandidateConsents,
  type ConsentType,
  type LegalBasis,
  type ConsentStatus,
} from "@/lib/supabase/compliance-hooks";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

// ─── Config ─────────────────────────────────────────────────────────────────

const CONSENT_TYPES: { type: ConsentType; label: string; description: string }[] = [
  {
    type: "data_processing",
    label: "Data Processing",
    description: "Profile storage, recruiter access, platform use",
  },
  {
    type: "marketing_email",
    label: "Marketing Email",
    description: "Outreach sequences and job opportunity emails",
  },
  {
    type: "sms",
    label: "SMS / Text",
    description: "Text messages and SMS sequences",
  },
  {
    type: "portal_sharing",
    label: "Client Portal Sharing",
    description: "Sharing profile with client hiring teams via portal",
  },
  {
    type: "enrichment",
    label: "Data Enrichment",
    description: "Third-party email/phone lookup services",
  },
  {
    type: "ai_processing",
    label: "AI Processing",
    description: "AI match scoring, profile summarisation, JD fit analysis",
  },
  {
    type: "third_party_ats",
    label: "Client ATS Push",
    description: "Submitting profile directly into client's ATS system",
  },
];

const LEGAL_BASIS_OPTIONS: { value: LegalBasis; label: string; hint: string }[] = [
  {
    value: "consent",
    label: "Consent",
    hint: "Candidate gave explicit, freely-given consent",
  },
  {
    value: "legitimate_interest",
    label: "Legitimate Interest",
    hint: "Processing necessary for agency's legitimate recruitment purposes",
  },
  {
    value: "contract",
    label: "Contract",
    hint: "Necessary for performance of a contract with the data subject",
  },
  {
    value: "legal_obligation",
    label: "Legal Obligation",
    hint: "Required by law (e.g. anti-money laundering, right-to-work checks)",
  },
];

// ─── Status helpers ──────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: ConsentStatus | "not_set" }) {
  if (status === "granted")
    return <ShieldCheck className="h-4 w-4 text-green-600" />;
  if (status === "withdrawn" || status === "denied")
    return <ShieldX className="h-4 w-4 text-red-500" />;
  if (status === "expired")
    return <ShieldAlert className="h-4 w-4 text-amber-500" />;
  return <Shield className="h-4 w-4 text-slate-400" />;
}

function statusBadge(status: ConsentStatus | "not_set") {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    granted:   { label: "Granted",   variant: "default" },
    withdrawn: { label: "Withdrawn", variant: "destructive" },
    denied:    { label: "Denied",    variant: "destructive" },
    expired:   { label: "Expired",   variant: "secondary" },
    pending:   { label: "Pending",   variant: "outline" },
    not_set:   { label: "Not set",   variant: "outline" },
  };
  const cfg = map[status] ?? map.not_set;
  return <Badge variant={cfg.variant} className="text-[10px] px-1.5 py-0">{cfg.label}</Badge>;
}

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  candidateId: string;
  candidateName: string;
}

export function CandidateConsentPanel({ candidateId, candidateName }: Props) {
  const { consents, loading, grantConsent, withdrawConsent, getConsent } =
    useCandidateConsents(candidateId);

  const [expanded, setExpanded]     = useState(false);
  const [grantModal, setGrantModal] = useState<ConsentType | null>(null);
  const [basis, setBasis]           = useState<LegalBasis>("legitimate_interest");
  const [consentText, setConsentText] = useState("");
  const [saving, setSaving]         = useState(false);

  const handleGrant = async () => {
    if (!grantModal) return;
    setSaving(true);
    await grantConsent(grantModal, {
      legal_basis: basis,
      consent_text: consentText || undefined,
    });
    setSaving(false);
    setGrantModal(null);
    setConsentText("");
    setBasis("legitimate_interest");
  };

  // Summary: how many are in each state
  const grantedCount = CONSENT_TYPES.filter(
    ct => getConsent(ct.type)?.status === "granted"
  ).length;
  const issueCount = CONSENT_TYPES.filter(ct => {
    const c = getConsent(ct.type);
    return c && ["withdrawn","denied","expired"].includes(c.status);
  }).length;

  return (
    <>
      {/* Panel header */}
      <div className="border rounded-lg bg-white overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
          onClick={() => setExpanded(e => !e)}
        >
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-indigo-600" />
            <span className="text-sm font-semibold text-slate-800">Privacy & Consent</span>
            {issueCount > 0 && (
              <span className="text-[10px] font-bold bg-red-100 text-red-700 rounded-full px-1.5 py-0.5">
                {issueCount} issue{issueCount > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">{grantedCount}/{CONSENT_TYPES.length} granted</span>
            {expanded ? (
              <ChevronUp className="h-3.5 w-3.5 text-slate-400" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            )}
          </div>
        </button>

        {expanded && (
          <div className="border-t divide-y">
            {CONSENT_TYPES.map(ct => {
              const consent = getConsent(ct.type);
              const status: ConsentStatus | "not_set" = consent?.status ?? "not_set";
              const isActive = status === "granted";

              return (
                <div key={ct.type} className="flex items-start gap-3 px-4 py-2.5">
                  <div className="mt-0.5">
                    <StatusIcon status={status} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium text-slate-800">{ct.label}</span>
                      {statusBadge(status)}
                      {consent?.legal_basis && (
                        <span className="text-[10px] text-slate-400 font-mono">
                          {consent.legal_basis.replace("_", " ")}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">{ct.description}</p>
                    {consent?.granted_at && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <Clock className="h-2.5 w-2.5 text-slate-400" />
                        <span className="text-[10px] text-slate-400">
                          {isActive ? "Granted" : "Updated"}{" "}
                          {new Date(consent.granted_at).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                    {consent?.expires_at && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <Clock className="h-2.5 w-2.5 text-amber-500" />
                        <span className="text-[10px] text-amber-600">
                          Expires {new Date(consent.expires_at).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex-shrink-0">
                    {isActive ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[10px] text-red-600 hover:text-red-700 hover:bg-red-50 px-2"
                        onClick={() => consent && withdrawConsent(consent.id)}
                      >
                        Withdraw
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-[10px] text-indigo-600 hover:bg-indigo-50 px-2"
                        onClick={() => setGrantModal(ct.type)}
                      >
                        <Plus className="h-2.5 w-2.5 mr-1" />
                        Grant
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Retention / erasure row */}
            <div className="px-4 py-2.5 bg-slate-50">
              <p className="text-[10px] text-slate-500">
                To process a data erasure or access request for {candidateName}, go to{" "}
                <a href="/settings/compliance" className="text-indigo-600 underline">
                  Settings → Compliance
                </a>
                .
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Grant consent modal */}
      <Dialog open={!!grantModal} onOpenChange={() => setGrantModal(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-indigo-600" />
              Record Consent
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <p className="text-sm text-slate-600">
                Recording consent for{" "}
                <span className="font-medium">{candidateName}</span>:{" "}
                <span className="font-medium">
                  {CONSENT_TYPES.find(c => c.type === grantModal)?.label}
                </span>
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Legal Basis (GDPR Art. 6)</Label>
              <Select
                value={basis}
                onValueChange={v => setBasis(v as LegalBasis)}
              >
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEGAL_BASIS_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div>
                        <div className="font-medium">{opt.label}</div>
                        <div className="text-xs text-slate-500">{opt.hint}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">
                Consent Evidence{" "}
                <span className="font-normal text-slate-400">(optional)</span>
              </Label>
              <Textarea
                placeholder="e.g. 'Candidate confirmed verbally on call 22 Apr 2026' or paste exact wording shown to candidate"
                value={consentText}
                onChange={e => setConsentText(e.target.value)}
                rows={3}
                className="text-sm resize-none"
              />
            </div>

            {basis === "legitimate_interest" && (
              <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-800">
                <strong>Legitimate interest reminder:</strong> You must have documented a Legitimate
                Interest Assessment (LIA) for this processing activity. See the Article 30 register in
                Settings → Compliance.
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setGrantModal(null)} size="sm">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleGrant}
              disabled={saving}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {saving ? "Saving…" : "Record Consent"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
