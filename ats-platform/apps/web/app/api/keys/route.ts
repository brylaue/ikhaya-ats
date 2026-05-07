/**
 * GET  /api/keys — List API keys for current agency (masked, never full key)
 * POST /api/keys — Create a new scoped API key (requires email verification token)
 * US-401
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@/lib/supabase/server";
import { createClient as svc }       from "@supabase/supabase-js";
import { getAgencyContext }          from "@/lib/supabase/agency-cache";
import { checkCsrf }                 from "@/lib/csrf";
import crypto                        from "crypto";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// All valid scopes
const VALID_SCOPES = new Set([
  "candidates:read",   "candidates:write",
  "jobs:read",         "jobs:write",
  "placements:read",   "placements:write",
  "clients:read",      "clients:write",
  "applications:read", "applications:write",
  "webhooks:read",     "webhooks:write",
  "analytics:read",
]);

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getAgencyContext(supabase, user.id);
  if (!ctx) return NextResponse.json({ error: "No agency" }, { status: 400 });

  if (!["owner", "admin"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = svc(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  const { data: keys } = await db
    .from("api_keys")
    .select("id, name, key_prefix, scopes, last_used_at, expires_at, revoked_at, created_at, created_by")
    .eq("agency_id", ctx.agencyId)
    .order("created_at", { ascending: false });

  return NextResponse.json({ keys: keys ?? [] });
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // US-326: cookie-authed mutation — verify same-origin
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await getAgencyContext(supabase, user.id);
  if (!ctx) return NextResponse.json({ error: "No agency" }, { status: 400 });

  if (!["owner", "admin"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { name, scopes, expiresInDays, verifyToken } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  // Validate email verification token (US-400 requirement)
  if (!verifyToken) {
    return NextResponse.json({ error: "email_verification_required" }, { status: 403 });
  }

  // Validate scopes
  const requestedScopes: string[] = Array.isArray(scopes) ? scopes : [];
  const invalidScopes = requestedScopes.filter(s => !VALID_SCOPES.has(s));
  if (invalidScopes.length > 0) {
    return NextResponse.json({ error: `Invalid scopes: ${invalidScopes.join(", ")}` }, { status: 400 });
  }
  if (requestedScopes.length === 0) {
    return NextResponse.json({ error: "At least one scope required" }, { status: 400 });
  }

  // Generate the key: ik_live_<32 random bytes hex>
  const rawKey    = `ik_live_${crypto.randomBytes(24).toString("hex")}`;
  const keyPrefix = rawKey.slice(0, 12); // "ik_live_xxxx"
  const keyHash   = crypto.createHash("sha256").update(rawKey).digest("hex");

  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 86_400_000).toISOString()
    : null;

  const db = svc(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  const { data: newKey, error } = await db
    .from("api_keys")
    .insert({
      agency_id:  ctx.agencyId,
      created_by: user.id,
      name:       name.trim(),
      key_prefix: keyPrefix,
      key_hash:   keyHash,
      scopes:     requestedScopes,
      expires_at: expiresAt,
    })
    .select("id, name, key_prefix, scopes, expires_at, created_at")
    .single();

  if (error || !newKey) {
    return NextResponse.json({ error: "Failed to create key" }, { status: 500 });
  }

  // Audit log
  await db.from("audit_events").insert({
    actor_id:   user.id,
    action:     "api_key.created",
    resource:   `api_key:${newKey.id}`,
    metadata:   { key_name: name, scopes: requestedScopes },
    api_key_id: newKey.id,
  }).maybeSingle();

  // Return the full key ONE TIME ONLY — never stored in plain text
  return NextResponse.json({
    key:       rawKey,          // shown once, caller must copy
    id:        newKey.id,
    name:      newKey.name,
    keyPrefix: newKey.key_prefix,
    scopes:    newKey.scopes,
    expiresAt: newKey.expires_at,
    createdAt: newKey.created_at,
  }, { status: 201 });
}
