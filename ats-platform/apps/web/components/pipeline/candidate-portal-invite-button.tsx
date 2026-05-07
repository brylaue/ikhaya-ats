"use client";

/**
 * CandidatePortalInviteButton — US-474: Candidate Portal Invite Flow
 *
 * One-click magic-link invite for candidates to view their stage status portal.
 * Used on candidate cards in the pipeline and on the application detail.
 */

import { useState } from "react";
import { Send, Copy, RefreshCw, XCircle, Eye, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCandidatePortalInvite } from "@/lib/supabase/hooks";
import { toast } from "sonner";

interface Props {
  applicationId: string;
  candidateId:   string;
  jobId:         string;
}

export function CandidatePortalInviteButton({ applicationId, candidateId, jobId }: Props) {
  const { invite, loading, isActive, portalUrl, sendInvite, revokeInvite } = useCandidatePortalInvite(applicationId);
  const [sending, setSending] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  async function handleSend() {
    setSending(true);
    try {
      await sendInvite(candidateId, jobId);
      toast.success("Portal invite sent");
      setShowDetails(true);
    } catch {
      toast.error("Failed to send invite");
    } finally {
      setSending(false);
    }
  }

  async function handleRevoke() {
    setRevoking(true);
    try {
      await revokeInvite();
      toast.success("Invite revoked");
      setShowDetails(false);
    } catch {
      toast.error("Failed to revoke invite");
    } finally {
      setRevoking(false);
    }
  }

  function copyUrl() {
    if (!portalUrl) return;
    navigator.clipboard.writeText(portalUrl);
    toast.success("Link copied");
  }

  if (loading) return <div className="h-8 w-32 animate-pulse rounded-md bg-muted" />;

  return (
    <div className="space-y-2">
      {!isActive ? (
        <button
          type="button"
          onClick={handleSend}
          disabled={sending}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-md text-xs font-medium text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" />
          {sending ? "Sending…" : invite?.revokedAt ? "Resend invite" : "Invite to portal"}
        </button>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Invite active
            </span>
            {invite?.acceptedAt && (
              <span className="text-[10px] text-muted-foreground">
                Accepted {new Date(invite.acceptedAt).toLocaleDateString()}
              </span>
            )}
            {invite && invite.viewCount > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                <Eye className="h-2.5 w-2.5" />
                {invite.viewCount} view{invite.viewCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={copyUrl}
              className="flex items-center gap-1 px-2.5 py-1 border border-border rounded-md text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
            >
              <Copy className="h-3 w-3" />
              Copy link
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={sending}
              title="Resend (generates new link)"
              className="flex items-center gap-1 px-2.5 py-1 border border-border rounded-md text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
            >
              <RefreshCw className="h-3 w-3" />
              Resend
            </button>
            <button
              type="button"
              onClick={handleRevoke}
              disabled={revoking}
              className="flex items-center gap-1 px-2.5 py-1 border border-red-200 rounded-md text-[11px] text-red-600 hover:bg-red-50 transition-colors"
            >
              <XCircle className="h-3 w-3" />
              Revoke
            </button>
          </div>

          {invite && (
            <p className="text-[10px] text-muted-foreground">
              Expires {new Date(invite.expiresAt).toLocaleDateString()}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
