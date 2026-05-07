"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Building2, Users, Kanban, Bell, CreditCard, Tag,
  ChevronRight, Plus, Trash2, GripVertical, Edit3,
  Check, X, Mail, Zap, Upload, ClipboardList,
  Search, Filter, Download, Database, Shield, Layers, DollarSign, ShieldOff, BookOpen, BrainCircuit, Globe, Wallet,
} from "lucide-react";
import { PodsSettings } from "@/components/settings/pods-settings";
import { AlertsSettings } from "@/components/settings/alerts-settings";
import { SubmissionsSettings } from "@/components/settings/submissions-settings";
import { OffLimitsSettings } from "@/components/settings/off-limits-settings";
import Link from "next/link";
import { useAuditLog, usePermissions, useCustomFieldDefinitions, type AuditEntry, type AuditFilters, type CustomFieldEntity, type CustomFieldType } from "@/lib/supabase/hooks";
import type { Permission } from "@/lib/permissions";
// mock-data removed — using Supabase
import { createClient } from "@/lib/supabase/client";
import { cn, generateAvatarColor, getInitials } from "@/lib/utils";
import { toast } from "sonner";
import type { User, PipelineStage } from "@/types";

// ─── Sidebar nav ──────────────────────────────────────────────────────────────

const SECTIONS = [
  { id: "org",           label: "Organization",    icon: Building2,   permission: "settings:org"           as Permission },
  { id: "users",         label: "Team & Access",   icon: Users,       permission: "team:view"               as Permission },
  { id: "pipeline",      label: "Pipeline Stages", icon: Kanban,      permission: "settings:pipeline"       as Permission },
  { id: "tags",          label: "Tag Taxonomy",    icon: Tag,         permission: "settings:tags"           as Permission },
  { id: "fields",        label: "Custom Fields",   icon: Layers,      permission: "custom_fields:manage"    as Permission },
  { id: "notifications", label: "Notifications",   icon: Bell,        permission: "settings:notifications"  as Permission },
  { id: "integrations",  label: "Integrations",    icon: Zap,         permission: "settings:integrations"   as Permission },
  { id: "data",          label: "Data & Privacy",  icon: Database,    permission: "settings:data"           as Permission },
  { id: "billing",       label: "Billing",         icon: CreditCard,  permission: "settings:billing"        as Permission },
  { id: "audit",         label: "Audit Trail",     icon: ClipboardList, permission: "settings:audit"        as Permission },
  { id: "fee-models",    label: "Fee Models",      icon: DollarSign,   permission: "settings:billing"        as Permission },
  { id: "payouts",       label: "Recruiter Payouts", icon: Wallet,     permission: "settings:billing"        as Permission },

  { id: "pods",          label: "Team Pods",       icon: Users,        permission: "settings:org"             as Permission },
  { id: "alerts",        label: "Alerts",          icon: Bell,         permission: "settings:integrations"   as Permission },
  { id: "submissions",   label: "Submissions",     icon: Shield,       permission: "settings:pipeline"        as Permission },
  { id: "off-limits",    label: "Off-Limits",      icon: ShieldOff,    permission: "settings:pipeline"        as Permission },
  { id: "api-keys",         label: "API Keys",         icon: Zap,           permission: "settings:billing"         as Permission },
  { id: "prep-templates",   label: "Prep Templates",   icon: BookOpen,      permission: "settings:pipeline"        as Permission },
  { id: "ai-models",        label: "AI Models",        icon: BrainCircuit,  permission: "settings:integrations"    as Permission },
  { id: "agency-profile",   label: "Agency Profile",   icon: Building2,     permission: "settings:org"             as Permission },
  { id: "suppression",      label: "Suppression List", icon: ShieldOff,     permission: "settings:integrations"    as Permission },
  { id: "sending-domains",  label: "Sending Domains",  icon: Globe,         permission: "settings:integrations"    as Permission },
  { id: "webhooks",         label: "Webhooks",         icon: Zap,           permission: "settings:integrations"    as Permission },
] as const;

type SectionId = typeof SECTIONS[number]["id"];

// ─── Pipeline stage types ─────────────────────────────────────────────────────

interface EditableStage {
  id: string;
  name: string;
  type: PipelineStage["type"];
  color: string;
  daysTarget?: number;
}

const DEFAULT_STAGES: EditableStage[] = [
  { id: "ps1", name: "Sourced",       type: "sourced",       color: "#94a3b8", daysTarget: 3 },
  { id: "ps2", name: "Screened",      type: "screened",      color: "#60a5fa", daysTarget: 5 },
  { id: "ps3", name: "Submitted",     type: "submitted",     color: "#818cf8", daysTarget: 7 },
  { id: "ps4", name: "Client Review", type: "client_review", color: "#a78bfa", daysTarget: 5 },
  { id: "ps5", name: "Interview",     type: "interview",     color: "#34d399", daysTarget: 14 },
  { id: "ps6", name: "Offer",         type: "offer",         color: "#fbbf24", daysTarget: 7 },
  { id: "ps7", name: "Placed",        type: "placed",        color: "#10b981", daysTarget: 30 },
];

const STAGE_TYPES: PipelineStage["type"][] = [
  "sourced","screened","submitted","client_review","interview","offer","placed","rejected","custom",
];

const COLORS = ["#94a3b8","#60a5fa","#818cf8","#a78bfa","#34d399","#10b981","#fbbf24","#f97316","#ef4444","#ec4899"];

// ─── Org Settings ─────────────────────────────────────────────────────────────

function OrgSettings() {
  const [name, setName]           = useState("Ikhaya Talent");
  const [domain, setDomain]       = useState("ikhaya.io");
  const [website, setWebsite]     = useState("https://ikhaya.io");
  const [logoUrl, setLogoUrl]     = useState<string | null>(null);
  const [saved, setSaved]         = useState(false);

  function handleSave() {
    setSaved(true);
    toast.success("Organization settings saved");
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h2 className="text-base font-semibold text-foreground">Organization</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">Manage your agency profile and branding</p>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-brand-600 shadow-sm overflow-hidden">
          {logoUrl
            ? <img src={logoUrl} alt="Logo" className="h-full w-full object-cover" />
            : <Zap className="h-8 w-8 text-white" strokeWidth={2.5} />
          }
        </div>
        <div>
          <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors">
            <Upload className="h-3.5 w-3.5" />Upload logo
            <input
              type="file"
              accept="image/png,image/svg+xml,image/jpeg"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 1_048_576) { toast.error("File must be under 1MB"); return; }
                const url = URL.createObjectURL(file);
                setLogoUrl(url);
                toast.success("Logo updated — save to apply");
              }}
            />
          </label>
          <p className="mt-1 text-[10px] text-muted-foreground">PNG or SVG, max 1MB</p>
        </div>
      </div>

      {[
        { label: "Agency name", value: name,    set: setName,    ph: "Your agency name" },
        { label: "Domain",      value: domain,  set: setDomain,  ph: "yourcompany.com" },
        { label: "Website",     value: website, set: setWebsite, ph: "https://yourcompany.com" },
      ].map((f) => (
        <div key={f.label}>
          <label className="mb-1.5 block text-xs font-medium text-foreground">{f.label}</label>
          <input
            value={f.value}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => f.set(e.target.value)}
            placeholder={f.ph}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      ))}

      <div>
        <label className="mb-1.5 block text-xs font-medium text-foreground">Client portal subdomain</label>
        <div className="flex items-center rounded-lg border border-border bg-background overflow-hidden focus-within:ring-2 focus-within:ring-brand-500">
          <span className="border-r border-border bg-muted px-3 py-2 text-sm text-muted-foreground shrink-0">portal.ats.io/</span>
          <input defaultValue="ikhaya" className="flex-1 bg-transparent px-3 py-2 text-sm text-foreground outline-none" />
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">Clients access their submission portal at this URL</p>
      </div>

      <button
        onClick={handleSave}
        className={cn("flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold transition-colors",
          saved ? "bg-emerald-600 text-white" : "bg-brand-600 text-white hover:bg-brand-700"
        )}
      >
        {saved ? <><Check className="h-4 w-4" />Saved!</> : "Save changes"}
      </button>
    </div>
  );
}

