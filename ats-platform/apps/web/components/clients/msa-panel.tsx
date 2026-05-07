"use client";

import { useState } from "react";
import {
  FileSignature, Plus, AlertTriangle, CheckCircle2,
  Clock, XCircle, RefreshCw, Loader2, Pencil, Trash2,
  ExternalLink, ChevronDown,
} from "lucide-react";
import {
  useClientMsas, type MsaStatus, type NewMsaInput,
} from "@/lib/supabase/hooks";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Config ───────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<MsaStatus, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  draft:      { label: "Draft",      icon: Clock,         color: "text-slate-600",   bg: "bg-slate-100"   },
  active:     { label: "Active",     icon: CheckCircle2,  color: "text-emerald-600", bg: "bg-emerald-100" },
  expired:    { label: "Expired",    icon: XCircle,       color: "text-red-600",     bg: "bg-red-100"     },
  terminated: { label: "Terminated", icon: XCircle,       color: "text-rose-600",    bg: "bg-rose-100"    },
  renewed:    { label: "Renewed",    icon: RefreshCw,     color: "text-brand-600",    bg: "bg-brand-100"    },
};

// ─── MSA form ─────────────────────────────────────────────────────────────────

interface MsaFormProps {
  companyId:  string;
  initial?:   Partial<NewMsaInput>;
  onSave:     (input: NewMsaInput) => Promise<void>;
  onClose:    () => void;
}

