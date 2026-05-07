"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  ChevronLeft, Plus, Target, Trash2, Pencil, Loader2,
  Building2, Users, Tag, Star, X, Check,
} from "lucide-react";
import {
  useTargetAccounts, useTargetAccountMembers, useCompanies, useFeatureFlag,
  type TargetPriority,
} from "@/lib/supabase/hooks";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { FeatureGate } from "@/components/ui/feature-gate";

// ─── Config ───────────────────────────────────────────────────────────────────

const PRIORITY_CFG: Record<TargetPriority, { label: string; color: string; bg: string }> = {
  tier1: { label: "Tier 1", color: "text-rose-700",   bg: "bg-rose-100"   },
  tier2: { label: "Tier 2", color: "text-amber-700",  bg: "bg-amber-100"  },
  tier3: { label: "Tier 3", color: "text-slate-600",  bg: "bg-slate-100"  },
};

const LIST_COLORS = ["#5461f5", "#7c3aed", "#db2777", "#059669", "#d97706", "#0891b2", "#dc2626", "#65a30d"];

// ─── Create list form ─────────────────────────────────────────────────────────

interface CreateListFormProps {
  onSave:  (name: string, description: string, color: string) => Promise<void>;
  onClose: () => void;
}

function CreateListForm({ onSave, onClose }: CreateListFormProps) {
  const [name, setName]           = useState("");
  const [description, setDesc]    = useState("");
  const [color, setColor]         = useState(LIST_COLORS[0]);
  const [saving, setSaving]       = useState(false);

  async function handleSave() {
    if (!name.trim()) { toast.error("Enter a list name"); return; }
    setSaving(true);
    try { await onSave(name.trim(), description, color); onClose(); }
    finally { setSaving(false); }
  }

  return (
    <div className="rounded-xl border border-dashed border-brand-300 bg-brand-50/40 p-4 space-y-3">
      <p className="text-xs font-semibold text-foreground">New Target Account List</p>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="List name…"
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500" />
      <input value={description} onChange={(e) => setDesc(e.target.value)} placeholder="Description (optional)…"
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500" />
      <div className="flex items-center gap-2">
        {LIST_COLORS.map((c) => (
          <button key={c} onClick={() => setColor(c)}
            className={cn("h-5 w-5 rounded-full transition-all", color === c ? "ring-2 ring-offset-2 ring-brand-500" : "")}
            style={{ background: c }}
          />
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={onClose} className="flex-1 rounded-lg border border-border py-2 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors">Cancel</button>
        <button onClick={handleSave} disabled={saving}
          className="flex-1 rounded-lg bg-brand-600 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto" /> : "Create List"}
        </button>
      </div>
    </div>
  );
}

// ─── Add company picker ───────────────────────────────────────────────────────

interface AddCompanyPickerProps {
  listId:        string;
  existingIds:   Set<string>;
  onAdd:         (companyId: string) => Promise<void>;
  onClose:       () => void;
}

function AddCompanyPicker({ listId, existingIds, onAdd, onClose }: AddCompanyPickerProps) {
  const { companies } = useCompanies();
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  const filtered = useMemo(() =>
    companies.filter((c) => !existingIds.has(c.id) && c.name.toLowerCase().includes(search.toLowerCase())).slice(0, 12),
    [companies, existingIds, search]
  );

  async function handleAdd(id: string) {
    setSaving(id);
    try { await onAdd(id); }
    finally { setSaving(null); }
  }

  return (
    <div className="rounded-xl border border-border bg-card shadow-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground">Add Companies</p>
        <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-accent transition-colors"><X className="h-3.5 w-3.5" /></button>
      </div>
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search companies…"
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand-500" />
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {filtered.length === 0 && <p className="text-xs text-muted-foreground py-2 text-center">No companies match</p>}
        {filtered.map((c) => (
          <button key={c.id} onClick={() => handleAdd(c.id)} disabled={saving === c.id}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-accent transition-colors">
            <div className="flex items-center gap-2">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-medium text-foreground">{c.name}</span>
              {c.industry && <span className="text-xs text-muted-foreground">{c.industry}</span>}
            </div>
            {saving === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-600" /> : <Plus className="h-3.5 w-3.5 text-muted-foreground" />}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TargetAccountsPage() {
  // US-513: Target accounts is a BD module — Pro tier.
  const { enabled: bdEnabled, loading: bdLoading } = useFeatureFlag("business_development");
  const {
    lists, loading, createList, deleteList, addToList, removeFromList, setTargetFlag,
  } = useTargetAccounts();

  const [activeListId, setActiveListId] = useState<string | null>(null);
  const { members, loading: membersLoading } = useTargetAccountMembers(activeListId);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showAddPicker, setShowAddPicker]   = useState(false);

  const existingIds = useMemo(() => new Set(members.map((m) => m.companyId)), [members]);
  const activeList  = lists.find((l) => l.id === activeListId);

  async function handleCreate(name: string, description: string, color: string) {
    const id = await createList(name, description, color);
    if (id) { setActiveListId(id); toast.success("List created"); }
    else toast.error("Failed to create list");
  }

  async function handleDelete(listId: string) {
    await deleteList(listId);
    if (activeListId === listId) setActiveListId(null);
    toast.success("List deleted");
  }

  async function handleAdd(companyId: string) {
    if (!activeListId) return;
    await addToList(activeListId, companyId);
    await setTargetFlag(companyId, true);
    toast.success("Added to list");
  }

  async function handleRemove(companyId: string) {
    if (!activeListId) return;
    await removeFromList(activeListId, companyId);
    toast.success("Removed from list");
  }

  if (!bdLoading && !bdEnabled) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <FeatureGate feature="business_development" className="max-w-sm" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between border-b border-border bg-card px-6 py-4">
        <div className="flex items-center gap-3">
          <Link href="/bd" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="h-3.5 w-3.5" />BD Pipeline
          </Link>
          <span className="text-muted-foreground/40">/</span>
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-brand-600" />
            <h1 className="text-base font-semibold text-foreground">Target Account Lists</h1>
          </div>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
        >
          <Plus className="h-4 w-4" />New List
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Lists sidebar */}
        <div className="w-64 shrink-0 border-r border-border bg-muted/30 overflow-y-auto">
          <div className="p-3 space-y-1">
            {loading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
            ) : lists.length === 0 && !showCreateForm ? (
              <div className="py-8 text-center">
                <Target className="mx-auto h-6 w-6 text-muted-foreground/40 mb-2" />
                <p className="text-xs text-muted-foreground">No target lists yet</p>
              </div>
            ) : null}

            {lists.map((list) => (
              <button
                key={list.id}
                onClick={() => setActiveListId(list.id)}
                className={cn(
                  "group flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left transition-colors",
                  activeListId === list.id ? "bg-brand-50 border border-brand-200" : "hover:bg-accent"
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: list.color }} />
                  <span className={cn("text-sm font-medium truncate", activeListId === list.id ? "text-brand-700" : "text-foreground")}>
                    {list.name}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">{list.memberCount}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(list.id); }}
                    className="hidden group-hover:flex items-center justify-center h-5 w-5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </button>
            ))}

            {showCreateForm && (
              <CreateListForm onSave={handleCreate} onClose={() => setShowCreateForm(false)} />
            )}
          </div>
        </div>

        {/* List content */}
        <div className="flex-1 overflow-y-auto p-6">
          {!activeListId ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <Target className="mx-auto h-10 w-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm font-medium text-foreground">Select a list</p>
                <p className="text-xs text-muted-foreground mt-1">or create a new target account list</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4 max-w-3xl">
              {/* List header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full" style={{ background: activeList?.color }} />
                  <h2 className="text-base font-semibold text-foreground">{activeList?.name}</h2>
                  <span className="text-xs text-muted-foreground">({members.length} accounts)</span>
                </div>
                <button
                  onClick={() => setShowAddPicker(true)}
                  className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:bg-brand-50 rounded-md px-2 py-1 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />Add Companies
                </button>
              </div>

              {/* Add picker */}
              {showAddPicker && (
                <AddCompanyPicker
                  listId={activeListId}
                  existingIds={existingIds}
                  onAdd={handleAdd}
                  onClose={() => setShowAddPicker(false)}
                />
              )}

              {/* Members table */}
              {membersLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : members.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-8 text-center">
                  <Building2 className="mx-auto h-7 w-7 text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">No companies in this list yet</p>
                  <button onClick={() => setShowAddPicker(true)} className="mt-2 text-xs font-medium text-brand-600 hover:underline">+ Add first account</button>
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        {["Company", "Industry", "Priority", "Added", ""].map((h) => (
                          <th key={h} className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((m) => (
                        <tr key={m.companyId} className="group border-b border-border last:border-0 hover:bg-accent/40 transition-colors">
                          <td className="px-4 py-3">
                            <Link href={`/clients/${m.companyId}`} className="flex items-center gap-2 group/link">
                              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-sm font-medium text-foreground group-hover/link:text-brand-600 transition-colors">{m.companyName}</span>
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">{m.industry ?? "—"}</td>
                          <td className="px-4 py-3">
                            {m.priority ? (
                              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", PRIORITY_CFG[m.priority].bg, PRIORITY_CFG[m.priority].color)}>
                                {PRIORITY_CFG[m.priority].label}
                              </span>
                            ) : <span className="text-xs text-muted-foreground">—</span>}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {m.addedAt ? new Date(m.addedAt).toLocaleDateString() : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => handleRemove(m.companyId)}
                              className="hidden group-hover:flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
