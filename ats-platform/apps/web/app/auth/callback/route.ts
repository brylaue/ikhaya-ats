import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /auth/callback
 *
 * Supabase redirects here after Google OAuth completes.
 * Exchanges the one-time `code` param for a session cookie,
 * then redirects the user into the dashboard.
 */
/**
 * US-329: validate `next` param to prevent open redirect.
 * Allow only same-origin app paths: must start with `/`, cannot start with
 * `//` or `/\` (protocol-relative), and must not contain `://`.
 */
function safeRedirectPath(raw: string | null, fallback = "/candidates"): string {
  if (!raw) return fallback;
  const v = raw.trim();
  if (!v.startsWith("/")) return fallback;
  if (v.startsWith("//") || v.startsWith("/\\")) return fallback;
  if (v.includes("://")) return fallback;
  // Optional: restrict to a handful of app roots for extra safety
  const ALLOWED_ROOTS = ["/candidates", "/jobs", "/dashboard", "/pipeline", "/clients", "/placements", "/analytics", "/settings", "/reports", "/outreach", "/interviews", "/onboarding", "/integrations", "/sourcing", "/bd", "/help", "/welcome"];
  const root = "/" + v.slice(1).split(/[/?#]/)[0];
  if (!ALLOWED_ROOTS.includes(root)) return fallback;
  return v;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code  = searchParams.get("code");
  const next  = safeRedirectPath(searchParams.get("next"));
  const error = searchParams.get("error");

  // OAuth provider returned an error
  if (error) {
    console.error("[auth/callback] OAuth error:", error, searchParams.get("error_description"));
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error)}`);
  }

  if (code) {
    const supabase = await createClient();
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (!exchangeError) {
      // Redirect to the intended destination (default: /candidates)
      return NextResponse.redirect(`${origin}${next}`);
    }

    console.error("[auth/callback] Exchange error:", exchangeError.message);
  }

  // Something went wrong — send back to login
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
