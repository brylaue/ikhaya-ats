/**
 * CSRF protection helpers.
 *
 * US-320: portal scorecard POST had no anti-CSRF protection.
 * US-326: state-changing API endpoints need consistent Content-Type enforcement.
 *
 * Strategy:
 *  1. Require Content-Type: application/json — prevents cross-origin simple-form attacks
 *     because browsers cannot send JSON with CORS credentials without a preflight.
 *  2. Origin header validation for browser-initiated requests — reject requests whose
 *     Origin does not match the configured app URL.
 *
 * Routes using Authorization: Bearer <token> are inherently CSRF-safe and don't need
 * this guard. Apply only to:
 *  - Public endpoints that accept state changes (e.g. portal scorecard)
 *  - Authenticated endpoints using Supabase session cookies
 */

import type { NextRequest } from "next/server";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL ?? "";

/**
 * Returns an error response if the request fails CSRF checks, or null if it passes.
 *
 * Usage:
 *   const csrfError = checkCsrf(req);
 *   if (csrfError) return csrfError;
 */
export function checkCsrf(req: NextRequest): Response | null {
  // 1. Content-Type must be application/json when the request has a body.
  //    Bodyless DELETE/PATCH (e.g. ?provider=google toggles) don't need
  //    a Content-Type — the Origin guard below is what stops them.
  const method = req.method?.toUpperCase();
  if (method && ["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const len = req.headers.get("content-length");
    const hasBody = len !== null && len !== "0";
    if (hasBody) {
      const ct = req.headers.get("content-type") ?? "";
      if (!ct.includes("application/json")) {
        return new Response(
          JSON.stringify({ error: "Content-Type must be application/json" }),
          { status: 415, headers: { "Content-Type": "application/json" } }
        );
      }
    }
  }

  // 2. Origin check — only applies when browser sends an Origin header.
  //    Server-to-server calls (cron, webhooks) won't have Origin.
  const origin = req.headers.get("origin");
  if (origin && APP_URL) {
    const allowedOrigin = APP_URL.replace(/\/$/, "");
    const requestOrigin = origin.replace(/\/$/, "");
    if (requestOrigin !== allowedOrigin) {
      return new Response(
        JSON.stringify({ error: "Cross-origin request rejected" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  return null;
}
