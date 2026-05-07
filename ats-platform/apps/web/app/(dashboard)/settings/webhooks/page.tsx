"use client";

/**
 * /settings/webhooks — Outbound Webhook Endpoint Management (US-480)
 *
 * Recruiter registers webhook URLs here. The platform POSTs signed JSON
 * payloads to each active endpoint whenever key events occur:
 *   candidate.created, candidate.updated, candidate.stage_changed,
 *   placement.created, job.created, job.filled, application.created, etc.
 *
 * Payloads are HMAC-SHA256 signed — see WebhooksSection for the full UI.
 */

import { WebhooksSection } from "@/components/settings/webhooks-section";
import { ArrowLeft }       from "lucide-react";
import Link                from "next/link";

export default function WebhooksPage() {
  return (
    <div className="max-w-2xl px-8 py-8 space-y-6">
      {/* Back nav */}
      <Link
        href="/settings"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Settings
      </Link>

      {/* Page header */}
      <div>
        <h1 className="text-base font-semibold text-foreground">Webhooks</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Connect Zapier, Make, or any custom integration via signed HTTP callbacks
        </p>
      </div>

      {/* Main content */}
      <WebhooksSection />
    </div>
  );
}
