"use client";

/**
 * CandidatePortalPanel
 * US-240 + US-242: Recruiter-facing panel on the candidate detail page.
 *
 * Displays the candidate's active portal link (if any), lets the recruiter
 * generate / resend a link, and manages per-candidate stage prep content.
 * Also provides a "Use template" shortcut to pull from the template library.
 */

import { useState, useEffect, useCallback } from "react";
import {
  Link2,
  Send,
  Plus,
  Trash2,
  FileText,
  ExternalLink,
  Loader2,
  Copy,
  CheckCheck,
  BookMarked,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PrepItem {
  id:          string;
  title:       string;
  content_type: "text" | "link";
  body:        string | null;
  url:         string | null;
  stage_name:  string | null;
  sort_order:  number;
}

interface Template {
  id:           string;
  title:        string;
  content_type: "text" | "link";
  body:         string | null;
  url:          string | null;
  stage_name:   string | null;
}

interface CandidatePortalPanelProps {
  candidateId: string;
  jobId?:      string;
  jobTitle?:   string;
}

// ─── Add item form ────────────────────────────────────────────────────────────

function AddPrepItemForm({
  candidateId,
  jobId,
  templates,
  onAdd,
  onClose,
}: {
  candidateId: string;
  jobId?:      string;
  templates:   Template[];
  onAdd:       (item: PrepItem) => void;
  onClose:     () => void;
}) {
  const [contentType, setContentType] = useState<"text" | "link">("text");
  const [title,       setTitle]       = useState("");
  const [body,        setBody]        = useState("");
  const [url,         setUrl]         = useState("");
  const [stageName,   setStageName]   = useState("");
  const [saving,      setSaving]      = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  function applyTemplate(t: Template) {
    setTitle(t.title);
    setContentType(t.content_type);
    setBody(t.body ?? "");
    setUrl(t.url ?? "");
    setStageName(t.stage_name ?? "");
    setShowTemplates(false);
  }

  async function save() {
    if (!title.trim()) { toast.error("Title is required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/candidate-portal/prep-content", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId,
          jobId:       jobId ?? undefined,
          contentType,
          title:       title.trim(),
          body:        contentType === "text" ? body : undefined,
          url:         contentType === "link" ? url  : undefined,
          stageName:   stageName.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const { item } = await res.json();
      onAdd(item);
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border border-brand-200 rounded-xl bg-brand-50/30 p-4 space-y-3">
      {/* Template shortcut */}
      {templates.length > 0 && (
        <div className="relative">
          <button
            onClick={() => setShowTemplates(!showTemplates)}
            className="flex items-center gap-1.5 text-xs font-medium text-brand-700 hover:text-brand-900"
          >
            <BookMarked className="h-3.5 w-3.5" />
            Use template
            {showTemplates ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {showTemplates && (
            <div className="absolute top-6 left-0 z-10 w-72 bg-white border border-slate-200 rounded-xl shadow-lg py-1 max-h-52 overflow-y-auto">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => applyTemplate(t)}
                  className="w-full text-left px-3 py-2 hover:bg-slate-50 transition-colors"
                >
                  <p className="text-sm font-medium text-slate-800 truncate">{t.title}</p>
                  {t.stage_name && (
                    <p className="text-xs text-slate-400">{t.stage_name}</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Type toggle */}
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
        placeholder="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
      />

      {contentType === "text" ? (
        <textarea
          placeholder="Content (markdown supported)"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
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
        placeholder="Stage name (optional — leave blank for all stages)"
        value={stageName}
        onChange={(e) => setStageName(e.target.value)}
        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
      />

      <div className="flex gap-2 justify-end">
        <button
          onClick={onClose}
          className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="px-3 py-1.5 text-xs rounded-lg bg-brand-600 text-white font-medium hover:bg-brand-700 disabled:opacity-50 flex items-center gap-1 transition-colors"
        >
          {saving && <Loader2 className="h-3 w-3 animate-spin" />}
          Save
        </button>
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function CandidatePortalPanel({ candidateId, jobId, jobTitle }: CandidatePortalPanelProps) {
  const [portalUrl,   setPortalUrl]   = useState<string | null>(null);
  const [tokenId,     setTokenId]     = useState<string | null>(null);
  const [prepItems,   setPrepItems]   = useState<PrepItem[]>([]);
  const [templates,   setTemplates]   = useState<Template[]>([]);
  const [sending,     setSending]     = useState(false);
  const [copied,      setCopied]      = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [deleting,    setDeleting]    = useState<string | null>(null);
  // US-241: stage gate
  const [stageGate,     setStageGate]     = useState(0);
  const [savingGate,    setSavingGate]    = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ candidateId });
    if (jobId) params.set("jobId", jobId);

    const [prepRes, templatesRes] = await Promise.all([
      fetch(`/api/candidate-portal/prep-content?${params}`),
      fetch("/api/settings/prep-templates"),
    ]);

    if (prepRes.ok) {
      const { items } = await prepRes.json();
      setPrepItems(items ?? []);
    }
    if (templatesRes.ok) {
      const { templates: t } = await templatesRes.json();
      setTemplates(t ?? []);
    }
  }, [candidateId, jobId]);

  useEffect(() => { load(); }, [load]);

  async function sendLink() {
    setSending(true);
    try {
      const res = await fetch("/api/candidate-portal/send-link", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId, jobId }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const data = await res.json();
      setPortalUrl(data.portalUrl);
      if (data.tokenId) setTokenId(data.tokenId);
      toast.success("Portal link sent to candidate");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to send link");
    } finally {
      setSending(false);
    }
  }

  async function generateLink() {
    setSending(true);
    try {
      const res = await fetch("/api/candidate-portal/send-link", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId, jobId }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const data = await res.json();
      setPortalUrl(data.portalUrl);
      if (data.tokenId) setTokenId(data.tokenId);
      toast.success("Portal link generated");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to generate link");
    } finally {
      setSending(false);
    }
  }

  function copyUrl() {
    if (!portalUrl) return;
    navigator.clipboard.writeText(portalUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function deleteItem(id: string) {
    setDeleting(id);
    try {
      const res = await fetch(`/api/candidate-portal/prep-content/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      setPrepItems((prev) => prev.filter((p) => p.id !== id));
      toast.success("Removed");
    } catch {
      toast.error("Failed to remove item");
    } finally {
      setDeleting(null);
    }
  }

  async function saveStageGate(order: number) {
    if (!tokenId) return;
    setSavingGate(true);
    try {
      await fetch(`/api/candidate-portal/tokens/${tokenId}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", "x-csrf-token": "1" },
        body:    JSON.stringify({ unlockedFromStageOrder: order }),
      });
      setStageGate(order);
      toast.success(order === 0 ? "Portal visible at all stages" : `Portal unlocked from stage ${order}`);
    } finally {
      setSavingGate(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-brand-600" />
          <span className="text-sm font-semibold text-slate-800">Candidate Portal</span>
        </div>
        {!portalUrl && (
          <button
            onClick={generateLink}
            disabled={sending}
            className="flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-900 disabled:opacity-50"
          >
            {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />}
            Generate link
          </button>
        )}
      </div>

      <div className="p-4 space-y-4">
        {/* Portal link */}
        {portalUrl ? (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-brand-50 border border-brand-200">
            <Link2 className="h-3.5 w-3.5 text-brand-600 shrink-0" />
            <span className="text-xs text-brand-700 font-mono truncate flex-1">{portalUrl}</span>
            <button onClick={copyUrl} className="shrink-0 text-brand-600 hover:text-brand-900">
              {copied ? <CheckCheck className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={sendLink}
              disabled={sending}
              className="shrink-0 flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-900 disabled:opacity-50"
            >
              {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              {sending ? "Sending…" : "Resend"}
            </button>
          </div>
        ) : (
          <p className="text-xs text-slate-400">
            Generate a portal link to share the candidate's application status and prep materials.
          </p>
        )}

        {/* US-241: Stage gate */}
        {portalUrl && tokenId && jobId && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="shrink-0">Content visible from stage order:</span>
            <input
              type="number"
              min={0}
              value={stageGate}
              onChange={e => setStageGate(Number(e.target.value))}
              className="w-14 px-2 py-1 rounded border border-slate-200 text-xs text-center focus:outline-none focus:ring-1 focus:ring-brand-400"
            />
            <button
              onClick={() => saveStageGate(stageGate)}
              disabled={savingGate}
              className="px-2 py-1 rounded bg-brand-50 text-brand-700 text-xs font-medium hover:bg-brand-100 disabled:opacity-50 transition-colors"
            >
              {savingGate ? "…" : "Save"}
            </button>
            <span className="text-slate-400">(0 = always visible)</span>
          </div>
        )}

        {/* Prep content */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
              Prep Content
              {jobTitle && <span className="ml-1 text-slate-400 normal-case font-normal">· {jobTitle}</span>}
            </span>
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-900"
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </button>
          </div>

          {showAddForm && (
            <div className="mb-3">
              <AddPrepItemForm
                candidateId={candidateId}
                jobId={jobId}
                templates={templates}
                onAdd={(item) => setPrepItems((prev) => [...prev, item])}
                onClose={() => setShowAddForm(false)}
              />
            </div>
          )}

          {prepItems.length === 0 && !showAddForm ? (
            <p className="text-xs text-slate-400 italic">No prep materials added yet.</p>
          ) : (
            <div className="space-y-1.5">
              {prepItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-50 border border-slate-200 group"
                >
                  <div className="shrink-0 text-slate-400">
                    {item.content_type === "link"
                      ? <ExternalLink className="h-3.5 w-3.5" />
                      : <FileText className="h-3.5 w-3.5" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-800 truncate">{item.title}</p>
                    {item.stage_name && (
                      <p className="text-[10px] text-slate-400">{item.stage_name}</p>
                    )}
                  </div>
                  <button
                    onClick={() => deleteItem(item.id)}
                    disabled={deleting === item.id}
                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all disabled:opacity-50"
                  >
                    {deleting === item.id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Trash2 className="h-3.5 w-3.5" />
                    }
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
