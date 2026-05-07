"use client";

import { useState, useRef, useEffect } from "react";
import { Plus, X, Tag, Check, Loader2 } from "lucide-react";
import { useTags, useCandidateTags, type TagRecord } from "@/lib/supabase/hooks";
import { cn } from "@/lib/utils";

// ─── Preset color palette ─────────────────────────────────────────────────────

const PRESET_COLORS = [
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#f43f5e", // rose
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#14b8a6", // teal
  "#06b6d4", // cyan
  "#3b82f6", // blue
  "#64748b", // slate
  "#78716c", // stone
];

// ─── New tag form (inside the dropdown) ──────────────────────────────────────

interface NewTagFormProps {
  onCreated: (tag: TagRecord) => void;
  onCancel: () => void;
  createTag: (name: string, color: string) => Promise<TagRecord | null>;
}

function NewTagForm({ onCreated, onCancel, createTag }: NewTagFormProps) {
  const [name, setName]     = useState("");
  const [color, setColor]   = useState(PRESET_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const inputRef            = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const tag = await createTag(name.trim(), color);
    setSaving(false);
    if (tag) onCreated(tag);
  }

  return (
    <form onSubmit={handleSubmit} className="border-t border-border p-3 space-y-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">New tag</p>
      <input
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Tag name…"
        className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-brand-500"
      />
      <div className="flex flex-wrap gap-1.5">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            className="h-5 w-5 rounded-full border-2 transition-transform hover:scale-110"
            style={{
              backgroundColor: c,
              borderColor: color === c ? "white" : "transparent",
              boxShadow: color === c ? `0 0 0 2px ${c}` : "none",
            }}
          />
        ))}
      </div>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!name.trim() || saving}
          className="flex items-center gap-1 rounded-md bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          Create
        </button>
      </div>
    </form>
  );
}

// ─── Tag dropdown ─────────────────────────────────────────────────────────────

interface TagDropdownProps {
  allTags:    TagRecord[];
  appliedIds: Set<string>;
  onAdd:      (tagId: string) => void;
  onRemove:   (tagId: string) => void;
  createTag:  (name: string, color: string) => Promise<TagRecord | null>;
  onClose:    () => void;
}

function TagDropdown({ allTags, appliedIds, onAdd, onRemove, createTag, onClose }: TagDropdownProps) {
  const [search, setSearch]       = useState("");
  const [showNew, setShowNew]     = useState(false);
  const ref                       = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const filtered = allTags.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  function handleCreated(tag: TagRecord) {
    onAdd(tag.id);
    setShowNew(false);
    setSearch("");
  }

  return (
    <div
      ref={ref}
      className="absolute left-0 top-full z-50 mt-1 w-56 rounded-xl border border-border bg-card shadow-xl"
    >
      {/* Search */}
      <div className="p-2">
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tags…"
          className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder-muted-foreground outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      {/* Tag list */}
      <div className="max-h-48 overflow-y-auto">
        {filtered.length === 0 && !showNew && (
          <p className="px-3 py-2 text-xs text-muted-foreground">No tags found</p>
        )}
        {filtered.map((tag) => {
          const applied = appliedIds.has(tag.id);
          return (
            <button
              key={tag.id}
              onClick={() => applied ? onRemove(tag.id) : onAdd(tag.id)}
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-xs hover:bg-accent transition-colors"
            >
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: tag.color }}
              />
              <span className="flex-1 text-left text-foreground">{tag.name}</span>
              {applied && <Check className="h-3 w-3 text-brand-600 shrink-0" />}
            </button>
          );
        })}
      </div>

      {/* New tag */}
      {showNew ? (
        <NewTagForm
          onCreated={handleCreated}
          onCancel={() => setShowNew(false)}
          createTag={createTag}
        />
      ) : (
        <div className="border-t border-border p-2">
          <button
            onClick={() => setShowNew(true)}
            className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Create new tag
          </button>
        </div>
      )}
    </div>
  );
}

// ─── TagEditor (exported) ─────────────────────────────────────────────────────

interface TagEditorProps {
  candidateId: string;
}

export function TagEditor({ candidateId }: TagEditorProps) {
  const { tags: allTags, loading: tagsLoading, createTag } = useTags();
  const { appliedIds, loading: appliedLoading, addTag, removeTag } = useCandidateTags(candidateId);
  const [open, setOpen] = useState(false);

  const loading = tagsLoading || appliedLoading;

  const appliedTags = allTags.filter((t) => appliedIds.has(t.id));

  if (loading) {
    return (
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Tags</p>
        <div className="h-5 w-20 animate-pulse rounded-full bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Tags</p>

      <div className="relative">
        {/* Applied tag pills */}
        <div className="flex flex-wrap gap-1">
          {appliedTags.map((tag) => (
            <span
              key={tag.id}
              className="group flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors"
              style={{ backgroundColor: tag.color + "22", color: tag.color }}
            >
              {tag.name}
              <button
                onClick={() => removeTag(tag.id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                title={`Remove ${tag.name}`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}

          {/* Add tag button */}
          <button
            onClick={() => setOpen((v) => !v)}
            className={cn(
              "flex items-center gap-0.5 rounded-full border border-dashed px-2 py-0.5 text-[10px] font-medium transition-colors",
              open
                ? "border-brand-400 bg-brand-50 text-brand-600"
                : "border-border text-muted-foreground hover:border-brand-300 hover:text-brand-600"
            )}
          >
            <Tag className="h-2.5 w-2.5" />
            {appliedTags.length === 0 ? "Add tag" : <Plus className="h-2.5 w-2.5" />}
          </button>
        </div>

        {/* Dropdown */}
        {open && (
          <TagDropdown
            allTags={allTags}
            appliedIds={appliedIds}
            onAdd={(id) => addTag(id)}
            onRemove={(id) => removeTag(id)}
            createTag={createTag}
            onClose={() => setOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
