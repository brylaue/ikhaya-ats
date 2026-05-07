"use client";

/**
 * OfferLetterPanel — create, edit, approve, and send offer letters for a candidate.
 *
 * Workflow: draft → pending_approval → approved → sent → accepted/declined
 */

import { useState } from "react";
import {
  FileSignature, Plus, ChevronDown, ChevronUp, Send, Check,
  Clock, Loader2, Trash2, ThumbsUp, ThumbsDown, RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useOfferLetters, useOfferLetterTemplates,
  type OfferLetter, type OfferLetterStatus,
} from "@/lib/supabase/hooks";
import { toast } from "sonner";

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CFG: Record<OfferLetterStatus, { label: string; color: string; bg: string; border: string }> = {
  draft:            { label: "Draft",            color: "text-slate-700",   bg: "bg-slate-50",   border: "border-slate-200"   },
  pending_approval: { label: "Pending Approval", color: "text-amber-700",   bg: "bg-amber-50",   border: "border-amber-200"   },
  approved:         { label: "Approved",         color: "text-brand-700",    bg: "bg-brand-50",    border: "border-brand-200"    },
  sent:             { label: "Sent",             color: "text-violet-700",  bg: "bg-violet-50",  border: "border-violet-200"  },
  accepted:         { label: "Accepted",         color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" },
  declined:         { label: "Declined",         color: "text-red-700",     bg: "bg-red-50",     border: "border-red-200"     },
  expired:          { label: "Expired",          color: "text-muted-foreground", bg: "bg-muted", border: "border-border"      },
};

/** Replace {{variable}} in template body */
function resolveTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

// ── Offer letter card ─────────────────────────────────────────────────────────

function OfferCard({
  offer,
  onApprove,
  onReject,
  onSend,
  onMarkAccepted,
  onMarkDeclined,
  onDelete,
}: {
  offer: OfferLetter;
  onApprove:     () => void;
  onReject:      (reason: string) => void;
  onSend:        () => void;
  onMarkAccepted: () => void;
  onMarkDeclined: () => void;
  onDelete:      () => void;
}) {
  const [expanded,     setExpanded]     = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showReject,   setShowReject]   = useState(false);
  const scfg = STATUS_CFG[offer.status];

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex cursor-pointer items-center gap-3 px-4 py-3" onClick={() => setExpanded((p) => !p)}>
        <FileSignature className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground truncate">
              {offer.jobTitle ?? "Offer Letter"}
            </span>
            <span className={cn("rounded-full border px-1.5 py-0.5 text-[9px] font-semibold", scfg.bg, scfg.color, scfg.border)}>
              {scfg.label}
            </span>
            {offer.expiresAt && offer.status === "sent" && (
              <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                <Clock className="h-3 w-3" />
                Expires {new Date(offer.expiresAt).toLocaleDateString()}
              </span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Created {new Date(offer.createdAt).toLocaleDateString()}
            {offer.sentAt && ` · Sent ${new Date(offer.sentAt).toLocaleDateString()}`}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="rounded-md p-1 text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border px-4 py-4 space-y-4">
          {/* Body preview */}
          <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 max-h-48 overflow-y-auto">
            <pre className="text-xs text-foreground whitespace-pre-wrap font-sans">{offer.body}</pre>
          </div>

          {/* Approval actions */}
          {offer.status === "draft" && (
            <div className="flex items-center gap-2">
              <button
                onClick={onApprove}
                className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
              >
                <ThumbsUp className="h-3 w-3" />Submit for Approval
              </button>
            </div>
          )}

          {offer.status === "pending_approval" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={onApprove}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors"
                >
                  <ThumbsUp className="h-3 w-3" />Approve
                </button>
                <button
                  onClick={() => setShowReject((p) => !p)}
                  className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors"
                >
                  <ThumbsDown className="h-3 w-3" />Reject
                </button>
              </div>
              {showReject && (
                <div className="flex items-center gap-2">
                  <input
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Reason for rejection…"
                    className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <button
                    onClick={() => { onReject(rejectReason); setShowReject(false); }}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                  >
                    Confirm
                  </button>
                </div>
              )}
            </div>
          )}

          {offer.status === "approved" && (
            <button
              onClick={onSend}
              className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
            >
              <Send className="h-3 w-3" />Send to Candidate
            </button>
          )}

          {offer.status === "sent" && (
            <div className="flex items-center gap-2">
              <button
                onClick={onMarkAccepted}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors"
              >
                <Check className="h-3 w-3" />Mark Accepted
              </button>
              <button
                onClick={onMarkDeclined}
                className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors"
              >
                <RotateCcw className="h-3 w-3" />Mark Declined
              </button>
            </div>
          )}

          {(offer.status === "accepted" || offer.status === "declined") && (
            <div className={cn("rounded-lg border px-3 py-2 text-xs font-medium", scfg.bg, scfg.border, scfg.color)}>
              Candidate {offer.status} this offer
              {offer.respondedAt && ` on ${new Date(offer.respondedAt).toLocaleDateString()}`}
            </div>
          )}

          {offer.rejectionReason && (
            <p className="text-xs text-red-600 italic">Rejected: {offer.rejectionReason}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Generator form ────────────────────────────────────────────────────────────

function GeneratorForm({
  candidateId,
  candidateName,
  jobId,
  onCreate,
  onClose,
}: {
  candidateId:  string;
  candidateName?: string;
  jobId?:       string | null;
  onCreate:     ReturnType<typeof useOfferLetters>["createOffer"];
  onClose:      () => void;
}) {
  const { templates } = useOfferLetterTemplates();
  const [templateId,  setTemplateId]  = useState<string>(templates.find((t) => t.isDefault)?.id ?? "");
  const [bodyDraft,   setBodyDraft]   = useState("");
  const [varValues,   setVarValues]   = useState<Record<string, string>>({});
  const [expiresAt,   setExpiresAt]   = useState("");
  const [saving,      setSaving]      = useState(false);

  const template = templates.find((t) => t.id === templateId);

  // When template changes, seed var defaults + regenerate body
  function onTemplateChange(id: string) {
    setTemplateId(id);
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) { setBodyDraft(""); return; }
    const defaults = Object.fromEntries(
      tpl.variables.map((v) => [v.key, v.defaultValue || (
        v.key === "candidate_name" ? (candidateName ?? "") :
        v.key === "date" ? new Date().toLocaleDateString() : ""
      )])
    );
    setVarValues(defaults);
    setBodyDraft(resolveTemplate(tpl.body, defaults));
  }

  function onVarChange(key: string, value: string) {
    const next = { ...varValues, [key]: value };
    setVarValues(next);
    if (template) setBodyDraft(resolveTemplate(template.body, next));
  }

  async function handleCreate() {
    if (!bodyDraft.trim()) { toast.error("Offer letter body cannot be empty"); return; }
    setSaving(true);
    try {
      const result = await onCreate({
        templateId:  templateId || null,
        candidateId,
        jobId:       jobId ?? null,
        body:        bodyDraft,
        variables:   varValues,
        expiresAt:   expiresAt || null,
      });
      if ("error" in result && result.error) {
        toast.error(result.error);
      } else {
        toast.success("Offer letter created");
        onClose();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-brand-200 bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">Generate Offer Letter</p>
        <button onClick={onClose} className="text-[11px] text-muted-foreground hover:text-foreground">Cancel</button>
      </div>

      {/* Template picker */}
      {templates.length > 0 && (
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Template</label>
          <select
            value={templateId}
            onChange={(e) => onTemplateChange(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">— blank —</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.isDefault ? " (default)" : ""}</option>)}
          </select>
        </div>
      )}

      {/* Variable inputs */}
      {template && template.variables.length > 0 && (
        <div className="space-y-3">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Fill In Variables</p>
          <div className="grid grid-cols-2 gap-3">
            {template.variables.map((v) => (
              <div key={v.key} className="space-y-0.5">
                <label className="text-[10px] font-medium text-muted-foreground">{v.label}</label>
                <input
                  value={varValues[v.key] ?? ""}
                  onChange={(e) => onVarChange(v.key, e.target.value)}
                  placeholder={v.defaultValue}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Body editor */}
      <div className="space-y-1">
        <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Letter Body</label>
        <textarea
          value={bodyDraft}
          onChange={(e) => setBodyDraft(e.target.value)}
          rows={10}
          placeholder="Write or paste offer letter content here. Use {{variable_name}} for placeholders."
          className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500 font-mono text-xs"
        />
      </div>

      {/* Expiry */}
      <div className="space-y-1">
        <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Offer Expiry (optional)</label>
        <input
          type="date"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      <button
        onClick={handleCreate}
        disabled={saving || !bodyDraft.trim()}
        className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        Create Offer Letter
      </button>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface OfferLetterPanelProps {
  candidateId:   string | null | undefined;
  candidateName?: string;
  jobId?:        string | null;
}

export function OfferLetterPanel({ candidateId, candidateName, jobId }: OfferLetterPanelProps) {
  const { offers, loading, createOffer, updateOfferStatus, deleteOffer } =
    useOfferLetters({ candidateId: candidateId ?? undefined, jobId: jobId ?? undefined });
  const [showForm, setShowForm] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />Loading offer letters…
      </div>
    );
  }

  async function handleStatusChange(id: string, status: OfferLetterStatus, extra?: Parameters<typeof updateOfferStatus>[2]) {
    const result = await updateOfferStatus(id, status, extra);
    if ("error" in result && result.error) { toast.error(result.error); return; }
    toast.success(`Offer ${status.replace(/_/g, " ")}`);
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">
          {offers.length} offer letter{offers.length !== 1 ? "s" : ""}
        </span>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1 rounded-md border border-brand-200 bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700 hover:bg-brand-100 transition-colors"
          >
            <Plus className="h-3 w-3" />Generate Offer
          </button>
        )}
      </div>

      {/* Form */}
      {showForm && candidateId && (
        <GeneratorForm
          candidateId={candidateId}
          candidateName={candidateName}
          jobId={jobId}
          onCreate={createOffer}
          onClose={() => setShowForm(false)}
        />
      )}

      {/* Empty state */}
      {offers.length === 0 && !showForm && (
        <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center">
          <FileSignature className="mx-auto mb-2 h-6 w-6 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No offer letters yet</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Generate one from a template</p>
        </div>
      )}

      {/* Offer cards */}
      {offers.map((offer) => (
        <OfferCard
          key={offer.id}
          offer={offer}
          onApprove={() => {
            const nextStatus: OfferLetterStatus = offer.status === "draft" ? "pending_approval" : "approved";
            handleStatusChange(offer.id, nextStatus, nextStatus === "approved" ? { approvedAt: new Date().toISOString() } : undefined);
          }}
          onReject={(reason) => handleStatusChange(offer.id, "draft", { rejectionReason: reason })}
          onSend={() => handleStatusChange(offer.id, "sent", { sentAt: new Date().toISOString() })}
          onMarkAccepted={() => handleStatusChange(offer.id, "accepted", { candidateResponse: "accepted", respondedAt: new Date().toISOString() })}
          onMarkDeclined={() => handleStatusChange(offer.id, "declined", { candidateResponse: "declined", respondedAt: new Date().toISOString() })}
          onDelete={() => { deleteOffer(offer.id); toast.success("Offer letter deleted"); }}
        />
      ))}
    </div>
  );
}
