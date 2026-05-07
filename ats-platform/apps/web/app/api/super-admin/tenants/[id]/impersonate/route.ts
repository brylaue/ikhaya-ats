/**
 * POST /api/super-admin/tenants/[id]/impersonate
 * US-458: Start an impersonation session for a specific tenant org.
 *
 * Sets a signed impersonation cookie so middleware can scope RLS to the
 * target agency. The super admin is redirected into the app as a viewer
 * of that org. The original session is preserved for one-click exit.
 *
 * Cookie structure: { agencyId, agencyName, superAdminEmail, exp }
 * Signed with SUPER_ADMIN_IMPERSONATE_SECRET (HMAC-SHA256).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createHmac } from "crypto";
import { checkCsrf } from "@/lib/csrf";

const SUPER_ADMIN_EMAILS = (process.env.SUPER_ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const SECRET = process.env.SUPER_ADMIN_IMPERSONATE_SECRET ?? "dev-secret-change-me";
const IMPERSONATE_COOKIE = "ats_impersonate";
const TTL_MS = 2 * 60 * 60 * 1000; // 2 hours max impersonation session

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("hex");
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email || !SUPER_ADMIN_EMAILS.includes(user.email.toLowerCase())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = createServiceClient();
  const { data: agency, error } = await db
    .from("agencies")
    .select("id, name")
    .eq("id", params.id)
    .single();

  if (error || !agency) {
    return NextResponse.json({ error: "Agency not found" }, { status: 404 });
  }

  const exp = Date.now() + TTL_MS;
  const payload = JSON.stringify({
    agencyId: agency.id,
    agencyName: agency.name,
    superAdminEmail: user.email,
    exp,
  });
  const sig = sign(payload);
  const cookieValue = `${Buffer.from(payload).toString("base64")}.${sig}`;

  // Write impersonation record to audit log
  await db.from("audit_log").insert({
    agency_id:     agency.id,
    user_id:       user.id,
    action:        "super_admin.impersonate_start",
    resource_type: "agency",
    resource_id:   agency.id,
    detail:        { superAdminEmail: user.email, agencyName: agency.name },
    performed_at:  new Date().toISOString(),
  });

  const response = NextResponse.json({ ok: true, agencyId: agency.id, agencyName: agency.name });
  response.cookies.set(IMPERSONATE_COOKIE, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: TTL_MS / 1000,
    path: "/",
  });
  return response;
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email || !SUPER_ADMIN_EMAILS.includes(user.email.toLowerCase())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Audit the exit
  const db = createServiceClient();
  await db.from("audit_log").insert({
    agency_id:     params.id,
    user_id:       user.id,
    action:        "super_admin.impersonate_end",
    resource_type: "agency",
    resource_id:   params.id,
    detail:        { superAdminEmail: user.email },
    performed_at:  new Date().toISOString(),
  });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(IMPERSONATE_COOKIE, "", { maxAge: 0, path: "/" });
  return response;
}
