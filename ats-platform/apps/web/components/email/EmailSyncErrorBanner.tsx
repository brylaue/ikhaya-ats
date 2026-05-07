"use client";

/**
 * Persistent error banner for email connection issues.
 *
 * Checks provider_connections for error states on mount.
 * Dismissible per-session but reappears on next login if still in error.
 *
 * Stage 10.
 */

import { useState, useEffect } from "react";
import { AlertTriangle, X, ExternalLink, RefreshCw, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

interface ErrorInfo {
  provider: "google" | "microsoft";
  errorState: string;
  email: string;
}

const ERROR_COPY: Record<
  string,
  { title: string; description: string; action: string; actionLabel: string; icon: React.ComponentType<{ className?: string }> }
> = {
  invalid_grant: {
    title: "Email connection expired",
    description:
      "Your email token has been revoked or expired. Reconnect to resume syncing.",
    action: "reconnect",
    actionLabel: "Reconnect",
    icon: RefreshCw,
  },
  admin_consent_required: {
    title: "Admin approval needed",
    description:
      "Your IT administrator needs to approve Ikhaya for your Microsoft 365 organisation.",
    action: "admin_consent",
    actionLabel: "Learn more",
    icon: Shield,
  },
  rate_limited: {
    title: "Sync paused",
    description:
      "Email sync is temporarily paused due to rate limiting. It will automatically retry.",
    action: "none",
    actionLabel: "",
    icon: AlertTriangle,
  },
  insufficient_scope: {
    title: "Missing permissions",
    description:
      "Ikhaya needs additional email permissions. Reconnect and grant all requested scopes.",
    action: "reconnect",
    actionLabel: "Reconnect",
    icon: AlertTriangle,
  },
};

const DEFAULT_COPY = {
  title: "Email sync error",
  description: "There's an issue with your email connection. Check Settings > Integrations.",
  action: "settings",
  actionLabel: "View settings",
  icon: AlertTriangle,
};

export function EmailSyncErrorBanner() {
  const [errors, setErrors] = useState<ErrorInfo[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkErrors = async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data: conns } = await supabase
        .from("provider_connections")
        .select("provider, email, error_state")
        .eq("user_id", user.id)
        .not("error_state", "is", null);

      const errorConns: ErrorInfo[] = (conns ?? [])
        .filter((c) => c.error_state)
        .map((c) => ({
          provider: c.provider as "google" | "microsoft",
          errorState: c.error_state!,
          email: c.email,
        }));

      setErrors(errorConns);
      setLoading(false);
    };

    checkErrors();
  }, []);

  if (loading || errors.length === 0) return null;

  const visibleErrors = errors.filter(
    (e) => !dismissed.has(`${e.provider}-${e.errorState}`)
  );
  if (visibleErrors.length === 0) return null;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  return (
    <div className="space-y-2">
      {visibleErrors.map((error) => {
        const copy = ERROR_COPY[error.errorState] ?? DEFAULT_COPY;
        const Icon = copy.icon;
        const key = `${error.provider}-${error.errorState}`;
        const providerLabel =
          error.provider === "google" ? "Gmail" : "Outlook";

        return (
          <div
            key={key}
            className={cn(
              "flex items-start gap-3 rounded-lg border px-4 py-3",
              error.errorState === "rate_limited"
                ? "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20"
                : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20"
            )}
          >
            <Icon
              className={cn(
                "mt-0.5 h-4 w-4 shrink-0",
                error.errorState === "rate_limited"
                  ? "text-amber-600"
                  : "text-red-600"
              )}
            />
            <div className="flex-1 min-w-0">
              <p
                className={cn(
                  "text-sm font-semibold",
                  error.errorState === "rate_limited"
                    ? "text-amber-800 dark:text-amber-300"
                    : "text-red-800 dark:text-red-300"
                )}
              >
                {copy.title} — {providerLabel}
              </p>
              <p
                className={cn(
                  "mt-0.5 text-xs",
                  error.errorState === "rate_limited"
                    ? "text-amber-700 dark:text-amber-400"
                    : "text-red-700 dark:text-red-400"
                )}
              >
                {copy.description}
              </p>
              {copy.action === "reconnect" && (
                <button
                  onClick={() => {
                    window.location.href = `${appUrl}/api/auth/${error.provider}/start`;
                  }}
                  className="mt-2 inline-flex items-center gap-1 rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                  {copy.actionLabel} {providerLabel}
                </button>
              )}
              {copy.action === "admin_consent" && (
                <button
                  onClick={() => {
                    window.location.href = `${appUrl}/settings/integrations`;
                  }}
                  className="mt-2 inline-flex items-center gap-1 rounded-md bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 transition-colors"
                >
                  <Shield className="h-3 w-3" />
                  {copy.actionLabel}
                </button>
              )}
              {copy.action === "settings" && (
                <button
                  onClick={() => {
                    window.location.href = `${appUrl}/settings/integrations`;
                  }}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-red-700 hover:text-red-800 transition-colors"
                >
                  {copy.actionLabel}
                </button>
              )}
            </div>
            <button
              onClick={() =>
                setDismissed((prev) => new Set([...prev, key]))
              }
              className="shrink-0 p-0.5 rounded hover:bg-black/5 transition-colors"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
