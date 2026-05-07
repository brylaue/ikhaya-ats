/**
 * POST /api/email/review/confirm
 *
 * Confirms a pending fuzzy/thread email match. Sets the link status to 'active'
 * and optionally adds the matched address as an alt email on the candidate.
 *
 * Body: { linkId: string, alsoAddAsAltEmail?: boolean }
 *
 * Stage 9.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkCsrf } from "@/lib/csrf";

export async function POST(request: NextRequest) {
  // US-326: CSRF protection for session-cookie-authenticated endpoints
  const csrfError = checkCsrf(request);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { linkId, alsoAddAsAltEmail } = body as {
    linkId: string;
    alsoAddAsAltEmail?: boolean;
  };

  if (!linkId) {
    return NextResponse.json(
      { error: "linkId is required" },
      { status: 400 }
    );
  }

  // US-325: get agency_id from auth token for explicit scoping
  const { data: userRow } = await supabase
    .from("users")
    .select("agency_id")
    .eq("id", user.id)
    .single();

  if (!userRow?.agency_id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Fetch the link — scoped to caller's agency (US-325: IDOR fix)
  const { data: link, error: fetchError } = await supabase
    .from("candidate_email_links")
    .select("id, candidate_id, matched_address, status")
    .eq("id", linkId)
    .eq("agency_id", userRow.agency_id)
    .single();

  if (fetchError || !link) {
    return NextResponse.json({ error: "Link not found" }, { status: 404 });
  }

  if (link.status !== "pending_review") {
    return NextResponse.json(
      { error: "Link is not pending review" },
      { status: 409 }
    );
  }

  // Update status to active
  const { error: updateError } = await supabase
    .from("candidate_email_links")
    .update({
      status: "active",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", linkId);

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to confirm match" },
      { status: 500 }
    );
  }

  // Optionally add as alt email on the candidate
  if (alsoAddAsAltEmail && link.matched_address) {
    await supabase
      .from("candidates")
      .update({ alt_email: link.matched_address })
      .eq("id", link.candidate_id)
      .is("alt_email", null); // Only set if not already set
  }

  return NextResponse.json({ success: true });
}
