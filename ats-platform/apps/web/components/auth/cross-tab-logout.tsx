"use client";

/**
 * US-360: Cross-tab logout via BroadcastChannel API.
 *
 * Any tab that signs out (or gets timed out) broadcasts a `logout` message
 * on the "ats_auth" channel. All other open tabs receive it and immediately
 * redirect to /login — no waiting for onAuthStateChange or cookie expiry.
 *
 * Mount this component once in the authenticated layout (app/(dashboard)/layout.tsx).
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface AuthMessage {
  type: "logout";
  reason: string;
}

export function CrossTabLogout() {
  const router = useRouter();

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;

    const channel = new BroadcastChannel("ats_auth");

    channel.addEventListener("message", (event: MessageEvent<AuthMessage>) => {
      if (event.data?.type === "logout") {
        // Another tab signed out — sync this tab immediately
        router.push(`/login?reason=${encodeURIComponent(event.data.reason ?? "signed_out")}`);
      }
    });

    return () => channel.close();
  }, [router]);

  // Nothing to render
  return null;
}

/**
 * Broadcast a logout event to all other open tabs.
 * Call this before or alongside supabase.auth.signOut().
 */
export function broadcastLogout(reason = "signed_out"): void {
  if (typeof BroadcastChannel === "undefined") return;
  try {
    const channel = new BroadcastChannel("ats_auth");
    channel.postMessage({ type: "logout", reason } satisfies AuthMessage);
    // Small delay before closing so the message can be delivered
    setTimeout(() => channel.close(), 100);
  } catch {
    // BroadcastChannel is best-effort
  }
}
