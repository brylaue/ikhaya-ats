/**
 * GET  /api/settings/ai-models  → current AI config (keys masked)
 * PATCH /api/settings/ai-models → upsert preferred model + optional BYO keys
 *
 * US-441: BYO AI Model Configuration.
 *
 * Anthropic / OpenAI keys are stored AES-256-GCM encrypted.
 * GET returns only whether a custom key is present — never the plaintext.
 * To clear a custom key, PATCH with { anthropicKey: null }.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@/lib/supabase/server";
import { getAgencyContext }           from "@/lib/supabase/agency-cache";
import { checkCsrf }                  from "@/lib/csrf";
import { encryptAiKey }               from "@/lib/ai/client";

const ALLOWED_MODELS = [
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
] as const;

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const ctx      = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("agency_ai_settings")
    .select("preferred_model, anthropic_key, openai_key, updated_at")
    .eq("agency_id", ctx.agencyId)
    .single();

  return NextResponse.json({
    preferredModel:  data?.preferred_model  ?? "claude-sonnet-4-6",
    hasAnthropicKey: !!data?.anthropic_key,
    hasOpenAIKey:    !!data?.openai_key,
    updatedAt:       data?.updated_at ?? null,
  });
}

// ─── PATCH ────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const ctx      = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as {
    preferredModel?: string;
    anthropicKey?:   string | null;  // null = clear
    openaiKey?:      string | null;
  };

  const update: Record<string, unknown> = {
    agency_id:  ctx.agencyId,
    updated_at: new Date().toISOString(),
    updated_by: ctx.userId,
  };

  if (body.preferredModel !== undefined) {
    if (!ALLOWED_MODELS.includes(body.preferredModel as typeof ALLOWED_MODELS[number])) {
      return NextResponse.json({ error: "Invalid model" }, { status: 400 });
    }
    update.preferred_model = body.preferredModel;
  }

  if (body.anthropicKey !== undefined) {
    if (body.anthropicKey === null || body.anthropicKey === "") {
      update.anthropic_key = null;
    } else {
      // Validate it looks like an Anthropic key before storing
      const trimmed = body.anthropicKey.trim();
      if (!trimmed.startsWith("sk-ant-")) {
        return NextResponse.json({ error: "Anthropic key must start with sk-ant-" }, { status: 400 });
      }
      try {
        update.anthropic_key = encryptAiKey(trimmed);
      } catch {
        return NextResponse.json({ error: "Key encryption failed — check AI_KEY_ENCRYPTION_KEY" }, { status: 500 });
      }
    }
  }

  if (body.openaiKey !== undefined) {
    if (body.openaiKey === null || body.openaiKey === "") {
      update.openai_key = null;
    } else {
      const trimmed = body.openaiKey.trim();
      if (!trimmed.startsWith("sk-")) {
        return NextResponse.json({ error: "OpenAI key must start with sk-" }, { status: 400 });
      }
      try {
        update.openai_key = encryptAiKey(trimmed);
      } catch {
        return NextResponse.json({ error: "Key encryption failed — check AI_KEY_ENCRYPTION_KEY" }, { status: 500 });
      }
    }
  }

  const { error } = await supabase
    .from("agency_ai_settings")
    .upsert(update, { onConflict: "agency_id" });

  if (error) {
    console.error("[ai-models] upsert error", error);
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
