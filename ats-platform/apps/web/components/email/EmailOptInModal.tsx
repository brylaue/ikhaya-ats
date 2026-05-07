"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmailOptInModalProps {
  open: boolean;
  onSkip: () => void;
}

export function EmailOptInModal({ open, onSkip }: EmailOptInModalProps) {
  if (!open) return null;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg">
        <button
          onClick={onSkip}
          className="absolute top-4 right-4 rounded-md p-1 text-muted-foreground hover:bg-accent transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Connect your email</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Automatically match emails to candidates and build your communication history in one place.
            </p>
          </div>

          <div className="space-y-2">
            <a
              href={`${appUrl}/api/auth/google/start`}
              className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium text-foreground hover:bg-accent transition-colors text-center justify-center"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Connect Google Workspace
            </a>

            <a
              href={`${appUrl}/api/auth/microsoft/start`}
              className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium text-foreground hover:bg-accent transition-colors text-center justify-center"
            >
              <svg className="h-4 w-4" viewBox="0 0 23 23" fill="currentColor">
                <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
                <rect x="13" y="1" width="9" height="9" fill="#7FBA00"/>
                <rect x="1" y="13" width="9" height="9" fill="#00A4EF"/>
                <rect x="13" y="13" width="9" height="9" fill="#FFB900"/>
              </svg>
              Connect Microsoft 365
            </a>
          </div>

          <button
            onClick={onSkip}
            className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
