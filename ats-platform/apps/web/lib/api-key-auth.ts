/**
 * lib/api-key-auth.ts (US-401 + US-084)
 * Validate a Bearer API key from the Authorization header.
 * Integrates rate limiting (US-084) — callers receive headers to forward.
 *
 * Usage in API routes:
 *   const result = await validateApiKey(req, ["candidates:read"]);
 *   if (!result) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 *   if (!result.rateLimit.allowed) {
 *     return NextResponse.json(
 *       { error: "rate_limit_exceeded", retryAfter: result.rateLimit.retryAfter },
 *       { status: 429, headers: result.rateLimitHeaders }
 *     );
 *   }
 *   return NextResponse.json(data, { headers: result.rateLimitHeaders });
 */

import { NextRequest }                                        from "next/server";
import { createClient as svc }                               from "@supabase/supabase-js";
import crypto                                                from "crypto";
import { checkApiKeyRateLimit, rateLimitHeaders, type ApiRateLimitResult } from "./rate-limit";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export interface ApiKeyContext {
  agencyId:         string;
  keyId:            string;
  scopes:           string[];
  rateLimit:        ApiRateLimitResult;
  rateLimitHeaders: Record<string, string>;
}

/**
 * Extract, validate, and rate-check a bearer API key.
 * Returns null on auth failure; returns context with rateLimit info always.
 * Callers must check rateLimit.allowed themselves.
 */
export async function validateApiKey(
  req: NextRequest,
  requiredScopes: string[] = []
): Promise<ApiKeyContext | null> {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ik_live_")) return null;

  const rawKey  = authHeader.slice("Bearer ".length);
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

  const db = svc(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  const { data: key } = await db
    .from("api_keys")
    .select("id, agency_id, scopes, expires_at, revoked_at")
    .eq("key_hash", keyHash)
    .is("revoked_at", null)
    .single();

  if (!key) return null;

  // Check expiry
  if (key.expires_at && new Date(key.expires_at) < new Date()) return null;

  // Check required scopes
  const keyScopes = new Set<string>(key.scopes ?? []);
  if (requiredScopes.some(s => !keyScopes.has(s))) return null;

  // Update last_used_at (fire-and-forget)
  db.from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", key.id)
    .then(() => {});

  // Rate limiting (US-084)
  const rl = checkApiKeyRateLimit(key.id, key.scopes ?? []);

  return {
    agencyId:         key.agency_id,
    keyId:            key.id,
    scopes:           key.scopes ?? [],
    rateLimit:        rl,
    rateLimitHeaders: rateLimitHeaders(rl),
  };
}
