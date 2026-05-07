/**
 * Embedding service
 *
 * Production: calls OpenAI text-embedding-3-small (1536-dim)
 * Dev/prototype: falls back to a deterministic keyword-scoring vector
 * so search works without an API key.
 *
 * US-377: when an EmbedContext carrying an agencyId is supplied, the call
 * is gated by the shared AI cost limiter (see lib/ai/cost-tracker.ts) and
 * per-call usage is recorded in ai_usage_events. Agency-less callers are
 * unaffected — they still land in the log as platform-level usage.
 */
import {
  AiRateLimitError,
  checkAgencyLimit,
  recordUsage,
} from "@/lib/ai/cost-tracker";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIM   = 1536;

export { AiRateLimitError };

export interface EmbedContext {
  agencyId?:  string | null;
  userId?:    string | null;
  operation?: string;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type Embedding = number[];

export interface EmbeddingResult {
  embedding: Embedding;
  mode: "openai" | "keyword";
  cached: boolean;
}

// ─── In-memory cache (LRU-ish, max 256 entries) ──────────────────────────────

interface CacheEntry { embedding: Embedding; mode: "openai" | "keyword" }
const cache = new Map<string, CacheEntry>();
const MAX_CACHE = 256;

function cacheGet(key: string): CacheEntry | undefined {
  return cache.get(key);
}

function cacheSet(key: string, entry: CacheEntry): void {
  if (cache.size >= MAX_CACHE) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  cache.set(key, entry);
}

// ─── OpenAI embedding ─────────────────────────────────────────────────────────

async function openAIEmbed(
  text: string,
  ctx:  EmbedContext
): Promise<Embedding> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const started = Date.now();
  let   errMsg: string | undefined;
  let   tokens = 0;

  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
    });

    if (!res.ok) {
      const err = await res.text();
      errMsg = `OpenAI embedding error ${res.status}: ${err}`;
      throw new Error(errMsg);
    }

    const data = await res.json();
    tokens = data.usage?.prompt_tokens ?? 0;
    return data.data[0].embedding as Embedding;
  } catch (err) {
    errMsg = errMsg ?? (err instanceof Error ? err.message : String(err));
    throw err;
  } finally {
    void recordUsage({
      agencyId:     ctx.agencyId ?? null,
      userId:       ctx.userId ?? null,
      provider:     "openai",
      model:        EMBEDDING_MODEL,
      operation:    ctx.operation ?? "embed",
      inputTokens:  tokens,
      outputTokens: 0,
      latencyMs:    Date.now() - started,
      error:        errMsg ?? null,
    });
  }
}

// ─── Keyword fallback embedding ───────────────────────────────────────────────
//
// Creates a deterministic pseudo-embedding from token frequency so that
// semantically similar strings produce similar vectors without an API key.
// Not true semantic search, but good enough for prototype demos.

const VOCAB_SIZE = EMBEDDING_DIM;

function hashToken(token: string): number {
  let h = 2166136261;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h % VOCAB_SIZE;
}

function keywordEmbed(text: string): Embedding {
  const vec = new Array<number>(EMBEDDING_DIM).fill(0);
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  // Unigrams
  for (const tok of tokens) {
    vec[hashToken(tok)] += 1;
  }

  // Bigrams (captures phrase meaning like "machine learning", "vice president")
  for (let i = 0; i < tokens.length - 1; i++) {
    vec[hashToken(tokens[i] + "_" + tokens[i + 1])] += 1.5;
  }

  // L2 normalise so cosine similarity works
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

// ─── Cosine similarity ────────────────────────────────────────────────────────

export function cosineSimilarity(a: Embedding, b: Embedding): number {
  if (a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate an embedding for `text`.
 * Uses OpenAI when OPENAI_API_KEY is present, falls back to keyword hashing.
 *
 * Pass `ctx.agencyId` to enforce per-agency daily cost limits (US-377).
 * If the agency has hit its cap the call throws AiRateLimitError — the
 * caller should surface 429 and NOT silently fall back to the keyword
 * embedder (that would defeat the cap).
 */
export async function embed(
  text: string,
  ctx:  EmbedContext = {}
): Promise<EmbeddingResult> {
  const key = text.slice(0, 512); // normalise cache key length

  const cached = cacheGet(key);
  if (cached) {
    // Return cached result preserving the original mode (openai or keyword)
    return { embedding: cached.embedding, mode: cached.mode, cached: true };
  }

  if (process.env.OPENAI_API_KEY) {
    // Rate-limit check runs BEFORE the API call so we fail fast when over
    // the cap. AiRateLimitError propagates to the caller (intentional —
    // we do not want to silently downgrade to keyword mode when over cap).
    await checkAgencyLimit(ctx.agencyId);
    try {
      const embedding = await openAIEmbed(text, ctx);
      cacheSet(key, { embedding, mode: "openai" });
      return { embedding, mode: "openai", cached: false };
    } catch (err) {
      if (err instanceof AiRateLimitError) throw err;
      console.warn("[embeddings] OpenAI failed, falling back to keyword:", err);
    }
  }

  const embedding = keywordEmbed(text);
  cacheSet(key, { embedding, mode: "keyword" });
  return { embedding, mode: "keyword", cached: false };
}

/**
 * Build the text to embed for a candidate record.
 * location can be a string or { city, state, country } object.
 */
export function candidateSearchText(c: {
  fullName?: string;
  currentTitle?: string | null;
  currentCompany?: string | null;
  skills?: Array<{ skill?: { name: string } }>;
  location?: string | { city?: string; state?: string; country?: string } | null;
  summary?: string | null;
}): string {
  const locationStr =
    !c.location
      ? ""
      : typeof c.location === "string"
      ? c.location
      : [c.location.city, c.location.state, c.location.country]
          .filter(Boolean)
          .join(", ");

  const parts = [
    c.fullName,
    c.currentTitle,
    c.currentCompany,
    locationStr || undefined,
    c.summary,
    ...(c.skills ?? []).map((s) => s.skill?.name).filter(Boolean),
  ];
  return parts.filter(Boolean).join(" ");
}

/**
 * Build the text to embed for a job record.
 */
export function jobSearchText(j: {
  title?: string;
  clientName?: string | null;
  location?: string | null;
  description?: string | null;
  requirements?: string | null;
}): string {
  return [j.title, j.clientName, j.location, j.description, j.requirements]
    .filter(Boolean)
    .join(" ");
}

/**
 * Build the text to embed for a client record.
 */
export function clientSearchText(c: {
  name?: string;
  industry?: string | null;
  notes?: string | null;
}): string {
  return [c.name, c.industry, c.notes].filter(Boolean).join(" ");
}
