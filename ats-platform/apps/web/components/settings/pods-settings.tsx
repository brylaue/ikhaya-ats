"use client";

/**
 * PodsSettings — manage team/pod hierarchy in the Settings page.
 *
 * Allows owners/admins to create pods, assign leads, and add/remove members.
 */

import { useState, useEffect } from "react";
import { Users, Plus, Trash2, UserPlus, Crown, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { cn, getInitials, generateAvatarColor } from "@/lib/utils";
import { usePods, type Pod } from "@/lib/supabase/hooks";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

interface TeamMember {
  id:       string;
  fullName: string;
  role:     string;
  email:    string;
}

export function PodsSettings() {
  const { pods, loading, createPod, deletePod, addMember, removeMember, setLead } = usePods();
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [showCreate,  setShowCreate]  = useState(false);
  const [expanded,    setExpanded]    = useState<Record<string, boolean>>({});
  const [newPodName,  setNewPodName]  = useState("");
  const [newPodColor, setNewPodColor] = useState("#6366f1");
  const [newPodDesc,  setNewPodDesc]  = useState("");
  const [saving,      setSaving]      = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.from("users").select("id, full_name, role, email").eq("is_active", true).order("full_name")
      .then(({ data }) => {
        setTeamMembers((data ?? []).map((u: Record<string, unknown>) => ({
          id:       u.id as string,
          fullName: u.full_name as string,
          role:     u.role as string,
          email:    u.email as string,
        })));
      });
  }, []);

  async function handleCreate() {
    if (!newPodName.trim()) return;
    setSaving(true);
    const result = await createPod(newPodName.trim(), newPodDesc || undefined, newPodColor);
    if ("error" in result) {
      toast.error(result.error ?? "Failed to create pod");
    } else {
      toast.success(`Pod "${newPodName}" created`);
      setNewPodName(""); setNewPodDesc(""); setNewPodColor("#6366f1");
      setShowCreate(false);
    }
    setSaving(false);
  }

  async function handleDelete(pod: Pod) {
    if (!confirm(`Delete pod "${pod.name}"? Members won't be deleted.`)) return;
    await deletePod(pod.id);
    toast.success(`Pod deleted`);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Members not in this pod
  function getAvailableMembers(pod: Pod) {
    const inPod = new Set(pod.members.map((m) => m.userId));
    return teamMembers.filter((m) => !inPod.has(m.id));
  }

  const COLORS = ["#6366f1","#8b5cf6","#ec4899","#f59e0b","#10b981","#3b82f6","#ef4444","#14b8a6"];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Team Pods</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Group recruiters into pods for better organization and reporting.</p>
        </div>
        <button
          onClick={() => setShowCreate((p) => !p)}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
        >
          <Plus className="h-4 w-4" />{showCreate ? "Cancel" : "New Pod"}
        </button>
      </div>

      {showCreate && (
        <div className="rounded-xl border border-brand-200 bg-brand-50/30 p-5 space-y-4">
          <p className="text-sm font-semibold text-foreground">Create Pod</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Pod name *</label>
              <input
                value={newPodName}
                onChange={(e) => setNewPodName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                placeholder="e.g. Finance Pod"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Description</label>
              <input
                value={newPodDesc}
                onChange={(e) => setNewPodDesc(e.target.value)}
                placeholder="Optional description"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Color</label>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setNewPodColor(c)}
                  className={cn(
                    "h-6 w-6 rounded-full border-2 transition-transform hover:scale-110",
                    newPodColor === c ? "border-foreground scale-110" : "border-transparent"
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <button
            onClick={handleCreate}
            disabled={!newPodName.trim() || saving}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Create Pod
          </button>
        </div>
      )}

      {pods.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <Users className="h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No pods yet.</p>
          <p className="text-xs text-muted-foreground">Create a pod to group your recruiting team.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pods.map((pod) => {
            const isExpanded = expanded[pod.id] ?? false;
            const available  = getAvailableMembers(pod);
            return (
              <div key={pod.id} className="rounded-xl border border-border bg-card overflow-hidden">
                {/* Header */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/20 transition-colors"
                  onClick={() => setExpanded((p) => ({ ...p, [pod.id]: !isExpanded }))}
                >
                  <div className="h-8 w-8 shrink-0 rounded-lg flex items-center justify-center" style={{ backgroundColor: pod.color + "20", border: `2px solid ${pod.color}` }}>
                    <Users className="h-4 w-4" style={{ color: pod.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{pod.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {pod.memberCount} member{pod.memberCount !== 1 ? "s" : ""}
                      {pod.leadName && <> · Lead: {pod.leadName}</>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(pod); }}
                      className="rounded-md p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </div>

                {/* Expanded body */}
                {isExpanded && (
                  <div className="border-t border-border p-4 space-y-4">
                    {/* Current members */}
                    {pod.members.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Members</p>
                        <div className="space-y-1">
                          {pod.members.map((m) => {
                            const member = teamMembers.find((tm) => tm.id === m.userId);
                            const isLead = pod.leadId === m.userId;
                            return (
                              <div key={m.userId} className="flex items-center gap-2.5">
                                <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white", generateAvatarColor(m.userId))}>
                                  {getInitials(m.fullName)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-foreground flex items-center gap-1">
                                    {m.fullName}
                                    {isLead && <Crown className="h-3 w-3 text-amber-500" />}
                                  </p>
                                  {member && <p className="text-[10px] text-muted-foreground capitalize">{member.role}</p>}
                                </div>
                                <div className="flex gap-1 shrink-0">
                                  <button
                                    onClick={() => setLead(pod.id, isLead ? null : m.userId)}
                                    className={cn(
                                      "rounded-md p-1 transition-colors",
                                      isLead ? "text-amber-500 hover:text-muted-foreground" : "text-muted-foreground hover:text-amber-500"
                                    )}
                                    title={isLead ? "Remove lead" : "Set as lead"}
                                  >
                                    <Crown className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => removeMember(pod.id, m.userId)}
                                    className="rounded-md p-1 text-muted-foreground hover:text-destructive transition-colors"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Add member */}
                    {available.length > 0 && (
                      <div className="flex items-center gap-2">
                        <UserPlus className="h-4 w-4 text-muted-foreground shrink-0" />
                        <select
                          defaultValue=""
                          onChange={async (e) => {
                            if (!e.target.value) return;
                            const result = await addMember(pod.id, e.target.value);
                            if (result.error) toast.error("Could not add member");
                            else toast.success("Member added");
                            e.target.value = "";
                          }}
                          className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500"
                        >
                          <option value="">Add team member…</option>
                          {available.map((m) => (
                            <option key={m.id} value={m.id}>{m.fullName} ({m.role})</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {pod.members.length === 0 && available.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-2">All team members are in this pod.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
