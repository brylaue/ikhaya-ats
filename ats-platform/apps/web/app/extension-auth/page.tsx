"use client";

/**
 * /extension-auth
 * US-370: Extension OAuth popup landing page.
 *
 * The Chrome extension opens this page in a popup window.
 * It shows a "Connect to ATS" prompt and initiates Google OAuth
 * via /api/auth/extension/init.
 *
 * On success, the /api/auth/extension/callback page posts tokens
 * to window.opener and closes the popup.
 */

import { useState } from "react";
import { Loader2 } from "lucide-react";

export default function ExtensionAuthPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function connect() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/extension/init");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { authUrl } = await res.json();
      // Redirect the popup to the OAuth provider
      window.location.href = authUrl;
    } catch (e) {
      setError("Could not start sign-in. Please try again.");
      setLoading(false);
    }
  }

  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta httpEquiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';" />
        <title>ATS — Connect Extension</title>
      </head>
      <body style={{ margin: 0 }}>
        <div style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#f8fafc",
          padding: "24px",
        }}>
          <div style={{
            background: "#fff",
            borderRadius: "16px",
            border: "1px solid #e2e8f0",
            padding: "32px",
            width: "100%",
            maxWidth: "360px",
            textAlign: "center",
            boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
          }}>
            {/* Logo / brand */}
            <div style={{
              width: "48px", height: "48px",
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              borderRadius: "12px",
              margin: "0 auto 16px",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>

            <h1 style={{ fontSize: "18px", fontWeight: 700, color: "#1e293b", margin: "0 0 8px" }}>
              Connect ATS Extension
            </h1>
            <p style={{ fontSize: "14px", color: "#64748b", margin: "0 0 24px", lineHeight: 1.5 }}>
              Sign in to link the Chrome extension to your ATS account.
            </p>

            {error && (
              <div style={{
                background: "#fef2f2", border: "1px solid #fecaca",
                borderRadius: "8px", padding: "10px 14px",
                fontSize: "13px", color: "#dc2626", marginBottom: "16px",
              }}>
                {error}
              </div>
            )}

            <button
              onClick={connect}
              disabled={loading}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                width: "100%", padding: "12px",
                background: loading ? "#94a3b8" : "#6366f1",
                color: "#fff", border: "none", borderRadius: "10px",
                fontSize: "14px", fontWeight: 600, cursor: loading ? "not-allowed" : "pointer",
                transition: "background 0.15s",
              }}
            >
              {loading
                ? <><Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} />Connecting…</>
                : "Sign in with Google"
              }
            </button>

            <p style={{ fontSize: "12px", color: "#94a3b8", marginTop: "16px" }}>
              This window will close automatically after sign-in.
            </p>
          </div>
        </div>

        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </body>
    </html>
  );
}
