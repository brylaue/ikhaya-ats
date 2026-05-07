"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft, Building2, MapPin, Globe, Mail, Phone,
  Briefcase, Users, Star, TrendingUp, Clock, ExternalLink,
  Plus, CheckCircle2, AlertCircle, Edit3, ClipboardList, Check,
  X, Loader2,
} from "lucide-react";
import { useCompany, useJobsByClient, useContacts, useTasks, usePlacementsByClient } from "@/lib/supabase/hooks";
import type { DbContact, TaskRecord } from "@/lib/supabase/hooks";
import { MsaPanel } from "@/components/clients/msa-panel";
import { ClientIntelligencePanel } from "@/components/clients/client-intelligence-panel";
import { PortalAuditTrail } from "@/components/clients/portal-audit-trail";
import { cn, formatSalary, getInitials, generateAvatarColor, STATUS_COLORS, STATUS_LABELS } from "@/lib/utils";
import { TaskPanel } from "@/components/tasks/task-panel";
import { toast } from "sonner";
import type { Task, TaskPriority } from "@/components/tasks/task-panel";

// ─── Portal Access Panel (US-475) ─────────────────────────────────────────────

interface PortalInvite {
  id:           string;
  email:        string;
  name:         string | null;
  can_feedback: boolean;
  accepted_at:  string | null;
  revoked_at:   string | null;
  expires_at:   string;
  created_at:   string;
}

