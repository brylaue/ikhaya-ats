/**
 * POST /api/email/review/reject
 *
 * Rejects a pending email match. Sets status to 'rejected' and inserts into
 * email_match_rejections so the fuzzy matcher never re-suggests this pair.
 *
 * Body: { linkId: string }
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

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { linkId } = body as { linkId: string };

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

  // Fetch link details — scoped to caller's agency (US-325: IDOR fix)
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

  // Update status to rejected
  const { error: updateError } = await supabase
    .from("candidate_email_links")
    .update({
      status: "rejected",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", linkId);

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to reject match" },
      { status: 500 }
    );
  }

  // Insert into rejections table to prevent re-suggestion
  if (link.matched_address) {
    await supabase.from("email_match_rejections").upsert(
      {
        agency_id:        userRow.agency_id,
        candidate_id:     link.candidate_id,
        rejected_address: link.matched_address,
        rejected_by:      user.id,
      },
      { onConflict: "agency_id,candidate_id,rejected_address" }
    );
  }

  return NextResponse.json({ success: true });
}
