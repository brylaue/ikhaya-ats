"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  TrendingUp, Plus, Building2, Mail, Phone, Linkedin,
  ChevronRight, DollarSign, Calendar, AlertCircle,
  X, Loader2, Target, CheckCircle2, XCircle, MoreHorizontal,
  ArrowRight, Pencil, Trash2, Filter, BarChart2, FileSignature,
} from "lucide-react";
import {
  useBdPipeline, useClientMsas, useFeatureFlag,
  type BdStage,
  type BdOpportunity,
  type BdPriority,
  type NewBdOpportunityInput,
} from "@/lib/supabase/hooks";
import { cn, generateAvatarColor, getInitials } from "@/lib/utils";
import { toast } from "sonner";
import { FeatureGate } from "@/components/ui/feature-gate";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PRIORITY_CFG: Record<BdPriority, { label: string; color: string }> = {
  low:    { label: "Low",    color: "bg-slate-100 text-slate-600" },
  medium: { label: "Medium", color: "bg-amber-100 text-amber-700" },
  high:   { label: "High",   color: "bg-orange-100 text-orange-700" },
  urgent: { label: "Urgent", color: "bg-red-100 text-red-700" },
};

const SOURCE_OPTIONS = [
  "Referral", "Outbound", "Inbound", "Conference", "LinkedIn", "Cold Email", "Other"
];

function formatCurrency(v?: number) {
  if (!v) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(v);
}

