"use client";

/**
 * Client-side shell for the dashboard layout.
 *
 * Hosts everything that requires state, effects, or browser APIs:
 * global keyboard shortcuts, onboarding + sync-opt-in modals,
 * cross-tab logout, email sync error banner, impersonation banner.
 *
 * US-307: the parent `app/(dashboard)/layout.tsx` is now a Server
 * Component that just imports this shell. Keeping interactive state
 * in a leaf preserves the server/client boundary instead of forcing
 * the whole dashboard route group into the client bundle.
 */

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { GlobalSearch } from "@/components/layout/global-search";
import { OnboardingModal } from "@/components/onboarding/onboarding-modal";
import { SyncOptInModal } from "@/components/email/sync-opt-in-modal";
import { EmailSyncErrorBanner } from "@/components/email/EmailSyncErrorBanner";
import { CrossTabLogout } from "@/components/auth/cross-tab-logout"; // US-360
import { ImpersonationBanner } from "@/components/impersonation-banner"; // US-403
import { useEmailConnections, useEmailSyncPreference } from "@/lib/supabase/hooks";
import { createClient } from "@/lib/supabase/client";

const ONBOARDING_KEY = "ats_onboarding_dismissed";

// ─── Global keyboard shortcuts ────────────────────────────────────────────────

const G_NAV: Record<string, string> = {
  d: "/dashboard",
  c: "/candidates",
  j: "/jobs",
  p: "/pipeline",
  a: "/analytics",
  o: "/outreach",
  l: "/clients",
  r: "/placements",
  t: "/reports",
  u: "/sourcing",
  s: "/settings",
  h: "/help",
};

function useGlobalShortcuts() {
  const router = useRouter();
  const gPending = useRef(false);
  const gTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      const inInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target as HTMLElement)?.isContentEditable;

      // ⌘K — open search
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        document.dispatchEvent(new CustomEvent("open-search"));
        return;
      }

      // Skip remaining shortcuts if in a text input
      if (inInput) return;

      // ? — open help
      if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
        router.push("/help");
        return;
      }

      // Escape — close modals (dispatch generic event components can listen to)
      if (e.key === "Escape") {
        document.dispatchEvent(new CustomEvent("close-modal"));
        return;
      }

      // G + letter — go to section
      if (e.key === "g" && !e.metaKey && !e.ctrlKey) {
        gPending.current = true;
        if (gTimer.current) clearTimeout(gTimer.current);
        gTimer.current = setTimeout(() => { gPending.current = false; }, 1000);
        return;
      }

      if (gPending.current && G_NAV[e.key]) {
        gPending.current = false;
        if (gTimer.current) clearTimeout(gTimer.current);
        router.push(G_NAV[e.key]);
        return;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (gTimer.current) clearTimeout(gTimer.current);
    };
  }, [router]);
}

// ─── Shell ────────────────────────────────────────────────────────────────────

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showSyncOptIn, setShowSyncOptIn] = useState(false);
  const [userEmail, setUserEmail] = useState("");

  useGlobalShortcuts();

  // Email connections + sync preference (for opt-in modal gating)
  const { google, microsoft, loading: connsLoading } = useEmailConnections();
  const {
    shouldShowOptIn,
    loading: prefLoading,
    recordDecline,
    recordReminderShown,
  } = useEmailSyncPreference();

  useEffect(() => {
    // Show onboarding only if user hasn't dismissed it before
    const dismissed = localStorage.getItem(ONBOARDING_KEY);
    if (!dismissed) {
      // Slight delay so the page loads first
      const t = setTimeout(() => setShowOnboarding(true), 600);
      return () => clearTimeout(t);
    }
  }, []);

  // Fetch current user email for provider detection
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setUserEmail(data.user.email);
    });
  }, []);

  // Gate opt-in modal: no active connections + shouldShowOptIn from preference rules
  useEffect(() => {
    if (connsLoading || prefLoading) return;
    const hasConnection = google !== null || microsoft !== null;
    if (!hasConnection && shouldShowOptIn) {
      // Delay so the page renders first
      const t = setTimeout(() => setShowSyncOptIn(true), 800);
      return () => clearTimeout(t);
    }
  }, [connsLoading, prefLoading, google, microsoft, shouldShowOptIn]);

  function handleDismissOnboarding() {
    localStorage.setItem(ONBOARDING_KEY, "1");
    setShowOnboarding(false);
  }

  function handleSyncAllow(provider: "google" | "microsoft") {
    setShowSyncOptIn(false);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    window.location.href = `${appUrl}/api/auth/${provider}/start`;
  }

  async function handleSyncDecline() {
    await recordDecline();
    // If this was a re-prompt (7-day reminder), mark it shown
    if (shouldShowOptIn) {
      await recordReminderShown();
    }
    setShowSyncOptIn(false);
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <CrossTabLogout /> {/* US-360: broadcasts logout to all open tabs */}
      <Sidebar />
      <main className="flex-1 overflow-y-auto pl-[var(--sidebar-width)]">
        <ImpersonationBanner /> {/* US-403: amber banner during impersonation sessions */}
        <div className="px-8 pt-4">
          <EmailSyncErrorBanner />
        </div>
        {children}
      </main>
      <GlobalSearch />
      {showOnboarding && (
        <OnboardingModal onDismiss={handleDismissOnboarding} />
      )}
      {showSyncOptIn && userEmail && (
        <SyncOptInModal
          userEmail={userEmail}
          onAllow={handleSyncAllow}
          onDecline={handleSyncDecline}
        />
      )}
    </div>
  );
}
