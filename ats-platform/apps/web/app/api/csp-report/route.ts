/**
 * POST /api/csp-report
 * US-364: Receives Content-Security-Policy violation reports from browsers.
 *
 * Browsers POST here when a CSP directive is violated. In production, forward
 * to your error tracking service (Sentry, Datadog, etc.). For now we log to
 * console so violations surface in Vercel function logs.
 */

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const report = body["csp-report"] ?? body;
    console.warn("[CSP violation]", JSON.stringify({
      blockedUri:        report["blocked-uri"]         ?? report.blockedUri,
      violatedDirective: report["violated-directive"]  ?? report.violatedDirective,
      documentUri:       report["document-uri"]        ?? report.documentUri,
      originalPolicy:    report["original-policy"]     ?? report.originalPolicy,
    }));
  } catch {
    // Swallow parse errors — don't expose errors to browser
  }
  return new NextResponse(null, { status: 204 });
}