function daysAgo(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

// ─── New Opportunity Modal ────────────────────────────────────────────────────

interface NewOppModalProps {
  stages:   BdStage[];
  onCreate: (input: NewBdOpportunityInput) => Promise<void>;
  onClose:  () => void;
}

function NewOppModal({ stages, onCreate, onClose }: NewOppModalProps) {
  const activeStages = stages.filter((s) => !s.isLost);

  const [companyName,  setCompanyName]  = useState("");
  const [contactName,  setContactName]  = useState("");
  const [contactTitle, setContactTitle] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactLi,    setContactLi]    = useState("");
  const [stageId,      setStageId]      = useState(activeStages[0]?.id ?? "");
  const [value,        setValue]        = useState("");
  const [probability,  setProbability]  = useState("50");
  const [nextAction,   setNextAction]   = useState("");
  const [nextActionAt, setNextActionAt] = useState("");
  const [source,       setSource]       = useState("");
  const [priority,     setPriority]     = useState<BdPriority>("medium");
  const [notes,        setNotes]        = useState("");
  const [saving,       setSaving]       = useState(false);

  async function handleSubmit() {
    if (!companyName.trim()) { toast.error("Company name is required"); return; }
    if (!stageId)            { toast.error("Select a stage");           return; }
    setSaving(true);
    try {
      await onCreate({
        companyName:    companyName.trim(),
        contactName:    contactName.trim() || undefined,
        contactTitle:   contactTitle.trim() || undefined,
        contactEmail:   contactEmail.trim() || undefined,
        contactLinkedin: contactLi.trim() || undefined,
        stageId,
        estimatedValue: value ? parseFloat(value) : undefined,
        probability:    probability ? parseInt(probability) : undefined,
        nextAction:     nextAction.trim() || undefined,
        nextActionAt:   nextActionAt || undefined,
        source:         source || undefined,
        priority,
        notes:          notes.trim() || undefined,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-border px-5 py-4 shrink-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <TrendingUp className="h-4 w-4 text-brand-500" />
            New BD Opportunity
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Company */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">Company Name *</label>
            <input
              autoFocus
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Acme Corp"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {/* Contact */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">Contact Name</label>
              <input value={contactName} onChange={(e) => setContactName(e.target.value)}
                placeholder="Jane Smith"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">Title</label>
              <input value={contactTitle} onChange={(e) => setContactTitle(e.target.value)}
                placeholder="VP of Engineering"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">Email</label>
              <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)}
                placeholder="jane@acme.com"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">LinkedIn</label>
              <input value={contactLi} onChange={(e) => setContactLi(e.target.value)}
                placeholder="linkedin.com/in/…"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          </div>

          {/* Stage + Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">Stage *</label>
              <select value={stageId} onChange={(e) => setStageId(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500">
                {activeStages.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">Priority</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as BdPriority)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500">
                {(["low","medium","high","urgent"] as BdPriority[]).map((p) => (
                  <option key={p} value={p}>{PRIORITY_CFG[p].label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Value + Probability */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">Est. Value ($)</label>
              <input type="number" value={value} onChange={(e) => setValue(e.target.value)}
                placeholder="50000"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">Probability %</label>
              <input type="number" min="0" max="100" value={probability} onChange={(e) => setProbability(e.target.value)}
                placeholder="50"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          </div>

          {/* Next action */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">Next Action</label>
              <input value={nextAction} onChange={(e) => setNextAction(e.target.value)}
                placeholder="Send proposal"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">Due Date</label>
              <input type="date" value={nextActionAt} onChange={(e) => setNextActionAt(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          </div>

          {/* Source */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">Source</label>
            <select value={source} onChange={(e) => setSource(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500">
              <option value="">Select source…</option>
              {SOURCE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
              placeholder="Context, background, relationship notes…"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4 shrink-0">
          <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving || !companyName.trim()}
            className="flex items-center gap-1.5 rounded-md bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors">
            {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Creating…</> : "Create Opportunity"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Opportunity Card ─────────────────────────────────────────────────────────

interface OppCardProps {
  opp:     BdOpportunity;
  stages:  BdStage[];
  onMove:  (oppId: string, stageId: string) => void;
  onEdit:  (opp: BdOpportunity) => void;
  onDelete:(oppId: string) => void;
}

function OppCard({ opp, stages, onMove, onEdit, onDelete }: OppCardProps) {
  const [menuOpen, setMenuOpen]         = useState(false);
  const [movingTo, setMovingTo]         = useState<string | null>(null);
  const isOverdue  = opp.nextActionAt ? new Date(opp.nextActionAt) < new Date() : false;
  const age        = daysAgo(opp.enteredStageAt);
  const currentIdx = stages.findIndex((s) => s.id === opp.stageId);
  const nextStage  = stages[currentIdx + 1];

  async function handleQuickMove() {
    if (!nextStage) return;
    setMovingTo(nextStage.id);
    await onMove(opp.id, nextStage.id);
    setMovingTo(null);
  }

  return (
    <div className="group rounded-xl border border-border bg-card p-3.5 hover:border-brand-300 transition-colors cursor-default">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold text-white", generateAvatarColor(opp.companyName))}>
            {getInitials(opp.companyName)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{opp.companyName}</p>
            {opp.contactName && (
              <p className="truncate text-xs text-muted-foreground">{opp.contactName}{opp.contactTitle ? ` · ${opp.contactTitle}` : ""}</p>
            )}
          </div>
        </div>
        <div className="relative shrink-0">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="hidden group-hover:flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground hover:bg-accent transition-colors"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full z-20 mt-1 w-32 rounded-lg border border-border bg-card shadow-lg py-1">
                <button onClick={() => { onEdit(opp); setMenuOpen(false); }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent transition-colors">
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />Edit
                </button>
                <button onClick={() => { onDelete(opp.id); setMenuOpen(false); }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Tags */}
      <div className="flex items-center gap-1.5 flex-wrap mb-2">
        <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", PRIORITY_CFG[opp.priority].color)}>
          {PRIORITY_CFG[opp.priority].label}
        </span>
        {opp.source && (
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{opp.source}</span>
        )}
        {age > 7 && (
          <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium", age > 21 ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-700")}>
            {age}d in stage
          </span>
        )}
      </div>

      {/* Value + probability */}
      {(opp.estimatedValue || opp.probability !== undefined) && (
        <div className="flex items-center gap-3 mb-2 text-xs text-muted-foreground">
          {opp.estimatedValue && (
            <span className="flex items-center gap-1">
              <DollarSign className="h-3 w-3" />
              {formatCurrency(opp.estimatedValue)}
            </span>
          )}
          {opp.probability !== undefined && (
            <span className="flex items-center gap-1">
              <Target className="h-3 w-3" />
              {opp.probability}%
            </span>
          )}
          {opp.estimatedValue && opp.probability !== undefined && (
            <span className="ml-auto font-medium text-foreground">
              {formatCurrency((opp.estimatedValue * opp.probability) / 100)} WV
            </span>
          )}
        </div>
      )}

      {/* Next action */}
      {opp.nextAction && (
        <div className={cn(
          "flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs mb-2",
          isOverdue ? "bg-red-50 text-red-600" : "bg-muted/50 text-muted-foreground"
        )}>
          {isOverdue ? <AlertCircle className="h-3 w-3 shrink-0" /> : <Calendar className="h-3 w-3 shrink-0" />}
          <span className="truncate">{opp.nextAction}</span>
          {opp.nextActionAt && (
            <span className="shrink-0 ml-auto">
              {new Date(opp.nextActionAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          )}
        </div>
      )}

      {/* Contact actions */}
      <div className="flex items-center gap-1.5">
        {opp.contactEmail && (
          <a href={`mailto:${opp.contactEmail}`} title="Email"
            className="flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground hover:text-brand-600 hover:bg-brand-50 transition-colors">
            <Mail className="h-3 w-3" />
          </a>
        )}
        {opp.contactLinkedin && (
          <a href={opp.contactLinkedin} target="_blank" rel="noopener noreferrer" title="LinkedIn"
            className="flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground hover:text-brand-600 hover:bg-brand-50 transition-colors">
            <Linkedin className="h-3 w-3" />
          </a>
        )}
        {nextStage && !nextStage.isLost && (
          <button onClick={handleQuickMove} disabled={!!movingTo}
            className="ml-auto flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-brand-600 hover:bg-brand-50 transition-colors disabled:opacity-50">
            {movingTo ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3" />}
            {nextStage.name}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── KPI Strip ────────────────────────────────────────────────────────────────

function KpiStrip({ opps, stages }: { opps: BdOpportunity[]; stages: BdStage[] }) {
  const totalPipeline = opps.reduce((sum, o) => {
    if (!o.estimatedValue || !o.probability) return sum;
    return sum + (o.estimatedValue * o.probability) / 100;
  }, 0);

  const activeCount  = opps.filter((o) => !stages.find((s) => s.id === o.stageId)?.isLost).length;
  const wonThisMonth = opps.filter((o) => {
    if (!o.wonAt) return false;
    const won = new Date(o.wonAt);
    const now = new Date();
    return won.getMonth() === now.getMonth() && won.getFullYear() === now.getFullYear();
  }).length;

  const overdueCount = opps.filter((o) =>
    o.nextActionAt && new Date(o.nextActionAt) < new Date()
  ).length;

  const kpis = [
    { label: "Active Deals",     value: activeCount.toString(),        icon: TrendingUp,    color: "text-brand-600"  },
    { label: "Weighted Pipeline", value: formatCurrency(totalPipeline), icon: DollarSign,    color: "text-emerald-600" },
    { label: "Won This Month",   value: wonThisMonth.toString(),        icon: CheckCircle2,  color: "text-emerald-600" },
    { label: "Overdue Actions",  value: overdueCount.toString(),        icon: AlertCircle,   color: overdueCount > 0 ? "text-red-600" : "text-muted-foreground" },
  ];

  return (
    <div className="grid grid-cols-4 gap-4 px-6 py-4 border-b border-border">
      {kpis.map(({ label, value, icon: Icon, color }) => (
        <div key={label} className="flex items-center gap-3">
          <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted", color)}>
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">{label}</p>
            <p className="text-lg font-bold text-foreground leading-tight">{value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function BdPipelinePage() {
  // US-513: plan gate. BD pipeline is a Pro-tier capability.
  const { enabled: bdEnabled, loading: bdLoading } = useFeatureFlag("business_development");
  const { stages, opps, loading, createOpp, moveOpp, deleteOpp } = useBdPipeline();
  const { msas: allMsas, expiringCount } = useClientMsas();  // no companyId = all agency MSAs

  const [showNewModal, setShowNewModal]   = useState(false);
  const [editingOpp, setEditingOpp]       = useState<BdOpportunity | null>(null);
  const [filterPriority, setFilterPriority] = useState<BdPriority | "all">("all");
  const [view, setView]                   = useState<"kanban" | "list">("kanban");

  const filtered = useMemo(() =>
    filterPriority === "all"
      ? opps
      : opps.filter((o) => o.priority === filterPriority),
    [opps, filterPriority]
  );

  const oppsByStage = useMemo(() => {
    const map = new Map<string, BdOpportunity[]>();
    stages.forEach((s) => map.set(s.id, []));
    filtered.forEach((o) => {
      const list = map.get(o.stageId) ?? [];
      list.push(o);
      map.set(o.stageId, list);
    });
    return map;
  }, [stages, filtered]);

  const handleCreate = useCallback(async (input: NewBdOpportunityInput) => {
    const result = await createOpp(input);
    if (result) {
      toast.success(`${input.companyName} added to BD pipeline`);
    } else {
      toast.error("Failed to create opportunity");
      throw new Error("Failed");
    }
  }, [createOpp]);

  const handleDelete = useCallback(async (oppId: string) => {
    const opp = opps.find((o) => o.id === oppId);
    await deleteOpp(oppId);
    toast.success(`${opp?.companyName ?? "Opportunity"} removed`);
  }, [opps, deleteOpp]);

  const handleMove = useCallback(async (oppId: string, stageId: string) => {
    await moveOpp(oppId, stageId);
    const stage = stages.find((s) => s.id === stageId);
    if (stage?.isWon)  toast.success("🎉 Deal won!");
    if (stage?.isLost) toast.success("Opportunity marked as lost");
  }, [moveOpp, stages]);

  // US-513: full-page upgrade card if plan doesn't include BD.
  if (!bdLoading && !bdEnabled) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <FeatureGate feature="business_development" className="max-w-sm" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-brand-500" />
              Business Development
            </h1>
            <div className="mt-1 flex items-center gap-3">
              <p className="text-sm text-muted-foreground">Track prospect companies through your BD pipeline</p>
              <Link href="/bd/target-accounts" className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
                <Target className="h-3 w-3" />Target Accounts
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Priority filter */}
            <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-1">
              {(["all", "urgent", "high", "medium", "low"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setFilterPriority(p)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    filterPriority === p
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {p === "all" ? "All" : PRIORITY_CFG[p].label}
                </button>
              ))}
            </div>
            {/* View toggle */}
            <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-1">
              <button onClick={() => setView("kanban")}
                className={cn("rounded-md p-1.5 transition-colors", view === "kanban" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>
                <Filter className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => setView("list")}
                className={cn("rounded-md p-1.5 transition-colors", view === "list" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>
                <BarChart2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <button
              onClick={() => setShowNewModal(true)}
              className="flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              New Opportunity
            </button>
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <KpiStrip opps={opps} stages={stages} />

      {/* MSA renewal alerts */}
      {expiringCount > 0 && (
        <div className="shrink-0 flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-6 py-2.5">
          <FileSignature className="h-4 w-4 text-amber-600 shrink-0" />
          <p className="text-xs text-amber-800 font-medium">
            {expiringCount} client MSA{expiringCount > 1 ? "s are" : " is"} expiring soon
            {" — "}
            <Link href="/clients" className="font-semibold underline hover:no-underline">Review agreements →</Link>
          </p>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : view === "kanban" ? (
          // ── Kanban ──────────────────────────────────────────────────────────
          <div className="flex h-full gap-3 p-4 overflow-x-auto">
            {stages.map((stage) => {
              const stageOpps = oppsByStage.get(stage.id) ?? [];
              const stageValue = stageOpps.reduce((s, o) =>
                s + ((o.estimatedValue ?? 0) * (o.probability ?? 100)) / 100, 0);

              return (
                <div key={stage.id} className="flex shrink-0 flex-col w-72">
                  {/* Column header */}
                  <div className="flex items-center justify-between mb-3 px-1">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full" style={{ backgroundColor: stage.color }} />
                      <span className="text-xs font-semibold text-foreground">{stage.name}</span>
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        {stageOpps.length}
                      </span>
                      {stage.isWon  && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                      {stage.isLost && <XCircle      className="h-3.5 w-3.5 text-rose-400"    />}
                    </div>
                    {stageValue > 0 && (
                      <span className="text-[10px] text-muted-foreground">{formatCurrency(stageValue)} WV</span>
                    )}
                  </div>

                  {/* Cards */}
                  <div className="flex-1 overflow-y-auto space-y-2 pb-4">
                    {stageOpps.map((opp) => (
                      <OppCard
                        key={opp.id}
                        opp={opp}
                        stages={stages}
                        onMove={handleMove}
                        onEdit={setEditingOpp}
                        onDelete={handleDelete}
                      />
                    ))}
                    {stageOpps.length === 0 && (
                      <div className="rounded-xl border border-dashed border-border p-4 text-center">
                        <p className="text-xs text-muted-foreground">No opportunities</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          // ── List view ────────────────────────────────────────────────────────
          <div className="p-6 max-w-5xl mx-auto">
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Company</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Contact</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Stage</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Value</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Prob.</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Next Action</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Priority</th>
                    <th className="px-4 py-3 text-xs font-semibold text-muted-foreground"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                        No opportunities yet.{" "}
                        <button onClick={() => setShowNewModal(true)} className="text-brand-600 hover:underline">Add one</button>
                      </td>
                    </tr>
                  )}
                  {filtered.map((opp) => {
                    const stage = stages.find((s) => s.id === opp.stageId);
                    const isOverdue = opp.nextActionAt ? new Date(opp.nextActionAt) < new Date() : false;
                    return (
                      <tr key={opp.id} className="hover:bg-accent/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[9px] font-bold text-white", generateAvatarColor(opp.companyName))}>
                              {getInitials(opp.companyName)}
                            </div>
                            <span className="font-medium text-foreground">{opp.companyName}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {opp.contactName ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          {stage && (
                            <span className="flex items-center gap-1 text-xs">
                              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: stage.color }} />
                              {stage.name}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{formatCurrency(opp.estimatedValue)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{opp.probability != null ? `${opp.probability}%` : "—"}</td>
                        <td className="px-4 py-3">
                          {opp.nextAction ? (
                            <span className={cn("text-xs", isOverdue && "text-red-600 font-medium")}>
                              {opp.nextAction}
                              {opp.nextActionAt && ` · ${new Date(opp.nextActionAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", PRIORITY_CFG[opp.priority].color)}>
                            {PRIORITY_CFG[opp.priority].label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => setEditingOpp(opp)} className="text-muted-foreground hover:text-foreground transition-colors">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showNewModal && (
        <NewOppModal
          stages={stages}
          onCreate={handleCreate}
          onClose={() => setShowNewModal(false)}
        />
      )}
    </div>
  );
}
