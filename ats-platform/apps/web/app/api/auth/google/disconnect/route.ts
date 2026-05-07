import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/email/token-store";

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  // Check auth
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Find the Google connection
    const { data: connection } = await supabase
      .from("provider_connections")
      .select("*")
      .eq("user_id", user.id)
      .eq("provider", "google")
      .single();

    if (!connection) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 }
      );
    }

    // Decrypt and revoke the refresh token at Google.
    // US-342: Check the revoke response status. 200 = revoked, 400 = already
    // revoked (token already expired/revoked at Google) — both are acceptable.
    // Any other status is unexpected; log a warning but continue with deletion.
    try {
      const refreshToken = await decrypt(connection.refresh_token_secret_ref);
      const revokeRes = await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: refreshToken }).toString(),
      });
      if (revokeRes.status !== 200 && revokeRes.status !== 400) {
        console.warn(
          `[google/disconnect] Unexpected revoke status ${revokeRes.status} — grant may still be active at Google`
        );
      }
    } catch (err) {
      console.error("Failed to revoke refresh token:", err);
      // Continue with deletion even if revocation fails
    }

    // Delete the connection
    const { error: deleteError } = await supabase
      .from("provider_connections")
      .delete()
      .eq("id", connection.id);

    if (deleteError) {
      console.error("Failed to delete connection:", deleteError);
      return NextResponse.json({ error: "Delete failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Disconnect error:", err);
    return NextResponse.json({ error: "Unknown error" }, { status: 500 });
  }
}
