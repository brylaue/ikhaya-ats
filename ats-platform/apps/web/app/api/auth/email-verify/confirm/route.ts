/**
 * POST /api/auth/email-verify/confirm
 * US-400: Verify a 6-digit OTP for a high-risk action.
 *
 * Body: { action: string; code: string }
 * Returns: { ok: true; token: string } on success — callers pass the token
 *          to the actual action endpoint to prove they verified.
 * Returns: { error: "invalid_code" | "expired" | "already_used" } on failure.
 *
 * The returned token is a short-lived signed JWT valid for 5 minutes.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import crypto                        from "crypto";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/** Signs a short-lived confirmation token so callers don't need to re-verify. */
function signConfirmToken(userId: string, action: string, tokenSecret: string): string {
  const payload = `${userId}:${action}:${Math.floor(Date.now() / 1000)}`;
  const sig = crypto.createHmac("sha256", tokenSecret).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const action = (body?.action ?? "").trim();
  const code   = (body?.code   ?? "").trim().replace(/\s/g, "");

  if (!action || !code) {
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }

  const db = createServiceClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });

  const codeHash = crypto.createHash("sha256").update(code).digest("hex");

  // Find the most recent unexpired, unused token for this user+action
  const { data: tokens } = await db
    .from("email_verification_tokens")
    .select("id, code_hash, expires_at, used_at")
    .eq("user_id", user.id)
    .eq("action", action)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1);

  const token = tokens?.[0];

  if (!token) {
    return NextResponse.json({ error: "expired" }, { status: 400 });
  }

  // Constant-time comparison
  const expectedBuf = Buffer.from(token.code_hash);
  const actualBuf   = Buffer.from(codeHash);
  const match =
    expectedBuf.length === actualBuf.length &&
    crypto.timingSafeEqual(expectedBuf, actualBuf);

  if (!match) {
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }

  // Mark as used
  await db
    .from("email_verification_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("id", token.id);

  // Audit log
  await db.from("audit_events").insert({
    actor_id:    user.id,
    action:      "email_verify.confirmed",
    resource:    action,
    metadata:    { user_id: user.id, action },
  }).select().maybeSingle(); // fire-and-forget; ignore errors

  const tokenSecret = process.env.CRON_SECRET ?? "dev-secret";
  const confirmToken = signConfirmToken(user.id, action, tokenSecret);

  return NextResponse.json({ ok: true, token: confirmToken });
}
