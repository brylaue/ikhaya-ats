/**
 * POST /api/email/backfill
 *
 * Triggers a backfill for the authenticated user's email connection.
 * Provider-agnostic: accepts ?provider=google|microsoft (defaults to google).
 * Dispatches to the unified sync-worker which uses getProvider() internally.
 *
 * Stage 6: Google-only
 * Stage 7: Provider-agnostic (Google + Microsoft)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { backfillUser } from "@/lib/email/sync-worker";
import type { ProviderId } from "@/types/email/provider";

const VALID_PROVIDERS: ProviderId[] = ["google", "microsoft"];

export async function POST(req: NextRequest) {
  // Feature flag check
  if (process.env.EMAIL_SYNC_ENABLED === "false") {
    return new NextResponse("Email sync is disabled", { status: 503 });
  }

  const supabase = await createClient();

  // Check auth
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // Determine provider from query param or body
  const { searchParams } = new URL(req.url);
  let provider = searchParams.get("provider") as ProviderId | null;

  if (!provider) {
    try {
      const body = await req.json().catch(() => ({}));
      provider = body.provider ?? "google";
    } catch {
      provider = "google";
    }
  }

  if (!VALID_PROVIDERS.includes(provider!)) {
    return NextResponse.json(
      { error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(", ")}` },
      { status: 400 }
    );
  }

  // Check provider-specific feature flag
  if (provider === "google" && process.env.EMAIL_GOOGLE_ENABLED !== "true") {
    return NextResponse.json({ error: "Google email integration is disabled" }, { status: 404 });
  }
  if (provider === "microsoft" && process.env.EMAIL_MICROSOFT_ENABLED !== "true") {
    return NextResponse.json({ error: "Microsoft email integration is disabled" }, { status: 404 });
  }

  try {
    // Find the user's connection for this provider
    const { data: connection } = await supabase
      .from("provider_connections")
      .select("*")
      .eq("user_id", user.id)
      .eq("provider", provider)
      .eq("sync_enabled", true)
      .single();

    if (!connection) {
      return NextResponse.json(
        { error: `No active ${provider} connection found` },
        { status: 404 }
      );
    }

    // Check if backfill is already completed
    if (connection.backfill_completed_at) {
      return NextResponse.json(
        { error: "Backfill already completed", completedAt: connection.backfill_completed_at },
        { status: 409 }
      );
    }

    // Start backfill asynchronously
    setTimeout(() => {
      backfillUser(supabase, connection).catch((err) => {
        console.error(`[backfill] Error for ${provider}:`, err);
      });
    }, 0);

    return NextResponse.json(
      { status: "Backfill started", provider },
      { status: 202 }
    );
  } catch (err) {
    console.error("Backfill route error:", err);
    return NextResponse.json({ error: "Unknown error" }, { status: 500 });
  }
}
