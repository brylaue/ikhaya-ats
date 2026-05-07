/**
 * POST /api/auth/extension/refresh
 * US-371: Extension OAuth — token refresh.
 *
 * The extension calls this before its access token expires.
 * Validates the refresh token, checks user_sessions revocation,
 * and returns a fresh access token.
 *
 * CORS: restricted to chrome-extension://<EXTENSION_ID>
 *
 * Body: { refresh_token: string }
 * Response 200: { access_token: string; expires_in: number }
 * Response 401: { error: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as svc }       from "@supabase/supabase-js";

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const EXTENSION_ID = process.env.CHROME_EXTENSION_ID ?? "";

function corsHeaders(origin: string | null): HeadersInit {
  const allowed = EXTENSION_ID ? `chrome-extension://${EXTENSION_ID}` : "*";
  return {
    "Access-Control-Allow-Origin":  origin === allowed || !EXTENSION_ID ? (origin ?? "*") : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age":       "86400",
  };
}

export async function OPTIONS(req: NextRequest) {
  return new Response(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const err = (msg: string, status = 401) =>
    NextResponse.json({ error: msg }, { status, headers: corsHeaders(origin) });

  const body = await req.json().catch(() => ({}));
  const { refresh_token } = body as { refresh_token?: string };

  if (!refresh_token) return err("refresh_token is required", 400);

  // Refresh via Supabase (anon client so we don't need a session cookie)
  const db = svc(supabaseUrl, supabaseAnon, { auth: { persistSession: false } });
  const { data: session, error: refreshError } = await db.auth.refreshSession({ refresh_token });

  if (refreshError || !session.session) {
    return err(refreshError?.message ?? "Refresh failed");
  }

  const user = session.session.user;

  // Check user_sessions revocation (mirrors validate endpoint)
  // Use service client to check directly
  const svcDb = svc(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: activeSessions } = await svcDb
    .from("user_sessions")
    .select("id")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .limit(1);

  if ((activeSessions?.length ?? 0) === 0) {
    return err("session_revoked");
  }

  return NextResponse.json(
    {
      access_token: session.session.access_token,
      expires_in:   session.session.expires_in,
    },
    { headers: corsHeaders(origin) }
  );
}
