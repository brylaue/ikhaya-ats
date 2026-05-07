/**
 * lib/ai/client.ts
 * Anthropic Claude client for server-side generation.
 *
 * Two call styles:
 *
 *   callClaude(systemPrompt, messages, maxTokens?, context?)
 *     → Legacy single-message API used by older endpoints.
 *
 *   getAIClient({ agencyId, userId })
 *     → Returns an Anthropic-SDK-compatible proxy that checks for a
 *       BYO agency API key (US-441) before falling back to the platform
 *       ANTHROPIC_API_KEY. Preferred model is also read from agency settings.
 *       Usage is recorded via the cost tracker either way.
 *
 * Uses fetch directly (no SDK dependency) to keep the bundle clean.
 */
import {
  AiRateLimitError,
  AiMalformedOutputError,
  checkAgencyLimit,
  recordUsage,
} from "./cost-tracker";
import { createServiceClient } from "@/lib/supabase/service";
import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

// ─── Constants ────────────────────────────────────────────────────────────────

const ANTHROPIC_API_URL   = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL       = "claude-sonnet-4-6";
const DEFAULT_MAX_TOKENS  = 1024;

// ─── Encryption helpers for BYO keys (AES-256-GCM) ───────────────────────────
// Same scheme as lib/email/encryption.ts — uses AI_KEY_ENCRYPTION_KEY env var.

const ALGORITHM  = "aes-256-gcm";
const IV_LEN     = 12;
const TAG_LEN    = 16;

function getEncryptionKey(): Buffer {
  const raw = process.env.AI_KEY_ENCRYPTION_KEY;
  if (!raw) throw new Error("Missing AI_KEY_ENCRYPTION_KEY — set a 32-byte base64 value in .env.local");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error(`AI_KEY_ENCRYPTION_KEY must decode to 32 bytes (got ${buf.length})`);
  return buf;
}

