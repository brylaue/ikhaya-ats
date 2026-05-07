/**
 * lib/ai/cost-tracker.ts
 * US-377: OpenAI / Claude API cost monitoring + per-agency rate limits.
 *
 * Two entry points:
 *
 *   checkAgencyLimit(agencyId) →
 *     Reads ai_usage_daily and throws AiRateLimitError if this agency has
 *     exceeded the configured daily cost cap. Call this BEFORE hitting the
 *     LLM/embedding API so we fail fast with a clean 429-equivalent.
 *
 *   recordUsage({ agencyId, provider, model, operation, inputTokens, ... }) →
 *     Fire-and-forget insert into ai_usage_events. The DB trigger installed
 *     in migration 049 rolls this up into ai_usage_daily automatically.
 *     Tracking failure MUST NOT fail the caller's request — the whole
 *     function swallows errors and only console.errors them.
 *
 * Cost tables live in this file because provider prices change far more
 * often than the schema; updating a number here is a single deploy instead
 * of a migration.
 */
import { createServiceClient } from "@/lib/supabase/service";

// ─── Pricing ($ / 1K tokens) ──────────────────────────────────────────────
// Keep in sync with https://www.anthropic.com/pricing and
// https://platform.openai.com/pricing. Add new models here before use.
// Values are USD per 1,000 tokens.
const PRICING: Record<string, { input: number; output: number }> = {
  // Anthropic
  "claude-sonnet-4-6":         { input: 0.003,  output: 0.015 },
  "claude-opus-4-6":           { input: 0.015,  output: 0.075 },
  "claude-haiku-4-5-20251001": { input: 0.0008, output: 0.004 },
  // OpenAI
  "text-embedding-3-small":    { input: 0.00002, output: 0 },
  "text-embedding-3-large":    { input: 0.00013, output: 0 },
};

// Default daily cap: $5 / agency / day. Override via env.
const DEFAULT_DAILY_USD =
  Number(process.env.AI_DAILY_COST_USD_LIMIT) || 5;

// Optional per-agency overrides: JSON env AI_PER_AGENCY_DAILY_USD=
// `{"agency-uuid": 50, "other-uuid": 100}`
function getDailyCap(agencyId: string): number {
  const raw = process.env.AI_PER_AGENCY_DAILY_USD;
  if (!raw) return DEFAULT_DAILY_USD;
  try {
    const map = JSON.parse(raw) as Record<string, number>;
    return typeof map[agencyId] === "number" ? map[agencyId] : DEFAULT_DAILY_USD;
  } catch {
    return DEFAULT_DAILY_USD;
  }
}

export class AiRateLimitError extends Error {
  constructor(
    public readonly agencyId: string,
    public readonly usedUsd: number,
    public readonly capUsd: number
  ) {
    super(
      `AI daily cap reached for agency ${agencyId}: $${usedUsd.toFixed(4)} / $${capUsd.toFixed(2)}`
    );
    this.name = "AiRateLimitError";
  }
}

/**
 * US-504: thrown when an AI response cannot be parsed as the expected
 * structured shape. Route handlers should translate this to HTTP 502 so
 * the UI can show a "try again" message instead of leaking an internal
 * SyntaxError stack.
 */
export class AiMalformedOutputError extends Error {
  constructor(public readonly operation: string) {
    super(`AI returned malformed output for operation "${operation}"`);
    this.name = "AiMalformedOutputError";
  }
}

export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const p = PRICING[model];
  if (!p) return 0;
  return (inputTokens * p.input + outputTokens * p.output) / 1000;
}

/**
 * Check today's running cost for an agency and throw AiRateLimitError if the
 * cap is exceeded. Called BEFORE invoking the provider API.
 *
 * Agency-less calls (agencyId null) skip the check — they still get
 * recorded so platform-wide dashboards stay complete.
 */
export async function checkAgencyLimit(
  agencyId: string | null | undefined
): Promise<void> {
  if (!agencyId) return;

  const db = createServiceClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await db
    .from("ai_usage_daily")
    .select("total_cost_usd")
    .eq("agency_id", agencyId)
    .eq("day", today);

  if (error) {
    // US-509: honour AI_COST_TRACKER_FAIL_CLOSED=1 to block customer AI
    // calls when the observability table is unreachable. Default remains
    // fail-open so a transient DB hiccup doesn't degrade UX, but operators
    // can flip the env var during budget-enforcement windows to make sure
    // we never spend beyond the cap because of a read failure.
    console.error("[cost-tracker] checkAgencyLimit read failed:", error);
    if (process.env.AI_COST_TRACKER_FAIL_CLOSED === "1") {
      throw new AiRateLimitError(agencyId, 0, getDailyCap(agencyId));
    }
    return;
  }

  const usedUsd = (data ?? []).reduce(
    (sum, row: { total_cost_usd: number | string }) =>
      sum + Number(row.total_cost_usd ?? 0),
    0
  );
  const capUsd = getDailyCap(agencyId);
  if (usedUsd >= capUsd) {
    throw new AiRateLimitError(agencyId, usedUsd, capUsd);
  }
}

export interface RecordUsageInput {
  agencyId:       string | null | undefined;
  userId?:        string | null;
  provider:       "anthropic" | "openai";
  model:          string;
  operation:      string;
  inputTokens:    number;
  outputTokens:   number;
  latencyMs?:     number;
  error?:         string | null;
}

/**
 * Insert a row into ai_usage_events. DB trigger rolls into ai_usage_daily.
 * Fire-and-forget — this function never throws. Callers can `await` to keep
 * the event ordering deterministic in tests, but are not required to.
 */
export async function recordUsage(input: RecordUsageInput): Promise<void> {
  try {
    const db = createServiceClient();
    const estimated_cost_usd = estimateCost(
      input.model,
      input.inputTokens,
      input.outputTokens
    );
    await db.from("ai_usage_events").insert({
      agency_id:          input.agencyId ?? null,
      user_id:            input.userId ?? null,
      provider:           input.provider,
      model:              input.model,
      operation:          input.operation,
      input_tokens:       input.inputTokens,
      output_tokens:      input.outputTokens,
      estimated_cost_usd,
      latency_ms:         input.latencyMs ?? null,
      error:              input.error ?? null,
    });
  } catch (err) {
    console.error("[cost-tracker] recordUsage failed (swallowed):", err);
  }
}