function PortalAccessPanel({ companyId, portalSlug }: { companyId: string; portalSlug: string }) {
  const [invites,     setInvites]     = useState<PortalInvite[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [showForm,    setShowForm]    = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName,  setInviteName]  = useState("");
  const [sending,     setSending]     = useState(false);

  useEffect(() => {
    fetch(`/api/client-invites?companyId=${companyId}`)
      .then(r => r.ok ? r.json() : [])
      .then(setInvites)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [companyId]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.includes("@")) { toast.error("Enter a valid email"); return; }
    setSending(true);
    try {
      const res = await fetch("/api/client-invites", {
        method:  "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": "1" },
        body:    JSON.stringify({ companyId, email: inviteEmail.trim(), name: inviteName.trim() || undefined }),
      });
      if (!res.ok) { toast.error("Failed to send invite"); return; }
      const { id } = await res.json() as { id: string };
      setInvites(prev => [{
        id,
        email:        inviteEmail.trim().toLowerCase(),
        name:         inviteName.trim() || null,
        can_feedback: true,
        accepted_at:  null,
        revoked_at:   null,
        expires_at:   new Date(Date.now() + 14 * 86400000).toISOString(),
        created_at:   new Date().toISOString(),
      }, ...prev]);
      toast.success(`Invite sent to ${inviteEmail}`);
      setInviteEmail("");
      setInviteName("");
      setShowForm(false);
    } finally {
      setSending(false);
    }
  }

  async function handleRevoke(id: string) {
    await fetch(`/api/client-invites/${id}`, {
      method: "DELETE",
      headers: { "x-csrf-token": "1" },
    });
    setInvites(prev => prev.map(i => i.id === id ? { ...i, revoked_at: new Date().toISOString() } : i));
    toast.success("Access revoked");
  }

  const APP_URL = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Portal Access</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Invite hiring managers to review shortlists</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`${APP_URL}/portal/${portalSlug}`}
            target="_blank"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink className="h-3 w-3" />Portal
          </a>
          <button
            onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
          >
            <Plus className="h-3.5 w-3.5" />{showForm ? "Cancel" : "Invite"}
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleInvite} className="px-4 py-3 space-y-2 bg-muted/30 border-b border-border">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Name</label>
              <input
                value={inviteName}
                onChange={e => setInviteName(e.target.value)}
                placeholder="Jane Smith"
                className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Email *</label>
              <input
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="jane@company.com"
                required
                className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={sending}
            className="flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors"
          >
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
            {sending ? "Sending…" : "Send Invite"}
          </button>
        </form>
      )}

      {loading ? (
        <p className="px-4 py-6 text-center text-xs text-muted-foreground">Loading…</p>
      ) : invites.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-muted-foreground">No portal invites yet</p>
      ) : (
        <div className="divide-y divide-border">
          {invites.map(inv => {
            const expired  = new Date(inv.expires_at) < new Date();
            const accepted = !!inv.accepted_at;
            const revoked  = !!inv.revoked_at;
            return (
              <div key={inv.id} className="flex items-center gap-3 px-4 py-3">
                <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white",
                  revoked ? "bg-slate-400" : accepted ? "bg-emerald-500" : "bg-brand-500"
                )}>
                  {(inv.name || inv.email).slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{inv.name || inv.email}</p>
                  <p className="text-xs text-muted-foreground truncate">{inv.email}</p>
                </div>
                <div className="shrink-0">
                  {revoked ? (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">Revoked</span>
                  ) : accepted ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Active</span>
                  ) : expired ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Expired</span>
                  ) : (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">Pending</span>
                  )}
                </div>
                {!revoked && (
                  <button
                    onClick={() => handleRevoke(inv.id)}
                    className="shrink-0 rounded-md p-1 text-muted-foreground/50 hover:text-red-500 transition-colors"
                    title="Revoke access"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function HealthScoreBadge({ score }: { score: number }) {
  const cfg = score >= 80
    ? { bg: "bg-emerald-100", text: "text-emerald-700", label: "Healthy" }
    : score >= 60
    ? { bg: "bg-amber-100",   text: "text-amber-700",   label: "Moderate" }
    : { bg: "bg-red-100",     text: "text-red-700",     label: "At Risk" };
  return (
    <span className={cn("flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", cfg.bg, cfg.text)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", score >= 80 ? "bg-emerald-500" : score >= 60 ? "bg-amber-500" : "bg-red-500")} />
      {cfg.label} · {score}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const TABS = ["overview", "jobs", "contacts", "agreements", "tasks", "intelligence", "portal_audit"] as const;
type Tab = typeof TABS[number];

export default function ClientDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  // US-316: scoped lookups instead of "load all then find"
  const { company, loading: companiesLoading } = useCompany(params.id);
  const { jobs: clientJobs } = useJobsByClient(params.id);
  const { contacts, addContact } = useContacts(params.id);
  const { tasks: rawTasks, addTask, toggleTask, deleteTask } = useTasks(params.id, "client");
  const { placements } = usePlacementsByClient(params.id);
  const [activeTab, setActiveTab]     = useState<Tab>("overview");
  const [tasks, setTasks]             = useState<Task[]>([]);

  useEffect(() => {
    setTasks(rawTasks.map((r: TaskRecord): Task => ({
      id:           r.id,
      title:        r.title,
      priority:     r.priority as TaskPriority,
      status:       r.status as Task["status"],
      dueDate:      r.dueDate,
      assigneeId:   r.assigneeId,
      assigneeName: r.assigneeName,
      entityType:   r.entityType as Task["entityType"],
      entityId:     r.entityId,
      createdAt:    r.createdAt,
    })));
  }, [rawTasks]);
  const [intakeCopied,     setIntakeCopied]     = useState(false);
  const [creatingIntake,   setCreatingIntake]   = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [addingContact, setAddingContact]   = useState(false);
  const [newContact, setNewContact]   = useState({ firstName: "", lastName: "", title: "", email: "", phone: "" });
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [editContactForm, setEditContactForm]   = useState({ title: "", email: "", phone: "" });

  async function handleCreateIntakeLink() {
    setCreatingIntake(true);
    try {
      const res = await fetch("/api/intake-requests", {
        method:  "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": "1" },
        body:    JSON.stringify({ companyId: params.id }),
      });
      if (!res.ok) { toast.error("Failed to create intake link"); return; }
      const data = await res.json() as { intakeUrl: string };
      await navigator.clipboard.writeText(data.intakeUrl);
      setIntakeCopied(true);
      toast.success("Intake link copied to clipboard!");
      setTimeout(() => setIntakeCopied(false), 3000);
    } catch {
      toast.error("Could not create intake link");
    } finally {
      setCreatingIntake(false);
    }
  }

  if (companiesLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Client not found. <Link href="/clients" className="text-brand-600 hover:underline">← Back</Link></p>
      </div>
    );
  }

  // awaitingFeedback = active jobs (awaiting client portal feedback)
  const awaitingFeedback = clientJobs.filter((j) => j.status === "active");
  const openTaskCount = tasks.filter((t) => t.status === "open").length;
  // submitted = placements as proxy (candidates that completed the full submission flow)
  const submitted       = placements;
  // response rate: placements / total submitted (use job candidateCount as proxy)
  const totalSubmitted  = clientJobs.reduce((s, j) => s + (j.candidateCount ?? 0), 0);
  const responseRate    = totalSubmitted > 0 ? Math.round((placements.length / totalSubmitted) * 100) : 0;

  // Build a client-shaped object from the company row
  const client = {
    id:             company.id,
    name:           company.name,
    industry:       company.industry ?? "—",
    portalSlug:     company.portal_slug ?? company.id,
    healthScore:    85,
    createdAt:      new Date().toISOString(),
    activeJobCount: clientJobs.filter((j) => j.status === "active").length,
    placementsYtd:  placements.filter((p) => new Date(p.placedAt).getFullYear() === new Date().getFullYear()).length,
    website:        company.website,
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-border bg-card px-6 py-4">
        <div className="mb-3">
          <Link href="/clients" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-fit">
            <ChevronLeft className="h-3.5 w-3.5" />All Clients
          </Link>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white shadow-sm", generateAvatarColor(client.id))}>
              {getInitials(client.name)}
            </div>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl font-bold text-foreground">{client.name}</h1>
                <HealthScoreBadge score={client.healthScore} />
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">{client.industry}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              href={`/portal/${client.portalSlug}`}
              target="_blank"
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />Client Portal
            </Link>
            <button
              onClick={handleCreateIntakeLink}
              disabled={creatingIntake}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors disabled:opacity-60"
              title="Create a shareable intake form link for this client"
            >
              {intakeCopied
                ? <><Check className="h-3.5 w-3.5 text-emerald-600" /><span className="text-emerald-600">Copied!</span></>
                : <><ClipboardList className="h-3.5 w-3.5" />Intake Form</>
              }
            </button>
            <Link
              href={`/jobs/new?clientId=${company.id}&clientName=${encodeURIComponent(company.name)}`}
              className="flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />New Search
            </Link>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-4 flex gap-0">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize",
                activeTab === tab ? "border-brand-600 text-brand-600" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {tab}
              {tab === "tasks" && openTaskCount > 0 && (
                <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold text-brand-700 leading-none">{openTaskCount}</span>
              )}
              {tab === "jobs" && (
                <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground leading-none">{clientJobs.length}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">

        {/* ── Overview ── */}
        {activeTab === "overview" && (
          <div className="p-6 space-y-6">
            {/* KPI row */}
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: "Active Searches", value: client.activeJobCount,  icon: Briefcase, iconClass: "bg-brand-50 text-brand-600"    },
                { label: "Placements YTD",  value: client.placementsYtd,   icon: CheckCircle2, iconClass: "bg-emerald-50 text-emerald-600" },
                { label: "Submitted",       value: submitted.length,        icon: Users, iconClass: "bg-violet-50 text-violet-600"  },
                { label: "Response Rate",   value: `${responseRate}%`,      icon: Clock, iconClass: responseRate >= 70 ? "bg-emerald-50 text-emerald-600" : responseRate >= 40 ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-600" },
              ].map((kpi) => {
                const Icon = kpi.icon;
                return (
                  <div key={kpi.label} className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{kpi.label}</p>
                      <div className={cn("rounded-lg p-1.5", kpi.iconClass.split(" ")[0])}>
                        <Icon className={cn("h-3.5 w-3.5", kpi.iconClass.split(" ")[1])} />
                      </div>
                    </div>
                    <p className="mt-2 text-2xl font-bold text-foreground">{kpi.value}</p>
                  </div>
                );
              })}
            </div>

            {/* Two-column */}
            <div className="grid grid-cols-2 gap-6">
              {/* Pending feedback */}
              <div className="rounded-xl border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <h3 className="text-sm font-semibold text-foreground">Awaiting Feedback</h3>
                  {awaitingFeedback.length > 0 && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">{awaitingFeedback.length}</span>
                  )}
                </div>
                <div className="divide-y divide-border">
                  {awaitingFeedback.length === 0 && (
                    <p className="px-4 py-6 text-center text-xs text-muted-foreground">All caught up!</p>
                  )}
                  {awaitingFeedback.slice(0, 5).map((job) => (
                    <Link key={job.id} href={`/jobs/${job.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-accent/40 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{job.title}</p>
                        <p className="text-[11px] text-muted-foreground">{job.location ?? "Remote"}</p>
                      </div>
                      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", STATUS_COLORS[job.status])}>
                        {STATUS_LABELS[job.status]}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>

              {/* Recent placements */}
              <div className="rounded-xl border border-border bg-card">
                <div className="border-b border-border px-4 py-3">
                  <h3 className="text-sm font-semibold text-foreground">Recent Placements</h3>
                </div>
                <div className="divide-y divide-border">
                  {placements.length === 0 && (
                    <p className="px-4 py-6 text-center text-xs text-muted-foreground">No placements yet</p>
                  )}
                  {placements.slice(0, 5).map((p) => (
                    <Link key={p.id} href={`/placements/${p.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-accent/40 transition-colors">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{p.candidateName}</p>
                        <p className="text-[11px] text-muted-foreground">{p.jobTitle}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-xs font-semibold text-foreground">{p.currency} {(p.feeAmount / 1000).toFixed(0)}k</p>
                        <p className="text-[11px] text-muted-foreground">{new Date(p.placedAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            {/* Primary contact */}
            {contacts.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Primary Contact</p>
                {contacts.filter((c) => c.isPrimary).map((contact) => (
                  <div key={contact.id} className="flex items-center gap-3">
                    <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white", generateAvatarColor(contact.id))}>
                      {getInitials(contact.fullName)}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-foreground">{contact.fullName}</p>
                      <p className="text-xs text-muted-foreground">{contact.title}</p>
                    </div>
                    <div className="flex gap-2">
                      <a href={`mailto:${contact.email}`} className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent transition-colors">
                        <Mail className="h-3.5 w-3.5" />Email
                      </a>
                      {contact.phone && (
                        <a href={`tel:${contact.phone}`} className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent transition-colors">
                          <Phone className="h-3.5 w-3.5" />Call
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Jobs ── */}
        {activeTab === "jobs" && (
          <div className="p-6">
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <h3 className="text-sm font-semibold text-foreground">Active Searches</h3>
                <button onClick={() => router.push(`/jobs/new?clientId=${client.id}`)} className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
                  <Plus className="h-3.5 w-3.5" />Add search
                </button>
              </div>
              {clientJobs.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">No open searches for this client</p>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      {["Role", "Status", "Priority", "Candidates", "Est. Fee", ""].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {clientJobs.map((job) => (
                        <tr key={job.id} className="border-b border-border last:border-0 hover:bg-accent/40 transition-colors">
                          <td className="px-4 py-3 text-sm font-medium text-foreground">{job.title}</td>
                          <td className="px-4 py-3">
                            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold",
                              job.status === "active" ? "bg-emerald-100 text-emerald-700" :
                              job.status === "on_hold" ? "bg-amber-100 text-amber-700" :
                              "bg-slate-100 text-slate-600"
                            )}>
                              {job.status === "on_hold" ? "On Hold" : job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold",
                              job.priority === "urgent" ? "bg-red-100 text-red-700" :
                              job.priority === "high"   ? "bg-amber-100 text-amber-700" :
                              "bg-slate-100 text-slate-600"
                            )}>
                              {job.priority}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-foreground">{job.candidateCount ?? 0}</td>
                          <td className="px-4 py-3 text-sm text-foreground">
                            {job.estimatedFee ? formatSalary(job.estimatedFee, "USD", true) : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <Link href={`/jobs/${job.id}`} className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
                              View<ChevronLeft className="h-3 w-3 rotate-180" />
                            </Link>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ── Contacts ── */}
        {activeTab === "contacts" && (
          <div className="p-6 max-w-xl space-y-6">
            <div className="rounded-xl border border-border bg-card divide-y divide-border">
              <div className="flex items-center justify-between px-4 py-3">
                <h3 className="text-sm font-semibold text-foreground">Contacts</h3>
                <button onClick={() => setShowAddContact((v) => !v)} className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
                  <Plus className="h-3.5 w-3.5" />{showAddContact ? "Cancel" : "Add"}
                </button>
              </div>

              {showAddContact && (
                <div className="px-4 py-4 space-y-3 bg-muted/30">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-muted-foreground uppercase tracking-wider">First Name *</label>
                      <input
                        value={newContact.firstName}
                        onChange={(e) => setNewContact((p) => ({ ...p, firstName: e.target.value }))}
                        placeholder="Jane"
                        className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Last Name *</label>
                      <input
                        value={newContact.lastName}
                        onChange={(e) => setNewContact((p) => ({ ...p, lastName: e.target.value }))}
                        placeholder="Smith"
                        className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Title</label>
                      <input
                        value={newContact.title}
                        onChange={(e) => setNewContact((p) => ({ ...p, title: e.target.value }))}
                        placeholder="Head of Talent"
                        className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Email</label>
                      <input
                        type="email"
                        value={newContact.email}
                        onChange={(e) => setNewContact((p) => ({ ...p, email: e.target.value }))}
                        placeholder="jane@company.com"
                        className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Phone</label>
                    <input
                      type="tel"
                      value={newContact.phone}
                      onChange={(e) => setNewContact((p) => ({ ...p, phone: e.target.value }))}
                      placeholder="+1 415 555 0100"
                      className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <button
                    disabled={addingContact}
                    onClick={async () => {
                      if (!newContact.firstName.trim() || !newContact.lastName.trim()) {
                        toast.error("First and last name are required");
                        return;
                      }
                      setAddingContact(true);
                      const result = await addContact({
                        companyId:  client.id,
                        firstName:  newContact.firstName.trim(),
                        lastName:   newContact.lastName.trim(),
                        title:      newContact.title.trim() || undefined,
                        email:      newContact.email.trim() || undefined,
                        phone:      newContact.phone.trim() || undefined,
                      });
                      setAddingContact(false);
                      if (result) {
                        setNewContact({ firstName: "", lastName: "", title: "", email: "", phone: "" });
                        setShowAddContact(false);
                        toast.success("Contact added");
                      } else {
                        toast.error("Failed to add contact");
                      }
                    }}
                    className="rounded-md bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
                  >
                    {addingContact ? "Adding…" : "Add Contact"}
                  </button>
                </div>
              )}

              {contacts.length === 0 && !showAddContact && (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">No contacts yet</p>
              )}
              {contacts.map((contact: DbContact) => (
                <div key={contact.id} className="border-b border-border last:border-0 px-4 py-4">
                  {editingContactId === contact.id ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 mb-2">
                        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white", generateAvatarColor(contact.id))}>
                          {getInitials(contact.fullName)}
                        </div>
                        <p className="text-sm font-semibold text-foreground">{contact.fullName}</p>
                      </div>
                      <input
                        value={editContactForm.title}
                        onChange={(e) => setEditContactForm((p) => ({ ...p, title: e.target.value }))}
                        placeholder="Title"
                        className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-brand-500"
                      />
                      <input
                        type="email"
                        value={editContactForm.email}
                        onChange={(e) => setEditContactForm((p) => ({ ...p, email: e.target.value }))}
                        placeholder="Email"
                        className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-brand-500"
                      />
                      <input
                        value={editContactForm.phone}
                        onChange={(e) => setEditContactForm((p) => ({ ...p, phone: e.target.value }))}
                        placeholder="Phone"
                        className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-brand-500"
                      />
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => setEditingContactId(null)}
                          className="flex-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => {
                            toast.success(`${contact.fullName} updated`);
                            setEditingContactId(null);
                          }}
                          className="flex-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white", generateAvatarColor(contact.id))}>
                        {getInitials(contact.fullName)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-foreground">{contact.fullName}</p>
                          {contact.isPrimary && (
                            <span className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">Primary</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{contact.title}</p>
                        <div className="mt-1 flex items-center gap-3 text-[10px] text-muted-foreground">
                          {contact.email && (
                            <a href={`mailto:${contact.email}`} className="flex items-center gap-1 hover:text-brand-600 transition-colors">
                              <Mail className="h-3 w-3" />{contact.email}
                            </a>
                          )}
                          {contact.phone && (
                            <a href={`tel:${contact.phone}`} className="flex items-center gap-1 hover:text-brand-600 transition-colors">
                              <Phone className="h-3 w-3" />{contact.phone}
                            </a>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setEditContactForm({ title: contact.title ?? "", email: contact.email ?? "", phone: contact.phone ?? "" });
                          setEditingContactId(contact.id);
                        }}
                        className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent transition-colors"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* ── Portal Access ── */}
            <PortalAccessPanel companyId={params.id} portalSlug={client.portalSlug} />
          </div>
        )}

        {/* ── Tasks ── */}
        {activeTab === "agreements" && (
          <div className="mx-auto max-w-2xl p-6">
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="mb-4 border-b border-border pb-3">
                <h2 className="text-sm font-semibold text-foreground">MSA &amp; Agreements</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">Master service agreements, renewal tracking, and fee terms</p>
              </div>
              <MsaPanel companyId={params.id} />
            </div>
          </div>
        )}

        {activeTab === "tasks" && (
          <div className="mx-auto max-w-xl p-6">
            <div className="rounded-xl border border-border bg-card p-5">
              <TaskPanel
                tasks={tasks}
                entityId={client.id}
                entityType="client"
                onTasksChange={setTasks}
                onAddTask={(input) => addTask(input) as Promise<Task | null>}
                onToggleTask={toggleTask}
                onDeleteTask={deleteTask}
              />
            </div>
          </div>
        )}

        {activeTab === "intelligence" && (
          <div className="mx-auto max-w-2xl p-6">
            <div className="rounded-xl border border-border bg-card p-6">
              <ClientIntelligencePanel companyId={company.id} />
            </div>
          </div>
        )}

        {activeTab === "portal_audit" && (
          <div className="mx-auto max-w-3xl p-6">
            <PortalAuditTrail companyId={company.id} />
          </div>
        )}
      </div>
    </div>
  );
}
