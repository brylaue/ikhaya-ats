"use client";

import { useState, useMemo } from "react";
import { Users, Plus, X, ChevronDown, Loader2 } from "lucide-react";
import { useJobRecruiters, type RecruiterRole } from "@/lib/supabase/hooks";
import { cn, getInitials, generateAvatarColor } from "@/lib/utils";
import { toast } from "sonner";

// ─── Role config ──────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<RecruiterRole, string> = {
  lead:        "Lead",
  support:     "Support",
  sourcer:     "Sourcer",
  coordinator: "Coordinator",
};

const ROLE_COLORS: Record<RecruiterRole, string> = {
  lead:        "bg-brand-100 text-brand-700",
  support:     "bg-slate-100 text-slate-600",
  sourcer:     "bg-violet-100 text-violet-700",
  coordinator: "bg-amber-100 text-amber-700",
};

// ─── Recruiter avatar ─────────────────────────────────────────────────────────

function RecruiterAvatar({ name, avatarUrl, size = "md" }: { name: string; avatarUrl?: string; size?: "sm" | "md" }) {
  const sz = size === "sm" ? "h-7 w-7 text-[10px]" : "h-8 w-8 text-xs";
  if (avatarUrl) {
    return <img src={avatarUrl} alt={name} className={cn("rounded-full object-cover shrink-0", sz)} />;
  }
  return (
    <div className={cn("flex items-center justify-center rounded-full font-bold text-white shrink-0", sz, generateAvatarColor(name))}>
      {getInitials(name)}
    </div>
  );
}

// ─── Role dropdown ────────────────────────────────────────────────────────────

function RoleDropdown({ value, onChange }: { value: RecruiterRole; onChange: (r: RecruiterRole) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors",
          ROLE_COLORS[value]
        )}
      >
        {ROLE_LABELS[value]}
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 z-20 mt-1 w-36 rounded-lg border border-border bg-card shadow-lg py-1">
            {(Object.keys(ROLE_LABELS) as RecruiterRole[]).map((r) => (
              <button
                key={r}
                onClick={() => { onChange(r); setOpen(false); }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent transition-colors",
                  r === value && "font-semibold"
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", {
                  "bg-brand-500": r === "lead",
                  "bg-slate-400": r === "support",
                  "bg-violet-500": r === "sourcer",
                  "bg-amber-500": r === "coordinator",
                })} />
                {ROLE_LABELS[r]}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Add recruiter picker ─────────────────────────────────────────────────────

interface AddRecruiterPickerProps {
  jobId:             string;
  assignedUserIds:   Set<string>;
  onAssign:          (userId: string, role: RecruiterRole) => Promise<boolean>;
  onClose:           () => void;
  agencyUsers:       { id: string; fullName: string; email?: string; avatarUrl?: string }[];
}

function AddRecruiterPicker({ assignedUserIds, onAssign, onClose, agencyUsers }: AddRecruiterPickerProps) {
  const [query, setQuery]       = useState("");
  const [role, setRole]         = useState<RecruiterRole>("support");
  const [saving, setSaving]     = useState<string | null>(null);

  const available = useMemo(() =>
    agencyUsers.filter(
      (u) =>
        !assignedUserIds.has(u.id) &&
        (!query || u.fullName.toLowerCase().includes(query.toLowerCase()) ||
          u.email?.toLowerCase().includes(query.toLowerCase()))
    ),
    [agencyUsers, assignedUserIds, query]
  );

  async function handleAssign(userId: string) {
    setSaving(userId);
    const ok = await onAssign(userId, role);
    if (ok) { onClose(); } else { setSaving(null); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">Assign Recruiter</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
        </div>

        {/* Role picker */}
        <div className="border-b border-border px-4 py-2.5">
          <p className="mb-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Role</p>
          <div className="flex gap-1.5 flex-wrap">
            {(Object.keys(ROLE_LABELS) as RecruiterRole[]).map((r) => (
              <button
                key={r}
                onClick={() => setRole(r)}
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors border",
                  role === r ? cn(ROLE_COLORS[r], "border-transparent") : "border-border text-muted-foreground hover:bg-accent"
                )}
              >
                {ROLE_LABELS[r]}
              </button>
            ))}
          </div>
        </div>

        <div className="px-4 pt-3 pb-2">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search team members…"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div className="max-h-60 overflow-y-auto px-4 pb-4 space-y-1">
          {available.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">No team members found</p>
          )}
          {available.map((u) => (
            <button
              key={u.id}
              onClick={() => handleAssign(u.id)}
              disabled={saving === u.id}
              className="flex w-full items-center gap-3 rounded-lg p-2.5 text-left hover:bg-accent transition-colors disabled:opacity-50"
            >
              <RecruiterAvatar name={u.fullName} avatarUrl={u.avatarUrl} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{u.fullName}</p>
                {u.email && <p className="truncate text-xs text-muted-foreground">{u.email}</p>}
              </div>
              {saving === u.id && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

interface RecruiterAssignmentPanelProps {
  jobId: string;
}

export function RecruiterAssignmentPanel({ jobId }: RecruiterAssignmentPanelProps) {
  const { recruiters, agencyUsers, loading, assignRecruiter, updateRole, removeRecruiter } =
    useJobRecruiters(jobId);

  const [showPicker, setShowPicker] = useState(false);

  const assignedUserIds = useMemo(() => new Set(recruiters.map((r) => r.userId)), [recruiters]);

  async function handleAssign(userId: string, role: RecruiterRole) {
    const ok = await assignRecruiter(userId, role);
    if (ok) {
      const user = agencyUsers.find((u) => u.id === userId);
      toast.success(`${user?.fullName ?? "Recruiter"} assigned`);
    } else {
      toast.error("Failed to assign recruiter");
    }
    return ok;
  }

  async function handleRoleChange(recruiterId: string, role: RecruiterRole) {
    await updateRole(recruiterId, role);
  }

  async function handleRemove(recruiterId: string, name: string) {
    await removeRecruiter(recruiterId);
    toast.success(`${name} removed from this search`);
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Assigned Recruiters</span>
          {!loading && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
              {recruiters.length}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowPicker(true)}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Assign
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && recruiters.length === 0 && (
        <div className="py-3 text-center">
          <p className="text-xs text-muted-foreground">No recruiters assigned yet</p>
          <button
            onClick={() => setShowPicker(true)}
            className="mt-2 text-xs font-medium text-brand-600 hover:underline"
          >
            + Assign first recruiter
          </button>
        </div>
      )}

      {!loading && recruiters.length > 0 && (
        <div className="space-y-2">
          {recruiters.map((r) => (
            <div key={r.id} className="flex items-center gap-2.5 group">
              <RecruiterAvatar name={r.fullName} avatarUrl={r.avatarUrl} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground leading-tight">{r.fullName}</p>
                <RoleDropdown
                  value={r.role}
                  onChange={(role) => handleRoleChange(r.id, role)}
                />
              </div>
              <button
                onClick={() => handleRemove(r.id, r.fullName)}
                className="hidden group-hover:flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                title={`Remove ${r.fullName}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {showPicker && (
        <AddRecruiterPicker
          jobId={jobId}
          assignedUserIds={assignedUserIds}
          onAssign={handleAssign}
          onClose={() => setShowPicker(false)}
          agencyUsers={agencyUsers}
        />
      )}
    </div>
  );
}
