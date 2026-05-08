import type { NextConfig } from "next";
import path from "path";

// ─── Content-Security-Policy (US-364) ────────────────────────────────────────
// Validated against Google CSP Evaluator before shipping.
// Connect-src includes Supabase origins (REST + realtime websocket).
// report-uri sends violations to /api/csp-report for monitoring.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
// Extract hostname for connect-src (e.g. "abcxyz.supabase.co")
const SUPABASE_HOST = SUPABASE_URL ? new URL(SUPABASE_URL).hostname : "";
const SUPABASE_WSS  = SUPABASE_HOST ? `wss://${SUPABASE_HOST}` : "";
const SUPABASE_HTTPS = SUPABASE_HOST ? `https://${SUPABASE_HOST}` : "";

const cspDirectives = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",                       // Tailwind inlines styles
  "img-src 'self' data: https:",                             // avatars, logos from any https
  `connect-src 'self' ${SUPABASE_HTTPS} ${SUPABASE_WSS} https://*.supabase.co wss://*.supabase.co`,
  "frame-ancestors 'none'",                                  // clickjacking protection
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "report-uri /api/csp-report",
].join("; ");

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: cspDirectives,
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  // Pin workspace root to the monorepo root so Next.js doesn't pick up
  // the wrong lockfile and misreport the output tracing base.
  outputFileTracingRoot: path.join(__dirname, "../../.."),
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.r2.cloudflarestorage.com" },
      { protocol: "https", hostname: "*.s3.amazonaws.com" },
    ],
  },
  // Keep packages that read files relative to their own location (jsdom reads
  // its default-stylesheet.css via __dirname) as runtime CommonJS requires
  // instead of bundling them into webpack chunks. Without this, Next 15's
  // build-time "Collecting page data" phase fails with ENOENT on
  // .next/browser/default-stylesheet.css when any server route transitively
  // imports isomorphic-dompurify (which depends on jsdom).
  serverExternalPackages: [
    "isomorphic-dompurify",
    "jsdom",
    "dompurify",
    "canvas",
  ],
  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
