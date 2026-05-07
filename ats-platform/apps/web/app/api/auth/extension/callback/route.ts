/**
 * GET /api/auth/extension/callback
 * US-371: Extension OAuth popup — code exchange.
 *
 * Supabase redirects here after the user completes Google OAuth.
 * Validates state + PKCE, exchanges the code for tokens, and
 * returns them as JSON so the extension popup can read them.
 *
 * On success: renders an HTML page that posts tokens to the
 * extension opener window and auto-closes.
 *
 * Response: HTML page (self-closing popup)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@/lib/supabase/server";

const STATE_COOKIE = "__ext_pkce";
const STATE_MAX_AGE_MS = 600_000; // 10 min

export async function GET(req: NextRequest) {
  const url   = new URL(req.url);
  const code  = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return renderResult(false, null, `OAuth error: ${error}`);
  }

  if (!code || !state) {
    return renderResult(false, null, "Missing code or state");
  }

  // Validate state from cookie
  const cookieRaw = req.cookies.get(STATE_COOKIE)?.value;
  if (!cookieRaw) {
    return renderResult(false, null, "PKCE cookie missing or expired");
  }

  let pkce: { verifier: string; state: string; issuedAt: number };
  try { pkce = JSON.parse(cookieRaw); } catch {
    return renderResult(false, null, "Invalid PKCE cookie");
  }

  if (pkce.state !== state) {
    return renderResult(false, null, "State mismatch — possible CSRF");
  }
  if (Date.now() - pkce.issuedAt > STATE_MAX_AGE_MS) {
    return renderResult(false, null, "PKCE expired — please try again");
  }

  // Exchange code for session
  const supabase = await createClient();
  const { data: session, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError || !session.session) {
    return renderResult(false, null, exchangeError?.message ?? "Token exchange failed");
  }

  const tokens = {
    access_token:  session.session.access_token,
    refresh_token: session.session.refresh_token,
    expires_in:    session.session.expires_in,
    user_email:    session.session.user.email ?? "",
  };

  // Clear PKCE cookie
  const res = renderResult(true, tokens, null);
  res.cookies.set(STATE_COOKIE, "", { maxAge: 0, path: "/api/auth/extension" });
  return res;
}

function renderResult(
  success: boolean,
  tokens: { access_token: string; refresh_token: string; expires_in: number; user_email: string } | null,
  errorMsg: string | null,
): NextResponse {
  const payload = success
    ? `{ "ok": true, "access_token": ${JSON.stringify(tokens!.access_token)}, "refresh_token": ${JSON.stringify(tokens!.refresh_token)}, "expires_in": ${tokens!.expires_in}, "user_email": ${JSON.stringify(tokens!.user_email)} }`
    : `{ "ok": false, "error": ${JSON.stringify(errorMsg)} }`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self' 'unsafe-inline';" />
  <title>ATS — Extension Auth</title>
  <style>body{font-family:system-ui;text-align:center;padding:40px;color:#374151;}</style>
</head>
<body>
  <p>${success ? "✓ Connected! This window will close automatically." : `⚠ ${errorMsg ?? "Unknown error"}`}</p>
  <script>
    (function() {
      var payload = ${payload};
      if (window.opener) {
        window.opener.postMessage(payload, '*');
      }
      ${success ? "setTimeout(function(){ window.close(); }, 800);" : ""}
    })();
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    status:  200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
