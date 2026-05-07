/**
 * POST /api/unsubscribe/[token]
 * US-473: RFC 8058 one-click unsubscribe.
 *
 * Triggered by the `List-Unsubscribe-Post: List-Unsubscribe=One-Click` header.
 * Some mailbox providers (Gmail, Apple Mail, Fastmail) POST here with an empty
 * body when the user clicks "Unsubscribe" in the client chrome. They expect
 * a 2xx response — body content is ignored.
 *
 * CSRF is NOT checked here on purpose. The URL itself is the token, and the
 * spec requires cross-origin POST to succeed.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyUnsubscribeToken } from "@/lib/email/unsubscribe";
import { addSuppression }          from "@/lib/email/suppression";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const payload = verifyUnsubscribeToken(decodeURIComponent(token));
  if (!payload) {
    // Invalid tokens → return 200 to avoid leaking signal, per RFC 8058 guidance.
    return NextResponse.json({ ok: true });
  }

  try {
    await addSuppression({
      agencyId:  payload.agencyId,
      email:     payload.email,
      reason:    "list_unsubscribe_post",
      messageId: payload.messageId,
      source:    "list_unsubscribe_header",
    });
  } catch (err) {
    console.error("[unsubscribe/POST] suppression write failed", err);
    // Still 200 — the spec says failure should be transparent.
  }

  return NextResponse.json({ ok: true });
}

// Some clients (Yahoo, older MTAs) still GET the List-Unsubscribe URL instead
// of POSTing. Support it here so we don't leave them stranded.
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> }
) {
  return POST(req, ctx);
}
