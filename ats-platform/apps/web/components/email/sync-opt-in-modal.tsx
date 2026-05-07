"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Mail, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SyncOptInModalProps {
  /** The current user's email address — used to auto-suggest a provider. */
  userEmail: string;
  /** Called when the user clicks "Allow sync" — receives the inferred provider. */
  onAllow: (provider: "google" | "microsoft") => void;
  /** Called when the user clicks "Not now". */
  onDecline: () => void;
}

// ─── Provider detection ──────────────────────────────────────────────────────

type InferredProvider = "google" | "microsoft" | "unknown";

function inferProvider(email: string): InferredProvider {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (domain === "gmail.com" || domain === "googlemail.com") return "google";
  if (
    domain.endsWith(".onmicrosoft.com") ||
    domain === "outlook.com" ||
    domain === "hotmail.com" ||
    domain === "live.com"
  ) {
    return "microsoft";
  }
  // For custom domains we can't determine — user picks explicitly
  return "unknown";
}

// ─── Privacy copy (spec §4.2) ────────────────────────────────────────────────

const PRIVACY_BULLETS = [
  "Ikhaya reads only email metadata (sender, recipient, subject, date) and short snippets to match messages to candidates in your pipeline.",
  "Full message bodies are fetched only for confirmed candidate matches and stored encrypted.",
  "Ikhaya never reads emails that don't involve a known candidate email address.",
  "Your credentials are encrypted at rest using AES-256-GCM. Refresh tokens are stored in Supabase Vault — never in plain-text columns.",
  "You can disconnect at any time from Settings → Integrations. Disconnecting immediately stops syncing and you can request a full data purge.",
  "Ikhaya does not use your email content for training, advertising, or any purpose beyond candidate-timeline matching.",
];

// ─── Component ───────────────────────────────────────────────────────────────

export function SyncOptInModal({
  userEmail,
  onAllow,
  onDecline,
}: SyncOptInModalProps) {
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [explicitPick, setExplicitPick] = useState<"google" | "microsoft" | null>(null);

  const inferred = inferProvider(userEmail);

  // If we can't infer, let the user choose explicitly
  const resolvedProvider: "google" | "microsoft" | null =
    explicitPick ?? (inferred !== "unknown" ? inferred : null);

  const providerLabel =
    resolvedProvider === "google"
      ? "Google Workspace"
      : resolvedProvider === "microsoft"
        ? "Microsoft 365"
        : null;

  function handleAllow() {
    if (!resolvedProvider) return;
    onAllow(resolvedProvider);
  }

  return (
    // Full-screen overlay — no dismiss on outside click per spec
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className="relative w-full max-w-lg rounded-2xl border border-border bg-card p-8 shadow-2xl"
        // Prevent clicks inside the modal from propagating
        onClick={(e) => e.stopPropagation()}
      >
        {/* Icon */}
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-brand-50">
          <Mail className="h-7 w-7 text-brand-600" />
        </div>

        {/* Heading */}
        <h2 className="text-center text-xl font-bold text-foreground">
          Sync your email to Ikhaya
        </h2>
        <p className="mt-2 text-center text-sm text-muted-foreground leading-relaxed">
          Ikhaya can automatically match emails to candidates in your pipeline,
          so every conversation appears on the candidate timeline — no manual
          logging.
        </p>

        {/* Provider picker — only shown when we can't auto-detect */}
        {inferred === "unknown" && !explicitPick && (
          <div className="mt-6 space-y-2">
            <p className="text-xs font-medium text-muted-foreground text-center">
              Which provider do you use?
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setExplicitPick("google")}
                className="flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium text-foreground hover:bg-accent transition-colors"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Google
              </button>
              <button
                onClick={() => setExplicitPick("microsoft")}
                className="flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium text-foreground hover:bg-accent transition-colors"
              >
                <svg className="h-4 w-4" viewBox="0 0 23 23">
                  <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
                  <rect x="13" y="1" width="9" height="9" fill="#7FBA00"/>
                  <rect x="1" y="13" width="9" height="9" fill="#00A4EF"/>
                  <rect x="13" y="13" width="9" height="9" fill="#FFB900"/>
                </svg>
                Microsoft
              </button>
            </div>
          </div>
        )}

        {/* Selected provider indicator */}
        {resolvedProvider && (
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Connecting via <span className="font-semibold text-foreground">{providerLabel}</span>
            {inferred === "unknown" && (
              <button
                onClick={() => setExplicitPick(null)}
                className="ml-1 text-brand-600 hover:underline"
              >
                change
              </button>
            )}
          </p>
        )}

        {/* Privacy expandable */}
        <div className="mt-6 rounded-lg border border-border bg-muted/30">
          <button
            onClick={() => setPrivacyOpen(!privacyOpen)}
            className="flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Shield className="h-4 w-4 text-muted-foreground" />
              What exactly does Ikhaya see?
            </span>
            {privacyOpen ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          {privacyOpen && (
            <div className="border-t border-border px-4 pb-4 pt-3">
              <ul className="space-y-2">
                {PRIVACY_BULLETS.map((bullet, i) => (
                  <li key={i} className="flex gap-2 text-xs text-muted-foreground leading-relaxed">
                    <span className="mt-0.5 shrink-0 text-brand-500">•</span>
                    {bullet}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* CTAs */}
        <div className="mt-6 space-y-3">
          <button
            onClick={handleAllow}
            disabled={!resolvedProvider}
            autoFocus
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition-colors",
              resolvedProvider
                ? "bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          >
            <Mail className="h-4 w-4" />
            Allow sync
          </button>

          <button
            onClick={onDecline}
            className="flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