function MsaForm({ companyId, initial, onSave, onClose }: MsaFormProps) {
  const [title, setTitle]       = useState(initial?.title ?? "Master Service Agreement");
  const [signedAt, setSignedAt] = useState(initial?.signedAt ?? "");
  const [effective, setEff]     = useState(initial?.effectiveDate ?? "");
  const [expiry, setExpiry]     = useState(initial?.expiryDate ?? "");
  const [autoRenew, setAuto]    = useState(initial?.autoRenews ?? false);
  const [noticeDays, setNotice] = useState(String(initial?.renewalNoticeDays ?? 60));
  const [feeCap, setFeeCap]     = useState(initial?.feeCap ? String(initial.feeCap) : "");
  const [excl, setExcl]         = useState(initial?.exclusivity ?? "");
  const [notes, setNotes]       = useState(initial?.notes ?? "");
  const [docUrl, setDocUrl]     = useState(initial?.documentUrl ?? "");
  const [saving, setSaving]     = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({
        companyId,
        title:              title || "Master Service Agreement",
        signedAt:           signedAt || undefined,
        effectiveDate:      effective || undefined,
        expiryDate:         expiry || undefined,
        autoRenews:         autoRenew,
        renewalNoticeDays:  parseInt(noticeDays) || 60,
        feeCap:             feeCap ? parseFloat(feeCap) : undefined,
        exclusivity:        excl || undefined,
        notes:              notes || undefined,
        documentUrl:        docUrl || undefined,
      });
      onClose();
    } finally { setSaving(false); }
  }

  return (
    <div className="rounded-xl border border-dashed border-brand-300 bg-brand-50/40 p-4 space-y-3">
      <p className="text-xs font-semibold text-foreground">{initial?.title ? "Edit MSA" : "Add MSA"}</p>
      <div className="space-y-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Agreement title…"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500" />
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="block text-[10px] text-muted-foreground mb-1">Signed</label>
            <input type="date" value={signedAt} onChange={(e) => setSignedAt(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-[10px] text-muted-foreground mb-1">Effective</label>
            <input type="date" value={effective} onChange={(e) => setEff(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div>
            <label className="block text-[10px] text-muted-foreground mb-1">Expiry</label>
            <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] text-muted-foreground mb-1">Exclusivity</label>
            <select value={excl} onChange={(e) => setExcl(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-brand-500">
              <option value="">—</option>
              <option value="exclusive">Exclusive</option>
              <option value="non-exclusive">Non-exclusive</option>
              <option value="partial">Partial</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-muted-foreground mb-1">Fee Cap</label>
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
              <input type="number" value={feeCap} onChange={(e) => setFeeCap(e.target.value)} placeholder="No cap"
                className="w-full rounded-lg border border-border bg-background pl-5 pr-2 py-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={autoRenew} onChange={(e) => setAuto(e.target.checked)} className="rounded" />
            <span className="text-xs text-foreground">Auto-renews</span>
          </label>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Alert</span>
            <input type="number" value={noticeDays} onChange={(e) => setNotice(e.target.value)} min="7" max="365"
              className="w-12 rounded border border-border bg-background px-1.5 py-1 text-xs text-foreground outline-none focus:ring-1 focus:ring-brand-500" />
            <span className="text-xs text-muted-foreground">days before expiry</span>
          </div>
        </div>
        <input value={docUrl} onChange={(e) => setDocUrl(e.target.value)} placeholder="Document URL (optional)…"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500" />
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes…" rows={2} resize-none
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
      </div>
      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 rounded-lg border border-border py-2 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors">Cancel</button>
        <button onClick={handleSave} disabled={saving}
          className="flex-1 rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto" /> : "Save MSA"}
        </button>
      </div>
    </div>
  );
}

// ─── Status badge + dropdown ──────────────────────────────────────────────────

function MsaStatusBadge({ msaId, current, onChange }: { msaId: string; current: MsaStatus; onChange: (id: string, s: MsaStatus) => void }) {
  const [open, setOpen] = useState(false);
  const cfg = STATUS_CFG[current];
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)}
        className={cn("flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold", cfg.bg, cfg.color)}>
        <cfg.icon className="h-3 w-3" />{cfg.label}<ChevronDown className="h-2.5 w-2.5 opacity-70" />
      </button>
      {open && (
        <div className="absolute right-0 top-7 z-20 min-w-[140px] rounded-xl border border-border bg-card shadow-lg py-1">
          {(Object.keys(STATUS_CFG) as MsaStatus[]).map((s) => {
            const c = STATUS_CFG[s];
            return (
              <button key={s} onClick={() => { onChange(msaId, s); setOpen(false); }}
                className={cn("flex w-full items-center gap-2 px-3 py-2 text-xs font-medium transition-colors hover:bg-accent", current === s && "bg-accent")}>
                <c.icon className={cn("h-3.5 w-3.5", c.color)} />{c.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

interface MsaPanelProps {
  companyId: string;
}

export function MsaPanel({ companyId }: MsaPanelProps) {
  const { msas, loading, createMsa, updateMsa, deleteMsa } = useClientMsas(companyId);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId]     = useState<string | null>(null);

  async function handleCreate(input: NewMsaInput) {
    const ok = await createMsa(input);
    if (ok) toast.success("MSA added");
    else { toast.error("Failed to add MSA"); throw new Error("Failed"); }
  }

  async function handleStatus(id: string, status: MsaStatus) {
    await updateMsa(id, { status });
    toast.success(`MSA marked ${STATUS_CFG[status].label.toLowerCase()}`);
  }

  async function handleDelete(id: string) {
    await deleteMsa(id);
    toast.success("MSA removed");
  }

  const editMsa = msas.find((m) => m.id === editId);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <FileSignature className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">MSA / Agreements</span>
        </div>
        {!showForm && !editId && (
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:bg-brand-50 rounded-md px-2 py-1 transition-colors">
            <Plus className="h-3.5 w-3.5" />Add MSA
          </button>
        )}
      </div>

      {loading && <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>}

      {!loading && msas.length === 0 && !showForm && (
        <div className="rounded-xl border border-dashed border-border p-5 text-center">
          <FileSignature className="mx-auto h-6 w-6 text-muted-foreground/40 mb-2" />
          <p className="text-xs text-muted-foreground">No agreements on file</p>
          <button onClick={() => setShowForm(true)} className="mt-1.5 text-xs font-medium text-brand-600 hover:underline">+ Add MSA</button>
        </div>
      )}

      {/* MSA rows */}
      {!loading && msas.map((msa) => {
        if (editId === msa.id) return (
          <MsaForm key={msa.id}
            companyId={companyId}
            initial={{ title: msa.title, signedAt: msa.signedAt ?? undefined, effectiveDate: msa.effectiveDate ?? undefined,
              expiryDate: msa.expiryDate ?? undefined, autoRenews: msa.autoRenews, renewalNoticeDays: msa.renewalNoticeDays,
              feeCap: msa.feeCap ?? undefined, exclusivity: msa.exclusivity ?? undefined, notes: msa.notes ?? undefined,
              documentUrl: msa.documentUrl ?? undefined }}
            onSave={async (input) => { await updateMsa(msa.id, input); toast.success("MSA updated"); }}
            onClose={() => setEditId(null)}
          />
        );

        const cfg = STATUS_CFG[msa.status];

        return (
          <div key={msa.id} className={cn("group rounded-xl border bg-card p-4 space-y-2", msa.isExpiringSoon && msa.status === "active" ? "border-amber-300" : "border-border")}>
            {/* Expiry warning */}
            {msa.isExpiringSoon && msa.status === "active" && (
              <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                <p className="text-xs text-amber-700 font-medium">
                  {msa.daysUntilExpiry !== null && msa.daysUntilExpiry >= 0
                    ? `Expires in ${msa.daysUntilExpiry} day${msa.daysUntilExpiry === 1 ? "" : "s"} — consider renewal`
                    : "Expiry date is in the past — review status"}
                </p>
              </div>
            )}

            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">{msa.title}</span>
                  {msa.autoRenews && (
                    <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold text-brand-700">Auto-renews</span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {msa.effectiveDate && <span>Effective {new Date(msa.effectiveDate).toLocaleDateString()}</span>}
                  {msa.expiryDate    && <span>Expires {new Date(msa.expiryDate).toLocaleDateString()}</span>}
                  {msa.exclusivity   && <span className="capitalize">{msa.exclusivity}</span>}
                  {msa.feeCap !== null && <span>Cap ${msa.feeCap.toLocaleString()}</span>}
                </div>
                {msa.notes && <p className="mt-1 text-xs text-muted-foreground">{msa.notes}</p>}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <MsaStatusBadge msaId={msa.id} current={msa.status} onChange={handleStatus} />
                <div className="hidden group-hover:flex items-center gap-1">
                  {msa.documentUrl && (
                    <a href={msa.documentUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground hover:text-brand-600 hover:bg-brand-50 transition-colors">
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  <button onClick={() => setEditId(msa.id)}
                    className="flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button onClick={() => handleDelete(msa.id)}
                    className="flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* Add form */}
      {showForm && (
        <MsaForm companyId={companyId} onSave={handleCreate} onClose={() => setShowForm(false)} />
      )}
    </div>
  );
}