// ─── Team Settings ────────────────────────────────────────────────────────────

const ROLES = ["owner","admin","senior_recruiter","recruiter","researcher"] as const;

interface PendingInvite {
  id:          string;
  email:       string;
  role:        string;
  invited_by:  string;
  created_at:  string;
  accepted_at: string | null;
}

function UserRow({ user, isMe, onRoleChange, onRemove }: {
  user: User;
  isMe: boolean;
  onRoleChange: (id: string, role: User["role"]) => void;
  onRemove: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="flex items-center gap-3 py-3 border-b border-border last:border-0">
      <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white", generateAvatarColor(user.id))}>
        {getInitials(user.fullName)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-foreground">{user.fullName}</p>
          {isMe && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700">You</span>}
        </div>
        <p className="text-xs text-muted-foreground">{user.email}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {editing ? (
          <select
            defaultValue={user.role}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { onRoleChange(user.id, e.target.value as User["role"]); setEditing(false); }}
            onBlur={() => setEditing(false)}
            autoFocus
            className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground outline-none"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>{r.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</option>
            ))}
          </select>
        ) : (
          <button onClick={() => !isMe && setEditing(true)} className={cn("rounded-full bg-secondary px-2.5 py-0.5 text-[10px] font-medium text-secondary-foreground transition-colors capitalize", !isMe && "hover:bg-accent")}>
            {user.role.replace(/_/g, " ")}
          </button>
        )}
        {!isMe && (
          <button
            onClick={() => onRemove(user.id)}
            className="rounded-md p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function TeamSettings() {
  const [users,            setUsers]            = useState<User[]>([]);
  const [pendingInvites,   setPendingInvites]   = useState<PendingInvite[]>([]);
  const [inviteEmail,      setInviteEmail]      = useState("");
  const [inviteRole,       setInviteRole]       = useState("recruiter");
  const [inviting,         setInviting]         = useState(false);
  const [currentUserId,    setCurrentUserId]    = useState<string | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [accessToken,      setAccessToken]      = useState<string | null>(null);
  const [canManageTeam,    setCanManageTeam]    = useState(false);

  // ── Load team data ──────────────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      setAccessToken(session.access_token);
      setCurrentUserId(session.user.id);
      setCurrentUserEmail(session.user.email ?? null);

      const { data: userRow } = await supabase
        .from("users")
        .select("agency_id, role")
        .eq("id", session.user.id)
        .single();

      if (!userRow?.agency_id) return;

      const isAdmin = ["owner","admin"].includes(userRow.role ?? "");
      setCanManageTeam(isAdmin);

      // Team members
      const { data: teamMembers } = await supabase
        .from("users")
        .select("id, email, full_name, role, is_active, created_at")
        .eq("agency_id", userRow.agency_id)
        .order("created_at", { ascending: true });

      if (teamMembers) {
        setUsers(teamMembers.map((u) => ({
          id:        u.id,
          email:     u.email,
          firstName: (u.full_name ?? "").split(" ")[0] ?? "",
          lastName:  (u.full_name ?? "").split(" ").slice(1).join(" ") ?? "",
          fullName:  u.full_name ?? u.email,
          role:      u.role as User["role"],
          orgId:     userRow.agency_id,
          createdAt: u.created_at,
        })));
      }

      // Pending invitations (owners/admins only)
      if (isAdmin) {
        const res = await fetch("/api/invite", {
          headers: { authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const json = await res.json();
          setPendingInvites((json.invitations ?? []).filter((i: PendingInvite) => !i.accepted_at));
        }
      }
    })();
  }, []);

  // ── Send invite ─────────────────────────────────────────────────────────────
  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim() || !accessToken) return;
    setInviting(true);

    try {
      const res = await fetch("/api/invite", {
        method:  "POST",
        headers: {
          "content-type":  "application/json",
          authorization:   `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });

      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Failed to send invite");
      } else {
        toast.success(`Invite sent to ${inviteEmail}`);
        setInviteEmail("");
        // Optimistically add to pending list
        setPendingInvites((prev) => [{
          id:          json.invitationId,
          email:       inviteEmail.trim().toLowerCase(),
          role:        inviteRole,
          invited_by:  currentUserId ?? "",
          created_at:  new Date().toISOString(),
          accepted_at: null,
        }, ...prev]);
      }
    } catch {
      toast.error("Network error — please try again");
    } finally {
      setInviting(false);
    }
  }

  // ── Revoke invite ───────────────────────────────────────────────────────────
  async function handleRevokeInvite(inviteId: string, email: string) {
    if (!confirm(`Revoke the pending invite for ${email}?`)) return;
    if (!accessToken) return;

    const res = await fetch(`/api/invite?id=${inviteId}`, {
      method:  "DELETE",
      headers: { authorization: `Bearer ${accessToken}` },
    });

    if (res.ok) {
      setPendingInvites((prev) => prev.filter((i) => i.id !== inviteId));
      toast.success("Invite revoked");
    } else {
      toast.error("Failed to revoke invite");
    }
  }

  // ── Role change (persisted) ─────────────────────────────────────────────────
  async function handleRoleChange(id: string, role: User["role"]) {
    const supabase = createClient();
    const { error } = await supabase
      .from("users")
      .update({ role })
      .eq("id", id);

    if (error) { toast.error("Failed to update role"); return; }
    setUsers((prev) => prev.map((u) => u.id === id ? { ...u, role } : u));
    toast.success("Role updated");
  }

  // ── Remove member (persisted) ───────────────────────────────────────────────
  async function handleRemove(id: string) {
    const member = users.find((u) => u.id === id);
    if (!member) return;
    if (!confirm(`Remove ${member.firstName || member.fullName} from the team?`)) return;

    const supabase = createClient();
    const { error } = await supabase
      .from("users")
      .update({ is_active: false, agency_id: null })
      .eq("id", id);

    if (error) { toast.error("Failed to remove team member"); return; }
    setUsers((prev) => prev.filter((u) => u.id !== id));
    toast.success(`${member.firstName || member.fullName} removed from team`);
  }

  const pendingCount = pendingInvites.length;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-base font-semibold text-foreground">Team & Access</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">Manage team members and permissions</p>
      </div>

      {/* Invite form — only visible to owners and admins */}
      {canManageTeam && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="mb-3 text-sm font-medium text-foreground">Invite a team member</p>
          <form onSubmit={handleInvite} className="flex gap-2">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInviteEmail(e.target.value)}
              placeholder="colleague@agency.com"
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-brand-500"
            />
            <select
              value={inviteRole}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setInviteRole(e.target.value)}
              className="rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground outline-none"
            >
              {ROLES.filter((r) => r !== "owner").map((r) => (
                <option key={r} value={r}>{r.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</option>
              ))}
            </select>
            <button
              type="submit"
              disabled={!inviteEmail.trim() || inviting}
              className="flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40 transition-colors"
            >
              {inviting
                ? <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />Sending…</>
                : <><Mail className="h-3.5 w-3.5" />Send invite</>
              }
            </button>
          </form>
          <p className="mt-2 text-[11px] text-muted-foreground">
            The invitee will receive an email with a link to join your agency workspace.
          </p>
        </div>
      )}

      {/* Pending invitations */}
      {canManageTeam && pendingCount > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60">
          <div className="flex items-center justify-between border-b border-amber-200 px-4 py-3">
            <p className="text-sm font-semibold text-amber-800">Pending invitations</p>
            <span className="text-xs text-amber-700">{pendingCount} awaiting acceptance</span>
          </div>
          <div className="divide-y divide-amber-100">
            {pendingInvites.map((inv) => (
              <div key={inv.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[11px] font-bold text-amber-700">
                  {inv.email[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{inv.email}</p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {inv.role.replace(/_/g, " ")} · invited {new Date(inv.created_at).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => handleRevokeInvite(inv.id, inv.email)}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />Revoke
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active team members */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-semibold text-foreground">Team members</p>
          <span className="text-xs text-muted-foreground">{users.length} active</span>
        </div>
        <div className="px-4">
          {users.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading team…</p>
          ) : (
            users.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                isMe={u.id === currentUserId}
                onRoleChange={handleRoleChange}
                onRemove={handleRemove}
              />
            ))
          )}
        </div>
      </div>

      {/* Permission reference */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-semibold text-foreground">Permission reference</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground">Permission</th>
                {["Owner","Admin","Sr. Recruiter","Recruiter","Researcher"].map((r) => (
                  <th key={r} className="px-3 py-2.5 text-center font-semibold text-muted-foreground">{r}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ["Add/edit candidates",  true, true, true, true, true],
                ["Manage jobs",          true, true, true, false, false],
                ["Submit to clients",    true, true, true, true, false],
                ["View analytics",       true, true, true, false, false],
                ["Manage team",          true, true, false, false, false],
                ["Billing & settings",   true, false, false, false, false],
              ].map(([perm, ...cols]) => (
                <tr key={String(perm)} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5 text-foreground">{String(perm)}</td>
                  {cols.map((allowed, i) => (
                    <td key={i} className="px-3 py-2.5 text-center">
                      {allowed ? <Check className="h-3.5 w-3.5 text-emerald-500 inline" /> : <X className="h-3.5 w-3.5 text-muted-foreground/40 inline" />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Pipeline Stage Editor ────────────────────────────────────────────────────

function PipelineSettings() {
  const [stages, setStages]       = useState<EditableStage[]>(DEFAULT_STAGES);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saved, setSaved]         = useState(false);

  function addStage() {
    const id = `ps_${Date.now()}`;
    setStages((prev: EditableStage[]) => [...prev, { id, name: "New Stage", type: "custom", color: "#94a3b8" }]);
    setEditingId(id);
  }

  function removeStage(id: string) {
    setStages((prev: EditableStage[]) => prev.filter((s) => s.id !== id));
    toast.success("Stage removed");
  }

  function updateStage(id: string, patch: Partial<EditableStage>) {
    setStages((prev: EditableStage[]) => prev.map((s) => s.id === id ? { ...s, ...patch } : s));
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h2 className="text-base font-semibold text-foreground">Pipeline Stages</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">Customize the stages for your recruitment pipeline. Changes apply to all new searches.</p>
      </div>

      <div className="rounded-xl border border-border bg-card divide-y divide-border">
        {stages.map((stage) => {
          const isEditing = editingId === stage.id;
          return (
            <div key={stage.id} className={cn("flex items-center gap-3 px-4 py-3", isEditing && "bg-brand-50/40")}>
              <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground/50" />
              <div className="h-3 w-3 shrink-0 rounded-full border-2 border-white shadow-sm" style={{ background: stage.color }} />

              {isEditing ? (
                <div className="flex flex-1 items-center gap-2 flex-wrap">
                  <input
                    autoFocus
                    value={stage.name}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateStage(stage.id, { name: e.target.value })}
                    className="min-w-24 rounded-md border border-border bg-card px-2.5 py-1 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <select
                    value={stage.type}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => updateStage(stage.id, { type: e.target.value as EditableStage["type"] })}
                    className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground outline-none"
                  >
                    {STAGE_TYPES.map((t) => (
                      <option key={t} value={t}>{t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={stage.daysTarget ?? ""}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateStage(stage.id, { daysTarget: parseInt(e.target.value) || undefined })}
                    placeholder="target days"
                    className="w-28 rounded-md border border-border bg-card px-2.5 py-1 text-xs text-foreground outline-none"
                  />
                  <div className="flex gap-1">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => updateStage(stage.id, { color: c })}
                        className={cn("h-5 w-5 rounded-full border-2 transition-transform hover:scale-110", stage.color === c ? "border-foreground" : "border-transparent")}
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                  <button onClick={() => setEditingId(null)} className="rounded-md bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-700 transition-colors">Done</button>
                </div>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-foreground">{stage.name}</span>
                    <span className="ml-2 text-[10px] text-muted-foreground capitalize">{stage.type.replace(/_/g, " ")}</span>
                    {stage.daysTarget && <span className="ml-2 text-[10px] text-muted-foreground">· {stage.daysTarget}d target</span>}
                  </div>
                  <button onClick={() => setEditingId(stage.id)} className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent transition-colors">
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => removeStage(stage.id)} className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          );
        })}
        <button onClick={addStage} className="flex w-full items-center gap-2 px-4 py-3 text-sm text-muted-foreground hover:bg-accent/50 transition-colors">
          <Plus className="h-4 w-4" />Add stage
        </button>
      </div>

      <button
        onClick={() => { setSaved(true); toast.success("Pipeline stages saved"); setTimeout(() => setSaved(false), 2000); }}
        className={cn("flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold transition-colors",
          saved ? "bg-emerald-600 text-white" : "bg-brand-600 text-white hover:bg-brand-700"
        )}
      >
        {saved ? <><Check className="h-4 w-4" />Saved!</> : "Save pipeline"}
      </button>
    </div>
  );
}

// ─── Notifications ────────────────────────────────────────────────────────────

function NotificationSettings() {
  // US-478: prefs now persist to user_notification_prefs table.
  // Type ids match the NOTIFICATION_TYPES list in the API route.
  interface Pref { id: string; label: string; description: string; email: boolean; inApp: boolean }

  const DEFAULTS: Pref[] = useMemo(() => [
    { id: "new_candidate",   label: "New candidate added",      description: "When a candidate is added to a search you own", email: true,  inApp: true  },
    { id: "stage_change",    label: "Stage change",             description: "When a candidate moves to a new pipeline stage",  email: false, inApp: true  },
    { id: "client_feedback", label: "Client feedback received", description: "When a client advances, holds, or passes",        email: true,  inApp: true  },
    { id: "task_due",        label: "Task due reminder",        description: "24 hours before a task is due",                   email: true,  inApp: true  },
    { id: "saved_search",    label: "Saved search alert",       description: "When new candidates match a saved search",        email: true,  inApp: false },
    { id: "outreach_reply",  label: "Outreach reply",           description: "When a candidate replies to an outreach email",   email: true,  inApp: true  },
    { id: "placement",       label: "Placement confirmed",      description: "When one of your candidates is placed",           email: true,  inApp: true  },
    { id: "mention",         label: "Mentioned in a note",      description: "When a teammate @-mentions you",                  email: true,  inApp: true  },
    { id: "weekly_summary",  label: "Weekly summary",           description: "Weekly digest of submissions and placements",     email: true,  inApp: false },
  ], []);

  const [prefs, setPrefs]         = useState<Pref[]>(DEFAULTS);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);

  // Load persisted prefs on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/settings/notification-prefs", { credentials: "same-origin" });
        if (!res.ok) { setLoading(false); return; }
        const body = await res.json() as { prefs: Record<string, { email: boolean; inApp: boolean }> };
        setPrefs((prev) => prev.map((p) => {
          const saved = body.prefs?.[p.id];
          return saved ? { ...p, email: saved.email !== false, inApp: saved.inApp !== false } : p;
        }));
      } catch {/* fall back to defaults */} finally {
        setLoading(false);
      }
    })();
  }, []);

  function toggle(id: string, field: "email" | "inApp") {
    setPrefs((prev: Pref[]) => prev.map((p) => p.id === id ? { ...p, [field]: !p[field] } : p));
  }

  async function save() {
    setSaving(true);
    try {
      const payload = prefs.reduce<Record<string, { email: boolean; inApp: boolean }>>((acc, p) => {
        acc[p.id] = { email: p.email, inApp: p.inApp };
        return acc;
      }, {});
      const res = await fetch("/api/settings/notification-prefs", {
        method:      "PUT",
        credentials: "same-origin",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify({ prefs: payload }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success("Notification preferences saved");
    } catch (err) {
      toast.error("Failed to save preferences");
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h2 className="text-base font-semibold text-foreground">Notifications</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">Choose what you get notified about and how</p>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto] border-b border-border">
          <div className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Event</div>
          <div className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-center w-16">Email</div>
          <div className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-center w-16">In-app</div>
        </div>
        {prefs.map((pref) => (
          <div key={pref.id} className="grid grid-cols-[1fr_auto_auto] items-center border-b border-border last:border-0">
            <div className="px-4 py-3">
              <p className="text-sm font-medium text-foreground">{pref.label}</p>
              <p className="text-[10px] text-muted-foreground">{pref.description}</p>
            </div>
            {(["email","inApp"] as const).map((field) => (
              <div key={field} className="flex w-16 items-center justify-center px-4 py-3">
                <button
                  onClick={() => toggle(pref.id, field)}
                  disabled={loading || saving}
                  className={cn("relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50", pref[field] ? "bg-brand-600" : "bg-muted")}
                >
                  <span className={cn("inline-block h-3.5 w-3.5 rounded-full bg-card shadow-sm transition-transform", pref[field] ? "translate-x-4" : "translate-x-1")} />
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>

      <button
        onClick={save}
        disabled={loading || saving}
        className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save preferences"}
      </button>
    </div>
  );
}

// ─── Integrations ─────────────────────────────────────────────────────────────

function IntegrationSettings() {
  const integrations = [
    { name: "LinkedIn",   icon: "in", description: "Sync candidate profiles from LinkedIn Recruiter",           connected: false, color: "bg-brand-600" },
    { name: "Slack",      icon: "S",  description: "Get notifications and updates in your Slack workspace",      connected: true,  color: "bg-violet-600" },
    { name: "DocuSign",   icon: "D",  description: "Send offer letters and contracts for e-signature",           connected: false, color: "bg-amber-600" },
    { name: "Zapier",     icon: "Z",  description: "Connect to 5000+ apps with automated workflows",             connected: false, color: "bg-orange-500" },
    { name: "Greenhouse", icon: "gh", description: "Sync jobs and applications from Greenhouse ATS",             connected: false, color: "bg-emerald-600" },
    { name: "Lever",      icon: "L",  description: "Import jobs and export placements to Lever",                 connected: false, color: "bg-cyan-600" },
  ];

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h2 className="text-base font-semibold text-foreground">Integrations</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">Connect your tools to streamline your workflow</p>
      </div>

      {/* Email Section — links to dedicated page */}
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Email Sync</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Match emails to candidates automatically</p>
        </div>
        <a
          href="/settings/integrations"
          className="flex items-center justify-between rounded-xl border border-border bg-card p-4 hover:bg-accent transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50">
              <Mail className="h-5 w-5 text-brand-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Email Integrations</p>
              <p className="text-xs text-muted-foreground">Manage Gmail and Outlook connections</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </a>
      </div>

      {/* Other integrations */}
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Other Tools</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">More integrations launching soon</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {integrations.map((int) => (
            <div key={int.name} className={cn("flex items-start gap-3 rounded-xl border border-border bg-card p-4", int.connected && "ring-1 ring-emerald-300")}>
              <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white", int.color)}>
                {int.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">{int.name}</p>
                  {int.connected
                    ? <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">Connected</span>
                    : <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">Soon</span>
                  }
                </div>
                <p className="mt-0.5 text-[10px] text-muted-foreground leading-snug">{int.description}</p>
                {int.connected ? (
                  <button
                    onClick={() => {
                      if (!confirm(`Disconnect ${int.name}?`)) return;
                      toast.success(`${int.name} disconnected`);
                    }}
                    className="mt-2.5 rounded-md border border-red-200 px-3 py-1 text-[10px] font-semibold text-red-600 hover:bg-red-50 transition-colors"
                  >
                    Disconnect
                  </button>
                ) : (
                  <span className="mt-2.5 inline-block rounded-md bg-muted px-3 py-1 text-[10px] font-medium text-muted-foreground cursor-not-allowed">
                    Coming soon
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Tag Management ───────────────────────────────────────────────────────────

type TagCategory = "skills" | "industries" | "sources" | "custom";

interface AgencyTag {
  id: string;
  name: string;
  category: TagCategory;
  color: string;
}

const TAG_CATEGORIES: { id: TagCategory; label: string; description: string }[] = [
  { id: "skills",     label: "Skills",      description: "Technical or professional skills" },
  { id: "industries", label: "Industries",  description: "Sector / vertical tags" },
  { id: "sources",    label: "Sources",     description: "Where candidates come from" },
  { id: "custom",     label: "Custom",      description: "Your own taxonomy" },
];

const TAG_COLORS = [
  "#6366f1","#8b5cf6","#ec4899","#f43f5e","#ef4444",
  "#f97316","#f59e0b","#84cc16","#10b981","#06b6d4","#3b82f6",
];

const SEED_TAGS: AgencyTag[] = [
  { id: "t1", name: "React",          category: "skills",     color: "#06b6d4" },
  { id: "t2", name: "Python",         category: "skills",     color: "#3b82f6" },
  { id: "t3", name: "Fintech",        category: "industries", color: "#8b5cf6" },
  { id: "t4", name: "SaaS",           category: "industries", color: "#6366f1" },
  { id: "t5", name: "LinkedIn",       category: "sources",    color: "#0ea5e9" },
  { id: "t6", name: "Referral",       category: "sources",    color: "#10b981" },
  { id: "t7", name: "High-priority",  category: "custom",     color: "#ef4444" },
];

function TagPill({ tag, onDelete }: { tag: AgencyTag; onDelete: () => void }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium"
      style={{ borderColor: tag.color + "44", backgroundColor: tag.color + "18", color: tag.color }}
    >
      {tag.name}
      <button
        onClick={onDelete}
        className="ml-0.5 hover:opacity-70 transition-opacity"
        aria-label={`Remove ${tag.name}`}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function TagSettings() {
  const [tags,        setTags]       = useState<AgencyTag[]>(SEED_TAGS);
  const [activeTab,   setActiveTab]  = useState<TagCategory>("skills");
  const [newName,     setNewName]    = useState("");
  const [newColor,    setNewColor]   = useState(TAG_COLORS[0]);
  const [saved,       setSaved]      = useState(false);

  const tabTags = tags.filter((t) => t.category === activeTab);

  function addTag() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    if (tags.some((t) => t.name.toLowerCase() === trimmed.toLowerCase() && t.category === activeTab)) {
      toast.error("Tag already exists in this category");
      return;
    }
    setTags((prev) => [
      ...prev,
      { id: `t${Date.now()}`, name: trimmed, category: activeTab, color: newColor },
    ]);
    setNewName("");
    toast.success(`Tag "${trimmed}" added`);
  }

  function deleteTag(id: string) {
    setTags((prev) => prev.filter((t) => t.id !== id));
  }

  function handleSave() {
    setSaved(true);
    toast.success("Tag taxonomy saved");
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-base font-semibold text-foreground">Tag Taxonomy</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">Define the tag vocabulary used across candidates and placements</p>
      </div>

      {/* Category tabs */}
      <div className="flex items-center gap-1 rounded-xl border border-border bg-muted p-1">
        {TAG_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveTab(cat.id)}
            className={cn(
              "flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              activeTab === cat.id
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {cat.label}
            <span className={cn("ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold",
              activeTab === cat.id ? "bg-brand-100 text-brand-700" : "bg-muted-foreground/10 text-muted-foreground"
            )}>
              {tags.filter((t) => t.category === cat.id).length}
            </span>
          </button>
        ))}
      </div>

      {/* Category description */}
      <p className="text-xs text-muted-foreground -mt-2">
        {TAG_CATEGORIES.find((c) => c.id === activeTab)?.description}
      </p>

      {/* Add tag row */}
      <div className="flex items-center gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
          placeholder="New tag name…"
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-brand-500"
        />
        {/* Color picker */}
        <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-1.5">
          {TAG_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setNewColor(c)}
              className={cn(
                "h-5 w-5 rounded-full transition-transform hover:scale-110",
                newColor === c && "ring-2 ring-offset-1 ring-foreground/30 scale-110"
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <button
          onClick={addTag}
          disabled={!newName.trim()}
          className="flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40 transition-colors"
        >
          <Plus className="h-4 w-4" />Add
        </button>
      </div>

      {/* Tag cloud */}
      <div className="rounded-xl border border-border bg-card p-4 min-h-[96px]">
        {tabTags.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No {TAG_CATEGORIES.find((c) => c.id === activeTab)?.label.toLowerCase()} tags yet — add one above</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tabTags.map((tag) => (
              <TagPill key={tag.id} tag={tag} onDelete={() => deleteTag(tag.id)} />
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{tags.length} total tags across {TAG_CATEGORIES.length} categories</p>
        <button
          onClick={handleSave}
          className={cn("flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold transition-colors",
            saved ? "bg-emerald-600 text-white" : "bg-brand-600 text-white hover:bg-brand-700"
          )}
        >
          {saved ? <><Check className="h-4 w-4" />Saved!</> : "Save taxonomy"}
        </button>
      </div>
    </div>
  );
}

// ─── Billing ──────────────────────────────────────────────────────────────────

type BillingSubscription = {
  plan: string;
  subscriptionStatus: string;
  subscriptionPeriodEnd: string | null;
  trialEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
  hasSubscription: boolean;
};

const PLAN_LABELS: Record<string, string> = {
  trialing:   "Free Trial",
  starter:    "Starter",
  growth:     "Growth",
  pro:        "Pro",
  enterprise: "Enterprise",
};

const PLAN_PRICE_DISPLAY: Record<string, string> = {
  starter:    "$49 / month",
  growth:     "$99 / month",
  pro:        "$199 / month",
  enterprise: "Custom pricing",
};

const STATUS_STYLES: Record<string, string> = {
  active:     "bg-emerald-100 text-emerald-800 border-emerald-200",
  trialing:   "bg-brand-100 text-brand-800 border-brand-200",
  past_due:   "bg-amber-100 text-amber-800 border-amber-200",
  canceled:   "bg-slate-100 text-slate-600 border-slate-200",
  unpaid:     "bg-red-100 text-red-800 border-red-200",
  incomplete: "bg-orange-100 text-orange-800 border-orange-200",
  paused:     "bg-slate-100 text-slate-600 border-slate-200",
};

const STATUS_LABEL: Record<string, string> = {
  active:     "Active",
  trialing:   "Trial",
  past_due:   "Past Due",
  canceled:   "Canceled",
  unpaid:     "Unpaid",
  incomplete: "Incomplete",
  paused:     "Paused",
};

const UPGRADE_PLANS = [
  {
    key: "starter" as const,
    label: "Starter",
    price: "$49/mo",
    seats: "3 users",
    highlight: false,
    features: ["Unlimited jobs", "Candidate pipeline", "Email integration", "Chrome extension"],
  },
  {
    key: "growth" as const,
    label: "Growth",
    price: "$99/mo",
    seats: "10 users",
    highlight: true,
    features: ["Everything in Starter", "AI talent search", "Interview prep AI", "Client portal", "Custom email domain"],
  },
  {
    key: "pro" as const,
    label: "Pro",
    price: "$199/mo",
    seats: "Unlimited users",
    highlight: false,
    features: ["Everything in Growth", "BYO AI model", "Zapier / Make", "Advanced analytics", "Priority support"],
  },
];

function BillingSettings() {
  const [sub,          setSub]          = useState<BillingSubscription | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [checkoutPlan, setCheckoutPlan] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    fetch("/api/billing/subscription")
      .then(r => r.json())
      .then(setSub)
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  async function handleUpgrade(plan: "starter" | "growth" | "pro") {
    setCheckoutPlan(plan);
    try {
      const res = await fetch("/api/billing/checkout", {
        method:  "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": "1" },
        body:    JSON.stringify({ plan }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Checkout failed");
      const { url } = await res.json();
      window.location.href = url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Checkout failed");
    } finally {
      setCheckoutPlan(null);
    }
  }

  async function handlePortal() {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/billing/portal", {
        method:  "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": "1" },
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Portal error");
      const { url } = await res.json();
      window.location.href = url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open billing portal");
    } finally {
      setPortalLoading(false);
    }
  }

  const planKey  = sub?.plan ?? "trialing";
  const statusKey = sub?.subscriptionStatus ?? "trialing";
  const hasSub   = sub?.hasSubscription ?? false;

  const periodEnd = sub?.subscriptionPeriodEnd
    ? new Date(sub.subscriptionPeriodEnd).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : null;

  const trialEnd = sub?.trialEndsAt
    ? new Date(sub.trialEndsAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : null;

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h2 className="text-base font-semibold text-foreground">Billing</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">Manage your subscription and payment details</p>
      </div>

      {/* Current plan card */}
      {loading ? (
        <div className="rounded-xl border border-border bg-card p-5 animate-pulse h-28" />
      ) : (
        <div className="rounded-xl border border-brand-200 bg-gradient-to-br from-brand-50 to-violet-50 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-foreground">
                {PLAN_LABELS[planKey] ?? planKey}
              </p>
              {PLAN_PRICE_DISPLAY[planKey] && (
                <p className="text-xs text-muted-foreground mt-0.5">{PLAN_PRICE_DISPLAY[planKey]}</p>
              )}
            </div>
            <span className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-semibold", STATUS_STYLES[statusKey] ?? STATUS_STYLES.trialing)}>
              {STATUS_LABEL[statusKey] ?? statusKey}
            </span>
          </div>

          {(periodEnd || trialEnd || sub?.cancelAtPeriodEnd) && (
            <div className="mt-3 border-t border-brand-200 pt-3 space-y-1">
              {trialEnd && !hasSub && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Trial ends</span>
                  <span className="font-semibold text-foreground">{trialEnd}</span>
                </div>
              )}
              {periodEnd && hasSub && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {sub?.cancelAtPeriodEnd ? "Cancels" : "Next billing date"}
                  </span>
                  <span className={cn("font-semibold", sub?.cancelAtPeriodEnd ? "text-amber-700" : "text-foreground")}>
                    {periodEnd}
                  </span>
                </div>
              )}
              {sub?.cancelAtPeriodEnd && (
                <p className="text-[11px] text-amber-700 mt-1">
                  Your subscription will cancel at the end of the current period.
                  Re-subscribe via the billing portal to continue.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Billing portal button (only if they have a Stripe customer) */}
      {hasSub && (
        <div className="space-y-2">
          <button
            onClick={handlePortal}
            disabled={portalLoading}
            className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm hover:bg-accent transition-colors disabled:opacity-60"
          >
            <span className="font-medium text-foreground">
              {portalLoading ? "Opening portal…" : "Manage subscription & invoices"}
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
          <p className="text-[10px] text-muted-foreground pl-1">
            You&apos;ll be redirected to the Stripe-hosted billing portal to update your card, cancel, or download invoices.
          </p>
        </div>
      )}

      {/* Upgrade plans (shown when no active paid sub) */}
      {!hasSub && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-foreground">Choose a plan</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {UPGRADE_PLANS.map((p) => (
              <div
                key={p.key}
                className={cn(
                  "relative rounded-xl border p-4 flex flex-col gap-3",
                  p.highlight
                    ? "border-brand-400 bg-brand-50 shadow-sm"
                    : "border-border bg-card"
                )}
              >
                {p.highlight && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-brand-600 px-2.5 py-0.5 text-[10px] font-bold text-white whitespace-nowrap">
                    Most Popular
                  </span>
                )}
                <div>
                  <p className="text-sm font-bold text-foreground">{p.label}</p>
                  <p className="text-xs text-muted-foreground">{p.seats}</p>
                  <p className="mt-1 text-lg font-extrabold text-foreground">{p.price}</p>
                </div>
                <ul className="space-y-1 flex-1">
                  {p.features.map(f => (
                    <li key={f} className="flex items-start gap-1.5 text-[11px] text-slate-600">
                      <Check className="h-3 w-3 text-emerald-500 mt-0.5 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => handleUpgrade(p.key)}
                  disabled={checkoutPlan === p.key}
                  className={cn(
                    "mt-auto w-full rounded-lg py-2 text-xs font-semibold transition-colors disabled:opacity-60",
                    p.highlight
                      ? "bg-brand-600 text-white hover:bg-brand-700"
                      : "border border-brand-300 text-brand-700 hover:bg-brand-50"
                  )}
                >
                  {checkoutPlan === p.key ? "Redirecting…" : `Get ${p.label}`}
                </button>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Enterprise pricing available for larger teams — <a href="mailto:sales@ikhaya.io" className="underline">contact sales</a>.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Audit Trail ─────────────────────────────────────────────────────────────

const ACTION_OPTIONS = [
  { value: "",                    label: "All actions" },
  { value: "candidate.create",    label: "Candidate created" },
  { value: "candidate.update",    label: "Candidate updated" },
  { value: "candidate.delete",    label: "Candidate deleted" },
  { value: "job.create",          label: "Job created" },
  { value: "job.update",          label: "Job updated" },
  { value: "job.status_change",   label: "Job status changed" },
  { value: "application.create",  label: "Added to pipeline" },
  { value: "application.stage",   label: "Stage moved" },
  { value: "placement.create",    label: "Placement created" },
  { value: "contact.create",      label: "Contact created" },
  { value: "company.create",      label: "Company created" },
  { value: "user.invite",         label: "User invited" },
  { value: "settings.update",     label: "Settings changed" },
];

const ENTITY_OPTIONS = [
  { value: "",            label: "All entities" },
  { value: "candidate",   label: "Candidates" },
  { value: "job",         label: "Jobs" },
  { value: "application", label: "Pipeline" },
  { value: "placement",   label: "Placements" },
  { value: "contact",     label: "Contacts" },
  { value: "company",     label: "Companies" },
  { value: "user",        label: "Users" },
];

function actionBadgeColor(action: string): string {
  if (action.includes("delete") || action.includes("remove")) return "bg-red-100 text-red-700";
  if (action.includes("create") || action.includes("invite")) return "bg-emerald-100 text-emerald-700";
  if (action.includes("stage") || action.includes("status")) return "bg-amber-100 text-amber-700";
  return "bg-brand-50 text-brand-700";
}

function formatActionLabel(action: string): string {
  return action.replace(/_/g, " ").replace(/\./g, " → ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function AuditLog() {
  const [filters, setFilters] = useState<AuditFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [fromFilter,   setFromFilter]   = useState("");
  const [toFilter,     setToFilter]     = useState("");

  function applyFilters() {
    setFilters({
      action:     actionFilter || undefined,
      entityType: entityFilter || undefined,
      from:       fromFilter   || undefined,
      to:         toFilter     || undefined,
    });
  }

  function clearFilters() {
    setActionFilter(""); setEntityFilter(""); setFromFilter(""); setToFilter("");
    setFilters({});
  }

  const { entries, loading, hasMore } = useAuditLog(filters);

  const isFiltered = !!(filters.action || filters.entityType || filters.from || filters.to);

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Audit Trail</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Immutable log of all actions taken in your workspace</p>
        </div>
        <button
          onClick={() => setShowFilters((v) => !v)}
          className={cn(
            "flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
            showFilters || isFiltered
              ? "border-brand-300 bg-brand-50 text-brand-700"
              : "border-border bg-card text-muted-foreground hover:text-foreground"
          )}
        >
          <Filter className="h-3.5 w-3.5" />
          {isFiltered ? "Filters active" : "Filter"}
        </button>
      </div>

      {/* Filter bar */}
      {showFilters && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Action</label>
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-brand-500"
              >
                {ACTION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Entity</label>
              <select
                value={entityFilter}
                onChange={(e) => setEntityFilter(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-brand-500"
              >
                {ENTITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">From date</label>
              <input
                type="date"
                value={fromFilter}
                onChange={(e) => setFromFilter(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">To date</label>
              <input
                type="date"
                value={toFilter}
                onChange={(e) => setToFilter(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={applyFilters}
              className="flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
            >
              <Search className="h-3 w-3" />Apply filters
            </button>
            {isFiltered && (
              <button
                onClick={clearFilters}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {/* Log table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground whitespace-nowrap">Time</th>
              <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground">Action</th>
              <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground">Entity</th>
              <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground hidden sm:table-cell">User</th>
              <th className="px-4 py-2.5 text-left font-semibold text-muted-foreground hidden md:table-cell">Details</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  <div className="flex items-center justify-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-300 border-t-brand-600" />
                    Loading audit log…
                  </div>
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  {isFiltered ? "No entries match your filters." : "No audit entries yet — actions will appear here as users work."}
                </td>
              </tr>
            ) : (
              entries.map((entry: AuditEntry) => (
                <tr key={entry.id} className="border-b border-border last:border-0 hover:bg-accent/40 transition-colors">
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {new Date(entry.createdAt).toLocaleString(undefined, {
                      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", actionBadgeColor(entry.action))}>
                      {formatActionLabel(entry.action)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium text-foreground capitalize">{entry.entityType}</span>
                      {entry.entityLabel && (
                        <span className="text-[10px] text-muted-foreground truncate max-w-[140px]">{entry.entityLabel}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                    {entry.userId
                      ? <span className="font-mono text-[10px]">{entry.userId.slice(0, 8)}…</span>
                      : <span className="italic">system</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell max-w-[200px]">
                    {Object.keys(entry.metadata).length > 0
                      ? <span className="truncate block text-[10px]">
                          {Object.entries(entry.metadata).slice(0, 2).map(([k, v]) => `${k}: ${String(v)}`).join(" · ")}
                        </span>
                      : "—"
                    }
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {hasMore && (
          <div className="border-t border-border px-4 py-3 text-center text-xs text-muted-foreground">
            Showing first 50 entries — refine your filters to narrow the results.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Data & Privacy ──────────────────────────────────────────────────────────

interface ExportRow {
  label: string;
  description: string;
  table: string;
  columns: string;
  filename: string;
}

const EXPORT_SETS: ExportRow[] = [
  {
    label:       "Candidates",
    description: "All candidate profiles, skills, status, and source",
    table:       "candidates",
    columns:     "id,first_name,last_name,email,phone,current_title,current_company,location,status,source,linkedin_url,created_at",
    filename:    "candidates",
  },
  {
    label:       "Jobs",
    description: "All job requisitions with status, priority, and fee terms",
    table:       "jobs",
    columns:     "id,title,status,priority,type,location,salary_min,salary_max,fee_type,fee_percentage,fee_amount,created_at",
    filename:    "jobs",
  },
  {
    label:       "Companies",
    description: "All client companies and their details",
    table:       "companies",
    columns:     "id,name,industry,website,location,created_at",
    filename:    "companies",
  },
  {
    label:       "Placements",
    description: "All placements with fees and recruiter info",
    table:       "placements",
    columns:     "id,candidate_id,job_id,start_date,fee_amount,currency,fee_type,created_at",
    filename:    "placements",
  },
];

function DataPrivacySettings() {
  const [exporting, setExporting] = useState<string | null>(null);
  const [fullExporting, setFullExporting] = useState(false);

  async function handleExport(row: ExportRow) {
    setExporting(row.table);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from(row.table)
        .select(row.columns)
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (!data?.length) { toast("No data to export"); setExporting(null); return; }

      const cols = row.columns.split(",");
      const header = cols.join(",");
      const csvRows = data.map((r: Record<string, unknown>) =>
        cols.map((c) => {
          const val = r[c];
          if (val === null || val === undefined) return "";
          const str = String(val);
          return str.includes(",") || str.includes('"') || str.includes("\n")
            ? `"${str.replace(/"/g, '""')}"` : str;
        }).join(",")
      );
      const csv = [header, ...csvRows].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = `ikhaya-${row.filename}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click(); URL.revokeObjectURL(url);
      toast.success(`Exported ${data.length} ${row.label.toLowerCase()}`);
    } catch (err) {
      toast.error("Export failed — " + (err instanceof Error ? err.message : "unknown error"));
    }
    setExporting(null);
  }

  async function handleFullExport() {
    setFullExporting(true);
    try {
      const supabase = createClient();
      const results: Record<string, unknown[]> = {};

      await Promise.all(EXPORT_SETS.map(async (row) => {
        const { data } = await supabase.from(row.table).select("*").order("created_at", { ascending: false });
        results[row.table] = data ?? [];
      }));

      const json = JSON.stringify({ exported_at: new Date().toISOString(), ...results }, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = `ikhaya-full-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click(); URL.revokeObjectURL(url);
      toast.success("Full export downloaded");
    } catch (err) {
      toast.error("Export failed — " + (err instanceof Error ? err.message : "unknown error"));
    }
    setFullExporting(false);
  }

  return (
    <div className="p-6 space-y-8 max-w-2xl">
      <div>
        <h2 className="text-base font-semibold text-foreground">Data & Privacy</h2>
        <p className="mt-1 text-sm text-muted-foreground">Download copies of your agency data or manage privacy settings.</p>
      </div>

      {/* Per-entity exports */}
      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Download className="h-3.5 w-3.5" />Export by type (CSV)
        </h3>
        <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
          {EXPORT_SETS.map((row) => (
            <div key={row.table} className="flex items-center justify-between px-4 py-3.5 bg-card hover:bg-accent/30 transition-colors">
              <div>
                <p className="text-sm font-medium text-foreground">{row.label}</p>
                <p className="text-xs text-muted-foreground">{row.description}</p>
              </div>
              <button
                onClick={() => handleExport(row)}
                disabled={exporting === row.table}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent disabled:opacity-50 transition-colors"
              >
                {exporting === row.table
                  ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  : <Download className="h-3.5 w-3.5" />}
                Export CSV
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Full JSON export */}
      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Database className="h-3.5 w-3.5" />Full data export (JSON)
        </h3>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">Complete agency export</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Downloads all candidates, jobs, companies, and placements as a single JSON file.
                Use this for backups or migrating to another system.
              </p>
            </div>
            <button
              onClick={handleFullExport}
              disabled={fullExporting}
              className="shrink-0 flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              {fullExporting
                ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                : <Download className="h-3.5 w-3.5" />}
              Export All
            </button>
          </div>
        </div>
      </div>

      {/* GDPR / Privacy */}
      <div>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Shield className="h-3.5 w-3.5" />Privacy
        </h3>
        <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
          <div className="px-4 py-3.5">
            <p className="text-sm font-medium text-foreground">Data retention</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Ikhaya retains your agency data for as long as your subscription is active. On cancellation, data is retained for 90 days then purged.
            </p>
          </div>
          <div className="px-4 py-3.5">
            <p className="text-sm font-medium text-foreground">GDPR / CCPA compliance</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              To submit a data subject access request or erasure request on behalf of a candidate, contact <a href="mailto:privacy@ikhaya.io" className="text-brand-600 hover:underline">privacy@ikhaya.io</a>.
            </p>
          </div>
          <div className="px-4 py-3.5">
            <p className="text-sm font-medium text-foreground">Delete agency account</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Permanently deletes your agency, all users, and all associated data. This action cannot be undone.
            </p>
            <button className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 transition-colors">
              Request account deletion
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Custom Fields Settings ───────────────────────────────────────────────────

const FIELD_TYPES: { value: CustomFieldType; label: string }[] = [
  { value: "text",     label: "Short text" },
  { value: "textarea", label: "Long text" },
  { value: "number",   label: "Number" },
  { value: "date",     label: "Date" },
  { value: "boolean",  label: "Yes / No" },
  { value: "select",   label: "Dropdown" },
  { value: "url",      label: "URL" },
  { value: "email",    label: "Email" },
];

const ENTITIES: { value: CustomFieldEntity; label: string }[] = [
  { value: "candidate",  label: "Candidates" },
  { value: "job",        label: "Jobs" },
  { value: "company",    label: "Companies" },
  { value: "placement",  label: "Placements" },
];

function toSnakeCase(s: string) {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function CustomFieldsSettings() {
  const [activeEntity, setActiveEntity] = useState<CustomFieldEntity>("candidate");
  const { defs, loading, createField, deleteField, updateField } = useCustomFieldDefinitions(activeEntity);

  const [adding,       setAdding]       = useState(false);
  const [newName,      setNewName]      = useState("");
  const [newType,      setNewType]      = useState<CustomFieldType>("text");
  const [newOptions,   setNewOptions]   = useState("");  // comma-separated for select
  const [newRequired,  setNewRequired]  = useState(false);
  const [newClient,    setNewClient]    = useState(false);
  const [saving,       setSaving]       = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);

    const key = toSnakeCase(newName);
    const options = newType === "select"
      ? newOptions.split(",").map((o) => o.trim()).filter(Boolean)
      : undefined;

    const result = await createField({
      entity:       activeEntity,
      name:         newName.trim(),
      key,
      fieldType:    newType,
      options,
      required:     newRequired,
      clientVisible: newClient,
    });

    if (result) {
      toast.success(`Custom field "${newName}" created`);
      setNewName(""); setNewType("text"); setNewOptions(""); setNewRequired(false); setNewClient(false);
      setAdding(false);
    } else {
      toast.error("Failed to create field — key may already exist");
    }
    setSaving(false);
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-base font-semibold text-foreground">Custom Fields</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Add extra fields to any record type. Values appear on the record detail page.
        </p>
      </div>

      {/* Entity tabs */}
      <div className="flex gap-1 rounded-lg border border-border p-0.5 bg-muted/30 w-fit">
        {ENTITIES.map((e) => (
          <button
            key={e.value}
            onClick={() => setActiveEntity(e.value)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              activeEntity === e.value
                ? "bg-card shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {e.label}
          </button>
        ))}
      </div>

      {/* Field list */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-semibold text-foreground">
            {ENTITIES.find((e) => e.value === activeEntity)?.label} fields
          </p>
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />Add field
          </button>
        </div>

        {loading ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : defs.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No custom fields yet. Click "Add field" to create one.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {defs.map((def) => (
              <div key={def.id} className="flex items-center gap-3 px-4 py-3">
                <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/40 cursor-grab" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{def.name}</p>
                    {def.required && (
                      <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">Required</span>
                    )}
                    {def.clientVisible && (
                      <span className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-600">Client visible</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {FIELD_TYPES.find((t) => t.value === def.fieldType)?.label}
                    {" · "}key: <code className="text-[11px] bg-muted px-1 rounded">{def.key}</code>
                    {def.options?.length ? ` · ${def.options.length} options` : ""}
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (!confirm(`Delete the "${def.name}" field? All stored values will be lost.`)) return;
                    deleteField(def.id);
                    toast.success("Field deleted");
                  }}
                  className="rounded-md p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add field form */}
      {adding && (
        <div className="rounded-xl border border-brand-200 bg-brand-50/30 p-4 space-y-3">
          <p className="text-sm font-semibold text-foreground">New field</p>
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Field name <span className="text-red-500">*</span></label>
                <input
                  autoFocus
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. LinkedIn Score"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
                />
                {newName && (
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    Key: <code>{toSnakeCase(newName)}</code>
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Type</label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as CustomFieldType)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none"
                >
                  {FIELD_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {newType === "select" && (
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Options (comma-separated)</label>
                <input
                  value={newOptions}
                  onChange={(e) => setNewOptions(e.target.value)}
                  placeholder="Option A, Option B, Option C"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            )}

            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={newRequired}
                  onChange={(e) => setNewRequired(e.target.checked)}
                  className="rounded border-border"
                />
                Required
              </label>
              <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={newClient}
                  onChange={(e) => setNewClient(e.target.checked)}
                  className="rounded border-border"
                />
                Visible on client portal
              </label>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={saving || !newName.trim()}
                className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                {saving ? "Creating…" : "Create field"}
              </button>
              <button
                type="button"
                onClick={() => { setAdding(false); setNewName(""); }}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function FeeModelsLink() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <DollarSign className="mb-3 h-8 w-8 text-muted-foreground/40" />
      <p className="text-sm font-medium text-foreground">Fee Model Library</p>
      <p className="mt-1 text-xs text-muted-foreground mb-4">Manage your reusable fee structures</p>
      <Link href="/settings/fee-models" className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors">
        <ChevronRight className="h-4 w-4" />Open Fee Models
      </Link>
    </div>
  );
}

function PayoutsLink() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Wallet className="mb-3 h-8 w-8 text-muted-foreground/40" />
      <p className="text-sm font-medium text-foreground mb-1">Recruiter Payouts</p>
      <p className="text-xs text-muted-foreground mb-4 max-w-sm">
        Review, approve, and export recruiter commission splits for payroll. Default window is the prior month;
        held splits are surfaced in a separate tab for dispute resolution.
      </p>
      <Link href="/settings/payouts" className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors">
        <ChevronRight className="h-4 w-4" />Open Payouts
      </Link>
    </div>
  );
}

function ApiKeysLink() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Zap className="mb-3 h-8 w-8 text-muted-foreground/40" />
      <p className="text-sm font-medium text-foreground">API Keys</p>
      <p className="mt-1 text-xs text-muted-foreground mb-4">Manage scoped API keys for integrations</p>
      <Link href="/settings/api-keys" className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors">
        <ChevronRight className="h-4 w-4" />Manage API Keys
      </Link>
    </div>
  );
}

function AiModelsLink() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <BrainCircuit className="mb-3 h-8 w-8 text-muted-foreground/40" />
      <p className="text-sm font-medium text-foreground mb-1">AI Model Configuration</p>
      <p className="text-xs text-muted-foreground mb-4 max-w-xs">
        Choose your preferred Claude model and optionally supply your own Anthropic API key.
      </p>
      <Link
        href="/settings/ai-models"
        className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
      >
        <BrainCircuit className="h-4 w-4" />
        Configure AI Models
      </Link>
    </div>
  );
}

function PrepTemplatesLink() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <BookOpen className="mb-3 h-8 w-8 text-muted-foreground/40" />
      <p className="text-sm font-medium text-foreground">Prep Templates</p>
      <p className="mt-1 text-xs text-muted-foreground mb-4">
        Build a library of reusable preparation materials for candidate portal links
      </p>
      <Link href="/settings/prep-templates" className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors">
        <ChevronRight className="h-4 w-4" />Manage Templates
      </Link>
    </div>
  );
}

function AgencyProfileLink() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Building2 className="mb-3 h-8 w-8 text-muted-foreground/40" />
      <p className="text-sm font-medium text-foreground mb-1">Agency Profile</p>
      <p className="text-xs text-muted-foreground mb-4 max-w-xs">
        Set your legal name and physical mailing address. Required by CAN-SPAM for every outbound email.
      </p>
      <Link href="/settings/agency-profile" className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors">
        <Building2 className="h-4 w-4" />
        Configure
      </Link>
    </div>
  );
}

function SuppressionLink() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <ShieldOff className="mb-3 h-8 w-8 text-muted-foreground/40" />
      <p className="text-sm font-medium text-foreground mb-1">Suppression List</p>
      <p className="text-xs text-muted-foreground mb-4 max-w-xs">
        Review unsubscribes, hard bounces, and spam complaints. Addresses here are never sent to.
      </p>
      <Link href="/settings/suppression" className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors">
        <ShieldOff className="h-4 w-4" />
        Review
      </Link>
    </div>
  );
}

