"use client";

/**
 * /settings/prep-templates
 * US-243: Stage Prep Template Library.
 *
 * Recruiters create reusable prep content templates (text notes or links)
 * that can be quickly applied to any candidate's portal from the candidate
 * detail page. Templates can be optionally scoped to a pipeline stage name.
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Plus,
  Trash2,
  FileText,
  ExternalLink,
  Loader2,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useFeatureFlag } from "@/lib/supabase/hooks";
import { FeatureGate } from "@/components/ui/feature-gate";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Template {
  id:           string;
  title:        string;
  content_type: "text" | "link";
  body:         string | null;
  url:          string | null;
  stage_name:   string | null;
  is_global:    boolean;
  created_at:   string;
}

// ─── Template row ─────────────────────────────────────────────────────────────

function TemplateRow({
  template,
  onDelete,
  onUpdate,
}: {
  template: Template;
  onDelete: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Template>) => void;
}) {
  const [editing,  setEditing]  = useState(false);
  const [title,    setTitle]    = useState(template.title);
  const [body,     setBody]     = useState(template.body ?? "");
  const [url,      setUrl]      = useState(template.url ?? "");
  const [stage,    setStage]    = useState(template.stage_name ?? "");
  const [saving,   setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function save() {
    if (!title.trim()) { toast.error("Title is required"); return; }
    setSaving(true);
    try {
      const patch: Record<string, unknown> = {
        title: title.trim(),
        stageName: stage.trim() || null,
      };
      if (template.content_type === "text") patch.body = body;
      else                                   patch.url  = url;

      const res = await fetch(`/api/settings/prep-templates/${template.id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const { template: updated } = await res.json();
      onUpdate(template.id, updated);
      setEditing(false);
      toast.success("Template updated");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/settings/prep-templates/${template.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error("Failed");
      onDelete(template.id);
      toast.success("Template deleted");
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeleting(false);
    }
  }

  if (editing) {
    return (
      <div className="rounded-xl border border-brand-200 bg-brand-50/30 p-4 space-y-3">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
        {template.content_type === "text" ? (
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Content"
            rows={4}
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none"
          />
        ) : (
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        )}
        <input
          type="text"
          value={stage}
          onChange={(e) => setStage(e.target.value)}
          placeholder="Stage name (optional)"
          className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
        <div className="flex gap-2 justify-end">
          <button
            onClick={() => setEditing(false)}
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-3 py-1.5 text-xs rounded-lg bg-brand-600 text-white font-medium hover:bg-brand-700 disabled:opacity-50 flex items-center gap-1"
          >
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-colors group">
      <div className="shrink-0 w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center mt-0.5">
        {template.content_type === "link"
          ? <ExternalLink className="h-4 w-4 text-slate-500" />
          : <FileText className="h-4 w-4 text-slate-500" />
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800">{template.title}</p>
        {template.stage_name && (
          <span className="inline-block mt-0.5 px-2 py-0.5 text-[10px] rounded-full bg-violet-50 text-violet-700 font-medium border border-violet-200">
            {template.stage_name}
          </span>
        )}
        {template.content_type === "text" && template.body && (
          <p className="mt-1 text-xs text-slate-500 line-clamp-2">{template.body}</p>
        )}
        {template.content_type === "link" && template.url && (
          <a
            href={template.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 flex items-center gap-1 text-xs text-brand-600 hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            {template.url}
          </a>
        )}
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          onClick={() => setEditing(true)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={remove}
          disabled={deleting}
          className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-50"
        >
          {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

// ─── Create form ──────────────────────────────────────────────────────────────

function CreateTemplateForm({ onCreated, onClose }: { onCreated: (t: Template) => void; onClose: () => void }) {
  const [contentType, setContentType] = useState<"text" | "link">("text");
  const [title,       setTitle]       = useState("");
  const [body,        setBody]        = useState("");
  const [url,         setUrl]         = useState("");
  const [stageName,   setStageName]   = useState("");
  const [saving,      setSaving]      = useState(false);

  async function save() {
    if (!title.trim()) { toast.error("Title is required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/settings/prep-templates", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentType,
          title:     title.trim(),
          body:      contentType === "text" ? body : undefined,
          url:       contentType === "link" ? url  : undefined,
          stageName: stageName.trim() || undefined,
          isGlobal:  true,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const { template } = await res.json();
      onCreated(template);
      onClose();
      toast.success("Template created");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to create");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50/30 p-5 space-y-3">
      <h3 className="text-sm font-semibold text-slate-800">New Template</h3>
      <div className="flex gap-2">
        {(["text", "link"] as const).map((type) => (
          <button
            key={type}
            onClick={() => setContentType(type)}
            className={cn(
              "px-3 py-1 rounded-lg text-xs font-medium border transition-colors",
              contentType === type
                ? "bg-brand-600 text-white border-brand-600"
                : "bg-white text-slate-600 border-slate-200 hover:border-brand-300"
            )}
          >
            {type === "text" ? "📄 Text" : "🔗 Link"}
          </button>
        ))}
      </div>
      <input
        type="text"
        placeholder="Title *"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
      />
      {contentType === "text" ? (
        <textarea
          placeholder="Content (markdown supported)"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none"
        />
      ) : (
        <input
          type="url"
          placeholder="https://…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
      )}
      <input
        type="text"
        placeholder="Stage name (optional — e.g. Phone Screen, Final Interview)"
        value={stageName}
        onChange={(e) => setStageName(e.target.value)}
        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
      />
      <p className="text-xs text-slate-400">
        Leave stage name blank to make this template available at any pipeline stage.
      </p>
      <div className="flex gap-2 justify-end">
        <button
          onClick={onClose}
          className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="px-3 py-1.5 text-xs rounded-lg bg-brand-600 text-white font-medium hover:bg-brand-700 disabled:opacity-50 flex items-center gap-1"
        >
          {saving && <Loader2 className="h-3 w-3 animate-spin" />}
          Create Template
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PrepTemplatesPage() {
  // US-513: Stage prep library is Pro-tier.
  const { enabled: prepEnabled, loading: prepLoading } = useFeatureFlag("stage_prep_library");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [showForm,  setShowForm]  = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/prep-templates");
      if (!res.ok) throw new Error();
      const { templates: t } = await res.json();
      setTemplates(t ?? []);
    } catch {
      toast.error("Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const textTemplates = templates.filter((t) => t.content_type === "text");
  const linkTemplates = templates.filter((t) => t.content_type === "link");

  // US-513: plan gate — prep library requires Pro.
  if (!prepLoading && !prepEnabled) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <FeatureGate feature="stage_prep_library" className="max-w-sm" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-10 px-6 space-y-8">
      {/* Header */}
      <div>
        <Link
          href="/settings"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Settings
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Prep Templates</h1>
            <p className="text-sm text-slate-500 mt-1">
              Reusable materials to attach to candidate portal links. Apply them from the candidate detail page.
            </p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Template
          </button>
        </div>
      </div>

      {/* Create form */}
      {showForm && (
        <CreateTemplateForm
          onCreated={(t) => setTemplates((prev) => [t, ...prev])}
          onClose={() => setShowForm(false)}
        />
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-slate-200 rounded-2xl">
          <FileText className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">No templates yet</p>
          <p className="text-xs text-slate-400 mt-1">
            Create a template to quickly add prep materials to any candidate's portal.
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Create first template
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => (
            <TemplateRow
              key={t.id}
              template={t}
              onDelete={(id) => setTemplates((prev) => prev.filter((x) => x.id !== id))}
              onUpdate={(id, patch) =>
                setTemplates((prev) => prev.map((x) => x.id === id ? { ...x, ...patch } : x))
              }
            />
          ))}
        </div>
      )}

      {/* Summary */}
      {!loading && templates.length > 0 && (
        <p className="text-xs text-slate-400 text-center">
          {templates.length} template{templates.length !== 1 ? "s" : ""} ·{" "}
          {textTemplates.length} text · {linkTemplates.length} link
        </p>
      )}
    </div>
  );
}
