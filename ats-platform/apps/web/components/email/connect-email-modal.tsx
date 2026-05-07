"use client";

import { useState } from "react";
import { X, Mail, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type Provider = "google" | "microsoft";

interface ConnectEmailModalProps {
  /** Called when the user explicitly dismisses without connecting. */
  onDismiss: () => void;
  /** Called after a successful redirect is initiated. */
  onConnecting?: (provider: Provider) => void;
}

// ─── Provider config ──────────────────────────────────────────────────────────

const PROVIDERS: Array<{
  id: Provider;
  label: string;
  description: string;
  route: string;
  logoSvg: React.ReactNode;
  bg: string;
  border: string;
  hover: string;
}> = [
  {
    id: "google",
    label: "Connect Gmail",
    description: "Send and track outreach from your Gmail account",
    route: "/api/auth/google/start",
    bg: "bg-card",
    border: "border-slate-200",
    hover: "hover:border-red-300 hover:shadow-red-50",
    logoSvg: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
      </svg>
    ),
  },
  {
    id: "microsoft",
    label: "Connect Outlook",
    description: "Send and track outreach from your Outlook / Office 365 account",
    route: "/api/auth/microsoft/start",
    bg: "bg-card",
    border: "border-slate-200",
    hover: "hover:border-brand-300 hover:shadow-blue-50",
    logoSvg: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
        <path d="M4.5 2h7L21 11.5v7a2.5 2.5 0 0 1-2.5 2.5h-14A2.5 2.5 0 0 1 2 18.5v-14A2.5 2.5 0 0 1 4.5 2z" fill="#0078D4" />
        <path d="M11.5 2v9.5H21L11.5 2z" fill="#50D9FF" opacity=".7" />
        <text x="5" y="18" fontSize="8" fill="white" fontWeight="700" fontFamily="sans-serif">OWA</text>
      </svg>
    ),
  },
];

// ─── Modal ────────────────────────────────────────────────────────────────────

export function ConnectEmailModal({ onDismiss, onConnecting }: ConnectEmailModalProps) {
  const [connecting, setConnecting] = useState<Provider | null>(null);

  function handleConnect(provider: Provider, route: string) {
    setConnecting(provider);
    onConnecting?.(provider);
    // Redirect to OAuth start route
    window.location.href = route;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onDismiss}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-card shadow-2xl ring-1 ring-black/5 overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Connect your inbox</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Link an email account to send outreach and track replies
              </p>
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Provider list */}
        <div className="px-6 pb-4 space-y-2.5">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              onClick={() => handleConnect(p.id, p.route)}
              disabled={!!connecting}
              className={cn(
                "group flex w-full items-center gap-4 rounded-xl border px-4 py-3.5 text-left transition-all shadow-sm",
                p.bg, p.border, p.hover,
                connecting === p.id && "opacity-70",
                connecting && connecting !== p.id && "opacity-40 cursor-not-allowed"
              )}
            >
              <div className="shrink-0">{p.logoSvg}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">{p.label}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground leading-snug">{p.description}</p>
              </div>
              {connecting === p.id ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
              ) : (
                <svg
                  className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors"
                  viewBox="0 0 16 16" fill="none"
                >
                  <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-6 py-3">
          <p className="text-[10px] text-muted-foreground">
            We only request read + send access. You can disconnect anytime.
          </p>
          <button
            onClick={onDismiss}
            className="text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
