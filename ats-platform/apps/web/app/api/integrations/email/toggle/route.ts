/**
 * PATCH /api/integrations/email/toggle?provider=google|microsoft
 *
 * Toggles `sync_enabled` on the caller's provider_connection.
 * Stage 5 — UI-only endpoint, no sync side-effects yet.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkCsrf } from "@/lib/csrf";

export async function PATCH(req: NextRequest) {
  // US-326: reject cross-origin + missing JSON Content-Type
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const provider = req.nextUrl.searchParams.get("provider");
  if (provider !== "google" && provider !== "microsoft") {
    return NextResponse.json(
      { error: "Invalid provider — must be 'google' or 'microsoft'" },
      { status: 400 }
    );
  }

  try {
    // US-333: derive agency_id from auth token and scope every query
    const { data: userRow } = await supabase
      .from("users")
      .select("agency_id")
      .eq("id", user.id)
      .single();

    if (!userRow?.agency_id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Fetch current connection — enforce agency scope alongside user_id
    const { data: connection, error: fetchError } = await supabase
      .from("provider_connections")
      .select("id, sync_enabled")
      .eq("user_id", user.id)
      .eq("provider", provider)
      .eq("agency_id", userRow.agency_id)
      .single();

    if (fetchError || !connection) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 }
      );
    }

    // Toggle — keep agency_id on the update so a stale id cannot cross agencies
    const newValue = !connection.sync_enabled;
    const { error: updateError } = await supabase
      .from("provider_connections")
      .update({ sync_enabled: newValue })
      .eq("id", connection.id)
      .eq("agency_id", userRow.agency_id);

    if (updateError) {
      console.error("[toggle] Update failed:", updateError);
      return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }

    return NextResponse.json({ syncEnabled: newValue });
  } catch (err) {
    console.error("[toggle] Unexpected error:", err);
    return NextResponse.json({ error: "Unknown error" }, { status: 500 });
  }
}