export function encryptAiKey(plaintext: string): string {
  const key = getEncryptionKey();
  const iv  = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptAiKey(wrapped: string): string {
  const key    = getEncryptionKey();
  const packed = Buffer.from(wrapped, "base64");
  if (packed.length < IV_LEN + TAG_LEN) throw new Error("Encrypted AI key payload too short");
  const iv         = packed.subarray(0, IV_LEN);
  const tag        = packed.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = packed.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ClaudeMessage {
  role:    "user" | "assistant";
  content: string;
}

export interface ClaudeResponse {
  content: Array<{ type: string; text: string }>;
  usage:   { input_tokens: number; output_tokens: number };
}

export interface ClaudeCallContext {
  agencyId?:  string | null;
  userId?:    string | null;
  operation?: string;
}

export { AiRateLimitError, AiMalformedOutputError };

// ─── Agency settings resolver ─────────────────────────────────────────────────

interface AgencyAiSettings {
  preferredModel: string;
  anthropicKey:   string | null; // plaintext after decryption
}

/** Read & decrypt agency AI settings. Returns defaults if none configured. */
async function resolveAgencySettings(agencyId: string | null | undefined): Promise<AgencyAiSettings> {
  if (!agencyId) {
    return { preferredModel: DEFAULT_MODEL, anthropicKey: null };
  }

  try {
    const db = createServiceClient();
    const { data } = await db
      .from("agency_ai_settings")
      .select("preferred_model, anthropic_key")
      .eq("agency_id", agencyId)
      .single();

    if (!data) return { preferredModel: DEFAULT_MODEL, anthropicKey: null };

    const anthropicKey = data.anthropic_key
      ? (() => { try { return decryptAiKey(data.anthropic_key); } catch { return null; } })()
      : null;

    return {
      preferredModel: data.preferred_model ?? DEFAULT_MODEL,
      anthropicKey,
    };
  } catch {
    return { preferredModel: DEFAULT_MODEL, anthropicKey: null };
  }
}

// ─── Core fetch helper ────────────────────────────────────────────────────────

async function invokeAnthropic({
  apiKey,
  model,
  maxTokens,
  system,
  messages,
}: {
  apiKey:    string;
  model:     string;
  maxTokens: number;
  system?:   string;
  messages:  ClaudeMessage[];
}): Promise<ClaudeResponse> {
  const body: Record<string, unknown> = { model, max_tokens: maxTokens, messages };
  if (system) body.system = system;

  const res = await fetch(ANTHROPIC_API_URL, {
    method:  "POST",
    headers: {
      "Content-Type":      "application/json",
      "x-api-key":         apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error ${res.status}: ${err}`);
  }

  return res.json();
}

// ─── callClaude — legacy single-call API ─────────────────────────────────────

/**
 * Call the Claude API with a system prompt + messages.
 * Returns the assistant text or throws on error.
 *
 * When `context.agencyId` is provided, the agency's daily spend is checked
 * first — an AiRateLimitError is thrown if the cap has been reached.
 * Uses the agency's BYO key + preferred model if configured (US-441).
 */
export async function callClaude(
  systemPrompt: string,
  messages:     ClaudeMessage[],
  maxTokens:    number = DEFAULT_MAX_TOKENS,
  context:      ClaudeCallContext = {}
): Promise<string> {
  await checkAgencyLimit(context.agencyId);

  const { preferredModel, anthropicKey } = await resolveAgencySettings(context.agencyId);
  const apiKey = anthropicKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const model   = preferredModel;
  const started = Date.now();
  let   errMsg: string | undefined;
  let   inputTokens  = 0;
  let   outputTokens = 0;

  try {
    const data = await invokeAnthropic({ apiKey, model, maxTokens, system: systemPrompt, messages });
    inputTokens  = data.usage?.input_tokens  ?? 0;
    outputTokens = data.usage?.output_tokens ?? 0;

    const textBlock = data.content.find(b => b.type === "text");
    if (!textBlock) {
      errMsg = "No text in Claude response";
      throw new Error(errMsg);
    }
    return textBlock.text;
  } catch (err) {
    errMsg = errMsg ?? (err instanceof Error ? err.message : String(err));
    throw err;
  } finally {
    void recordUsage({
      agencyId:     context.agencyId ?? null,
      userId:       context.userId   ?? null,
      provider:     "anthropic",
      model,
      operation:    context.operation ?? "claude_call",
      inputTokens,
      outputTokens,
      latencyMs:    Date.now() - started,
      error:        errMsg ?? null,
    });
  }
}

// ─── getAIClient — SDK-compatible proxy (US-441) ──────────────────────────────

export interface AiClientMessagesCreateParams {
  model:      string;
  max_tokens: number;
  messages:   ClaudeMessage[];
  system?:    string;
}

export interface AiClient {
  messages: {
    create(params: AiClientMessagesCreateParams): Promise<ClaudeResponse>;
  };
}

/**
 * Returns an Anthropic-SDK-compatible proxy client.
 * The returned `.messages.create()` method:
 *   1. Checks the agency's daily AI spend cap
 *   2. Uses the agency's BYO Anthropic API key if set, else platform key
 *   3. Overrides `model` with the agency's preferred model if set
 *   4. Records usage to ai_usage_events after the call
 *
 * US-441: BYO AI Model Configuration.
 */
export function getAIClient(context: ClaudeCallContext = {}): AiClient {
  return {
    messages: {
      async create(params: AiClientMessagesCreateParams): Promise<ClaudeResponse> {
        await checkAgencyLimit(context.agencyId);

        const { preferredModel, anthropicKey } = await resolveAgencySettings(context.agencyId);
        const apiKey = anthropicKey ?? process.env.ANTHROPIC_API_KEY;
        if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

        // Agency preferred model takes precedence only when the caller used the
        // default platform model. Callers that explicitly choose a model (e.g.
        // interview-prep using opus for quality) keep their choice.
        const model = params.model !== DEFAULT_MODEL ? params.model : preferredModel;

        const started = Date.now();
        let   errMsg: string | undefined;
        let   inputTokens  = 0;
        let   outputTokens = 0;

        try {
          const data = await invokeAnthropic({
            apiKey,
            model,
            maxTokens: params.max_tokens,
            system:    params.system,
            messages:  params.messages,
          });
          inputTokens  = data.usage?.input_tokens  ?? 0;
          outputTokens = data.usage?.output_tokens ?? 0;
          return data;
        } catch (err) {
          errMsg = err instanceof Error ? err.message : String(err);
          throw err;
        } finally {
          void recordUsage({
            agencyId:     context.agencyId ?? null,
            userId:       context.userId   ?? null,
            provider:     "anthropic",
            model,
            operation:    context.operation ?? "ai_client_call",
            inputTokens,
            outputTokens,
            latencyMs:    Date.now() - started,
            error:        errMsg ?? null,
          });
        }
      },
    },
  };
}
