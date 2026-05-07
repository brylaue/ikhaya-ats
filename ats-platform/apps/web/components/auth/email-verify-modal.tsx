"use client";

/**
 * EmailVerifyModal + useEmailVerification hook (US-400)
 *
 * Usage:
 *   const { verify } = useEmailVerification();
 *   // In an async handler:
 *   const token = await verify("api_key_create");
 *   if (!token) return; // user cancelled or error
 *   // Call your action endpoint with: { verifyToken: token }
 */

import { useState, useCallback, useRef } from "react";
import { Mail, Shield, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type VerifyAction =
  | "api_key_create"
  | "bulk_export"
  | "account_delete"
  | "agency_delete"
  | "user_remove"
  | "purge_data";

const ACTION_LABELS: Record<VerifyAction, string> = {
  api_key_create: "create an API key",
  bulk_export:    "export your data",
  account_delete: "delete your account",
  agency_delete:  "delete the organisation",
  user_remove:    "remove a team member",
  purge_data:     "purge candidate data",
};

interface ModalState {
  action: VerifyAction;
  resolve: (token: string | null) => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useEmailVerification() {
  const [modal, setModal] = useState<ModalState | null>(null);

  const verify = useCallback((action: VerifyAction): Promise<string | null> => {
    return new Promise((resolve) => {
      setModal({ action, resolve });
    });
  }, []);

  const close = useCallback((token: string | null) => {
    setModal((prev) => {
      prev?.resolve(token);
      return null;
    });
  }, []);

  return {
    verify,
    modal: modal
      ? { action: modal.action, onClose: close }
      : null,
  };
}

// ─── Modal ─────────────────────────────────────────────────────────────────────

interface EmailVerifyModalProps {
  action: VerifyAction;
  onClose: (token: string | null) => void;
}

export function EmailVerifyModal({ action, onClose }: EmailVerifyModalProps) {
  const [code, setCode]           = useState("");
  const [step, setStep]           = useState<"request" | "enter">("request");
  const [loading, setLoading]     = useState(false);
  const inputRefs                 = useRef<(HTMLInputElement | null)[]>([]);

  const label = ACTION_LABELS[action] ?? action;

  async function handleRequestCode() {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/email-verify/request", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error("Failed to send code");
      setStep("enter");
      toast.success("Verification code sent to your email");
    } catch {
      toast.error("Failed to send verification code");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    if (code.length !== 6) return;
    setLoading(true);
    try {
      const res = await fetch("/api/auth/email-verify/confirm", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "invalid_code") {
          toast.error("Incorrect code. Please check your email and try again.");
        } else if (data.error === "expired") {
          toast.error("Code expired. Request a new one.");
          setStep("request");
          setCode("");
        }
        setLoading(false);
        return;
      }
      onClose(data.token);
    } catch {
      toast.error("Verification failed. Please try again.");
      setLoading(false);
    }
  }

  // Split-digit input (6 boxes)
  function handleDigitChange(idx: number, val: string) {
    const digit = val.replace(/\D/, "").slice(-1);
    const chars = code.padEnd(6, " ").split("");
    chars[idx] = digit || " ";
    const next = chars.join("").trimEnd();
    setCode(next.replace(/ /g, ""));
    if (digit && idx < 5) {
      inputRefs.current[idx + 1]?.focus();
    }
  }

  function handleDigitKey(idx: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !code[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100">
              <Shield className="h-5 w-5 text-brand-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Verify your identity</p>
              <p className="text-xs text-muted-foreground">To {label}</p>
            </div>
          </div>
          <button
            onClick={() => onClose(null)}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {step === "request" ? (
          <>
            <p className="text-sm text-muted-foreground mb-5">
              We&apos;ll send a 6-digit code to your email address. This code
              expires in 10 minutes.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => onClose(null)}
                className="flex-1 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRequestCode}
                disabled={loading}
                className="flex flex-1 items-center justify-center gap-2 rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="h-4 w-4" />
                )}
                Send code
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-4">
              Enter the 6-digit code sent to your email.
            </p>

            {/* OTP digit inputs */}
            <div className="flex gap-2 justify-center mb-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <input
                  key={i}
                  ref={(el) => { inputRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={code[i] ?? ""}
                  onChange={(e) => handleDigitChange(i, e.target.value)}
                  onKeyDown={(e) => handleDigitKey(i, e)}
                  autoFocus={i === 0}
                  className={cn(
                    "h-11 w-10 rounded-lg border border-border bg-background text-center text-lg font-mono font-semibold text-foreground outline-none",
                    "focus:ring-2 focus:ring-brand-500 focus:border-brand-500",
                    "transition-colors"
                  )}
                />
              ))}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => { setStep("request"); setCode(""); }}
                className="flex-1 rounded-md border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-accent transition-colors"
              >
                Resend code
              </button>
              <button
                onClick={handleConfirm}
                disabled={loading || code.length < 6}
                className="flex flex-1 items-center justify-center gap-2 rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Verify
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
