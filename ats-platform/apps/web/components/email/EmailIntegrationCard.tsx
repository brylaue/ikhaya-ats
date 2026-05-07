"use client";

import { useState } from "react";
import { Mail, LogOut, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface EmailIntegrationCardProps {
  provider: "google" | "microsoft";
  connection: { email: string; connectedAt: string } | null;
  onConnect: () => void;
  onDisconnect: () => Promise<void>;
}

const PROVIDER_CONFIG = {
  google: {
    name: "Google Workspace",
    color: "bg-red-500",
    icon: "G",
  },
  microsoft: {
    name: "Microsoft 365",
    color: "bg-brand-500",
    icon: "O",
  },
};

export function EmailIntegrationCard({
  provider,
  connection,
  onConnect,
  onDisconnect,
}: EmailIntegrationCardProps) {
  const [disconnecting, setDisconnecting] = useState(false);
  const config = PROVIDER_CONFIG[provider];
  const emailSyncEnabled = process.env.NEXT_PUBLIC_EMAIL_SYNC_ENABLED !== "false";

  if (!emailSyncEnabled) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 opacity-50">
        <div className="flex items-start gap-3">
          <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white", config.color)}>
            {config.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-foreground">{config.name}</p>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Coming soon</p>
          </div>
        </div>
      </div>
    );
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      await onDisconnect();
      toast.success(`Disconnected from ${config.name}`);
    } catch (err) {
      console.error("Disconnect failed:", err);
      toast.error("Failed to disconnect");
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className={cn("rounded-xl border border-border bg-card p-4", connection && "ring-1 ring-emerald-300")}>
      <div className="flex items-start gap-3">
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white", config.color)}>
          {config.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground">{config.name}</p>
            {connection && <span className="text-[10px] font-semibold text-emerald-600 uppercase">Connected</span>}
          </div>
          {connection ? (
            <p className="text-xs text-muted-foreground mt-1 truncate">{connection.email}</p>
          ) : (
            <p className="text-xs text-muted-foreground mt-1">Sync emails to match with candidates</p>
          )}
        </div>
      </div>

      <div className="flex gap-2 mt-4">
        {connection ? (
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            {disconnecting ? "Disconnecting..." : "Disconnect"}
          </button>
        ) : (
          <button
            onClick={onConnect}
            className="flex items-center gap-1.5 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 transition-colors"
          >
            <Mail className="h-3.5 w-3.5" />
            Connect
          </button>
        )}
      </div>
    </div>
  );
}