function SendingDomainsLink() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Globe className="mb-3 h-8 w-8 text-muted-foreground/40" />
      <p className="text-sm font-medium text-foreground mb-1">Custom Sending Domain</p>
      <p className="text-xs text-muted-foreground mb-4 max-w-xs">
        Send outreach from your own domain with SPF, DKIM, and DMARC authentication.
      </p>
      <Link href="/settings/sending-domains" className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors">
        <Globe className="h-4 w-4" />
        Configure
      </Link>
    </div>
  );
}

function WebhooksLink() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Zap className="mb-3 h-8 w-8 text-muted-foreground/40" />
      <p className="text-sm font-medium text-foreground mb-1">Webhooks</p>
      <p className="text-xs text-muted-foreground mb-4 max-w-xs">
        Connect Zapier, Make, or any custom integration via signed HTTP callbacks.
        Get notified when candidates move stages, placements are logged, and more.
      </p>
      <Link href="/settings/webhooks" className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors">
        <Zap className="h-4 w-4" />
        Manage Webhooks
      </Link>
    </div>
  );
}

const SECTION_CONTENT: Record<SectionId, React.ComponentType> = {
  org:           OrgSettings,
  users:         TeamSettings,
  pipeline:      PipelineSettings,
  tags:          TagSettings,
  fields:        CustomFieldsSettings,
  notifications: NotificationSettings,
  integrations:  IntegrationSettings,
  data:          DataPrivacySettings,
  billing:       BillingSettings,
  audit:         AuditLog,
  "fee-models":  FeeModelsLink,
  payouts:       PayoutsLink,
  "api-keys":         ApiKeysLink,
  "prep-templates":   PrepTemplatesLink,
  "ai-models":        AiModelsLink,
  pods:               PodsSettings,
  alerts:        AlertsSettings,
  submissions:   SubmissionsSettings,
  "off-limits":  OffLimitsSettings,
  "agency-profile":   AgencyProfileLink,
  suppression:        SuppressionLink,
  "sending-domains":  SendingDomainsLink,
  webhooks:           WebhooksLink,
};

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState<SectionId>("org");
  const { can } = usePermissions();

  // Filter the sidebar to only sections the user has access to
  const visibleSections = useMemo(
    () => SECTIONS.filter((s) => can(s.permission)),
    [can]
  );

  // If the current active section was filtered out, fall back to the first visible one
  const resolvedSection = useMemo(() => {
    if (visibleSections.some((s) => s.id === activeSection)) return activeSection;
    return visibleSections[0]?.id ?? "notifications";
  }, [activeSection, visibleSections]) as SectionId;

  const ActiveComponent = SECTION_CONTENT[resolvedSection];

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-56 shrink-0 border-r border-border bg-card overflow-y-auto">
        <div className="border-b border-border px-4 py-4">
          <h1 className="text-sm font-bold text-foreground">Settings</h1>
        </div>
        <nav className="p-2">
          {visibleSections.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  resolvedSection === s.id
                    ? "bg-brand-50 text-brand-700"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <Icon className={cn("h-4 w-4 shrink-0", resolvedSection === s.id ? "text-brand-600" : "text-muted-foreground")} />
                {s.label}
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="flex-1 overflow-y-auto p-8">
        <ActiveComponent />
      </main>
    </div>
  );
}
