"use client";

/**
 * Settings → AI Models
 * US-441: BYO AI Model Configuration.
 *
 * Lets agency admins:
 *   - Choose which Claude model is used for all AI features
 *   - Supply their own Anthropic API key (stored encrypted)
 *   - Optionally supply an OpenAI API key (for embeddings)
 *   - Verify the configured key with a live ping
 */

import { useState, useEffect, useCallback } from "react";
import {
  BrainCircuit,
  Key,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RotateCcw,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AiSettings {
  preferredModel:  string;
  hasAnthropicKey: boolean;
  hasOpenAIKey:    boolean;
  updatedAt:       string | null;
}

const MODELS = [
  {
    id:      "claude-opus-4-6",
    label:   "Claude Opus 4.6",
    desc:    "Highest quality — best for complex reasoning, shortlisting, and interview prep.",
    badge:   "Best quality",
    color:   "border-violet-300 bg-violet-50 text-violet-700",
  },
  {
    id:      "claude-sonnet-4-6",
    label:   "Claude Sonnet 4.6",
    desc:    "Balanced quality and speed — the recommended default for most workflows.",
    badge:   "Recommended",
    color:   "border-brand-300 bg-brand-50 text-brand-700",
  },
  {
    id:      "claude-haiku-4-5-20251001",
    label:   "Claude Haiku 4.5",
    desc:    "Fastest and most cost-effective — ideal for high-volume, time-sensitive tasks.",
    badge:   "Fastest",
    color:   "border-emerald-300 bg-emerald-50 text-emerald-700",
  },
] as const;

type ModelId = typeof MODELS[number]["id"];

// ─── API key input ─────────────────────────────────────────────────────────────

function ApiKeyInput({
  label,
  placeholder,
  hasKey,
  onSave,
  onClear,
  saving,
}: {
  label:       string;
  placeholder: string;
  hasKey:      boolean;
  onSave:      (key: string) => Promise<void>;
  onClear:     () => Promise<void>;
  saving:      boolean;
}) {
  const [value,   setValue]   = useState("");
  const [visible, setVisible] = useState(false);
  const [editing, setEditing] = useState(false);

  function startEdit() { setEditing(true); setValue(""); }
  function cancelEdit() { setEditing(false); setValue(""); }

  async function handleSave() {
    if (!value.trim()) return;
    await onSave(value.trim());
    setEditing(false);
    setValue("");
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-slate-700">{label}</label>

      {hasKey && !editing ? (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          <span className="text-sm text-emerald-800 flex-1">Custom key configured</span>
          <button
            onClick={startEdit}
            className="text-xs text-slate-500 hover:text-slate-700 transition-colors"
          >
            Replace
          </button>
          <button
            onClick={onClear}
            disabled={saving}
            className="text-xs text-red-500 hover:text-red-700 transition-colors"
          >
            Clear
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {!hasKey && !editing && (
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-500">
              <Shield className="h-4 w-4 shrink-0" />
              Using platform key
              <button
                onClick={startEdit}
                className="ml-auto text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                Add custom key
              </button>
            </div>
          )}

          {editing && (
            <div className="space-y-2">
              <div className="relative">
                <input
                  type={visible ? "text" : "password"}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={placeholder}
                  autoFocus
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 pr-9 text-sm font-mono focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
                />
                <button
                  type="button"
                  onClick={() => setVisible(!visible)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSave}
                  disabled={!value.trim() || saving}
                  className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Key className="h-3 w-3" />}
                  Save key
                </button>
                <button
                  onClick={cancelEdit}
                  className="rounded-lg px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AiModelsPage() {
  const [settings,   setSettings]   = useState<AiSettings | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [verifying,  setVerifying]  = useState(false);
  const [verifyResult, setVerifyResult] = useState<"ok" | "fail" | null>(null);
  const [selectedModel, setSelectedModel] = useState<ModelId>("claude-sonnet-4-6");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/ai-models");
      if (res.ok) {
        const data: AiSettings = await res.json();
        setSettings(data);
        setSelectedModel(data.preferredModel as ModelId);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function patch(body: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/ai-models", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      if (!res.ok) {
        const { error } = await res.json();
        toast.error(error ?? "Save failed");
        return false;
      }
      await load();
      return true;
    } finally {
      setSaving(false);
    }
  }

  async function saveModel(model: ModelId) {
    setSelectedModel(model);
    const ok = await patch({ preferredModel: model });
    if (ok) toast.success("Model preference saved");
  }

  async function saveAnthropicKey(key: string) {
    const ok = await patch({ anthropicKey: key });
    if (ok) toast.success("Anthropic key saved");
  }

  async function clearAnthropicKey() {
    const ok = await patch({ anthropicKey: null });
    if (ok) toast.success("Custom Anthropic key removed — using platform key");
  }

  async function saveOpenAIKey(key: string) {
    const ok = await patch({ openaiKey: key });
    if (ok) toast.success("OpenAI key saved");
  }

  async function clearOpenAIKey() {
    const ok = await patch({ openaiKey: null });
    if (ok) toast.success("Custom OpenAI key removed — using platform key");
  }

  async function verify() {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const res = await fetch("/api/settings/ai-models/verify", { method: "POST" });
      const { ok } = await res.json();
      setVerifyResult(ok ? "ok" : "fail");
      if (ok) toast.success("Connection verified successfully");
      else    toast.error("Connection failed — check your API key");
    } catch {
      setVerifyResult("fail");
      toast.error("Verification request failed");
    } finally {
      setVerifying(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <BrainCircuit className="h-5 w-5 text-brand-600" />
          <h1 className="text-lg font-semibold text-slate-900">AI Model Configuration</h1>
        </div>
        <p className="text-sm text-slate-500">
          Choose which Claude model powers your AI features and optionally supply your own API keys. Custom keys are stored encrypted and never exposed in plaintext.
        </p>
        {/* US-422: cross-link to AI transparency */}
        <a
          href="/settings/ai-transparency"
          className="mt-2 inline-flex items-center gap-1 text-xs text-violet-600 hover:text-violet-800"
        >
          <Shield className="h-3.5 w-3.5" />
          View AI transparency & decision log
        </a>
      </div>

      {/* Model picker */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Preferred Model</h2>
        <div className="space-y-2">
          {MODELS.map((m) => (
            <label
              key={m.id}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors",
                selectedModel === m.id
                  ? "border-brand-400 bg-brand-50/60"
                  : "border-slate-200 bg-white hover:border-slate-300"
              )}
            >
              <input
                type="radio"
                name="model"
                value={m.id}
                checked={selectedModel === m.id}
                onChange={() => saveModel(m.id)}
                className="mt-0.5 accent-brand-600"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-semibold text-slate-800">{m.label}</span>
                  <span className={cn("inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-semibold border", m.color)}>
                    {m.badge}
                  </span>
                </div>
                <p className="text-xs text-slate-500">{m.desc}</p>
              </div>
            </label>
          ))}
        </div>
        <p className="text-xs text-slate-400">
          The selected model is used for all AI features: copilot, interview prep, shortlisting, match scoring, and more.
        </p>
      </section>

      {/* Anthropic key */}
      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <div>
          <h2 className="text-sm font-semibold text-slate-700 mb-1">Anthropic API Key</h2>
          <p className="text-xs text-slate-500">
            Supply your own Anthropic key to bill AI usage directly to your account. Leave empty to use the platform-managed key (subject to usage caps).
          </p>
        </div>

        <ApiKeyInput
          label="API Key"
          placeholder="sk-ant-api03-..."
          hasKey={settings?.hasAnthropicKey ?? false}
          onSave={saveAnthropicKey}
          onClear={clearAnthropicKey}
          saving={saving}
        />

        {/* Verify button */}
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={verify}
            disabled={verifying || saving}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            {verifying
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <RotateCcw className="h-3 w-3" />}
            Test connection
          </button>

          {verifyResult === "ok" && (
            <span className="flex items-center gap-1 text-xs text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Connected
            </span>
          )}
          {verifyResult === "fail" && (
            <span className="flex items-center gap-1 text-xs text-red-600">
              <AlertCircle className="h-3.5 w-3.5" />
              Connection failed
            </span>
          )}
        </div>
      </section>

      {/* OpenAI key */}
      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <div>
          <h2 className="text-sm font-semibold text-slate-700 mb-1">OpenAI API Key (Embeddings)</h2>
          <p className="text-xs text-slate-500">
            Optional. Used for candidate semantic search embeddings (<code className="text-[11px] bg-slate-100 px-1 rounded">text-embedding-3-small</code>). Leave empty to use the platform-managed key.
          </p>
        </div>

        <ApiKeyInput
          label="API Key"
          placeholder="sk-..."
          hasKey={settings?.hasOpenAIKey ?? false}
          onSave={saveOpenAIKey}
          onClear={clearOpenAIKey}
          saving={saving}
        />
      </section>

      {/* Last updated */}
      {settings?.updatedAt && (
        <p className="text-xs text-slate-400 text-center">
          Last updated {new Date(settings.updatedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}
