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
    // Find the Microsoft connection
    const { data: connection } = await supabase
      .from("provider_connections")
      .select("*")
      .eq("user_id", user.id)
      .eq("provider", "microsoft")
      .single();

    if (!connection) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 }
      );
    }

    // Decrypt and revoke the refresh token
    try {
      const refreshToken = await decrypt(connection.refresh_token_secret_ref);
      const authority = process.env.MS_OAUTH_AUTHORITY || "https://login.microsoftonline.com/common";
      const clientId = process.env.MS_OAUTH_CLIENT_ID;
      const clientSecret = process.env.MS_OAUTH_CLIENT_SECRET;

      if (clientId && clientSecret) {
        await fetch(`${authority}/oauth2/v2.0/token`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            token: refreshToken,
            token_type_hint: "refresh_token",
          }).toString(),
        });
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
