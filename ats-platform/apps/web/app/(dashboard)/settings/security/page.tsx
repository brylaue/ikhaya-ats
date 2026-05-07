"use client";

/**
 * /settings/security — Active Sessions UI (US-357)
 * Updated US-400: sensitive actions now gated behind email OTP verification.
 *
 * Lists all active user sessions with device, IP, last seen, and revoke controls.
 * Sessions are fetched from user_sessions (RLS restricts to own user).
 * Revoking "all other sessions" sets revoked_at on every row except the current one.
 */

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatRelativeTime } from "@/lib/utils";
import { Monitor, Smartphone, LogOut, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  useEmailVerification,
  EmailVerifyModal,
} from "@/components/auth/email-verify-modal";

interface SessionRow {
  id: string;
  device_fingerprint: string | null;
  user_agent: string | null;
  ip_address: string | null;
  session_started_at: string;
  last_active: string;
  revoked_at: string | null;
}

function deviceLabel(ua: string | null): string {
  if (!ua) return "Unknown device";
  if (/mobile|android|iphone/i.test(ua)) return "Mobile browser";
  if (/tablet|ipad/i.test(ua)) return "Tablet";
  return "Desktop browser";
}

function DeviceIcon({ ua }: { ua: string | null }) {
  const isMobile = ua ? /mobile|android|iphone/i.test(ua) : false;
  const Icon = isMobile ? Smartphone : Monitor;
  return <Icon className="h-4 w-4 text-muted-foreground" />;
}

export default function SecurityPage() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const { verify, modal: verifyModal } = useEmailVerification();

  const fetchSessions = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("user_sessions")
      .select("id, device_fingerprint, user_agent, ip_address, session_started_at, last_active, revoked_at")
      .is("revoked_at", null)
      .order("last_active", { ascending: false });
    setSessions((data as SessionRow[]) ?? []);
    setLoading(false);
  }, []);

  // Read current session ID from cookie
  useEffect(() => {
    const match = document.cookie.match(/ats_session_id=([^;]+)/);
    if (match) setCurrentSessionId(decodeURIComponent(match[1]));
    fetchSessions();
  }, [fetchSessions]);

  async function revoke(sessionId: string) {
    setRevoking(sessionId);
    const supabase = createClient();
    const { error } = await supabase
      .from("user_sessions")
      .update({ revoked_at: new Date().toISOString(), revoke_reason: "user" })
      .eq("id", sessionId);

    if (error) {
      toast.error("Failed to revoke session");
    } else {
      toast.success("Session revoked");
      await fetchSessions();
    }
    setRevoking(null);
  }

  async function revokeAllOthers() {
    if (!currentSessionId) return;

    // Gate behind email OTP verification (US-400)
    const token = await verify("purge_data");
    if (!token) return; // user cancelled

    setRevoking("all");
    const supabase = createClient();
    const { error } = await supabase
      .from("user_sessions")
      .update({ revoked_at: new Date().toISOString(), revoke_reason: "user" })
      .is("revoked_at", null)
      .neq("id", currentSessionId);

    if (error) {
      toast.error("Failed to revoke sessions");
    } else {
      toast.success("All other sessions revoked");
      await fetchSessions();
    }
    setRevoking(null);
  }

  const activeSessions = sessions.filter(s => !s.revoked_at);
  const otherSessions = activeSessions.filter(s => s.id !== currentSessionId);

  return (
    <div className="max-w-2xl px-8 py-8 space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Active Sessions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Devices and browsers currently signed into your account. Revoke any session
          to immediately sign it out.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          Loading sessions…
        </div>
      ) : (
        <div className="space-y-3">
          {activeSessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active sessions found.</p>
          ) : (
            activeSessions.map((session) => {
              const isCurrent = session.id === currentSessionId;
              return (
                <div
                  key={session.id}
                  className="flex items-start justify-between gap-4 rounded-lg border border-border p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      <DeviceIcon ua={session.user_agent} />
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {deviceLabel(session.user_agent)}
                        </span>
                        {isCurrent && (
                          <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                            <ShieldCheck className="h-2.5 w-2.5" />
                            This session
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate max-w-[340px]">
                        {session.user_agent ?? "Unknown browser"}
                      </p>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                        {session.ip_address && <span>{session.ip_address}</span>}
                        <span>Started {formatRelativeTime(session.session_started_at)}</span>
                        <span>Active {formatRelativeTime(session.last_active)}</span>
                      </div>
                    </div>
                  </div>

                  {!isCurrent && (
                    <button
                      onClick={() => revoke(session.id)}
                      disabled={revoking === session.id || revoking === "all"}
                      className="flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:border-red-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-40 transition-colors"
                    >
                      <LogOut className="h-3 w-3" />
                      Revoke
                    </button>
                  )}
                </div>
              );
            })
          )}

          {otherSessions.length > 1 && (
            <button
              onClick={revokeAllOthers}
              disabled={revoking === "all"}
              className="mt-2 flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-40 transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              Revoke all other sessions ({otherSessions.length})
            </button>
          )}
        </div>
      )}

      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <h2 className="text-xs font-semibold text-foreground mb-1">Session policy</h2>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Sessions expire after <strong>30 minutes of inactivity</strong> or a hard cap of{" "}
          <strong>8 hours</strong> regardless of activity. Signing out on one device also
          notifies all other open tabs to sign out immediately.
        </p>
      </div>

      {/* Email verification modal (US-400) */}
      {verifyModal && (
        <EmailVerifyModal
          action={verifyModal.action}
          onClose={verifyModal.onClose}
        />
      )}
    </div>
  );
}
