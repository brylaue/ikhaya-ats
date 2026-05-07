/**
 * POST /api/email/review/reassign
 *
 * Reassigns a pending email match to a different candidate.
 * Updates the link's candidate_id and sets status to 'active'.
 *
 * Body: { linkId: string, newCandidateId: string }
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
  const { linkId, newCandidateId } = body as {
    linkId: string;
    newCandidateId: string;
  };

  if (!linkId || !newCandidateId) {
    return NextResponse.json(
      { error: "linkId and newCandidateId are required" },
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

  // Verify the new candidate exists and belongs to caller's agency
  const { data: candidate, error: candError } = await supabase
    .from("candidates")
    .select("id")
    .eq("id", newCandidateId)
    .eq("agency_id", userRow.agency_id)
    .single();

  if (candError || !candidate) {
    return NextResponse.json(
      { error: "Target candidate not found" },
      { status: 404 }
    );
  }

  // Fetch the original link — scoped to caller's agency (US-325: IDOR fix)
  const { data: link, error: fetchError } = await supabase
    .from("candidate_email_links")
    .select("id, status")
    .eq("id", linkId)
    .eq("agency_id", userRow.agency_id)
    .single();

  if (fetchError || !link) {
    return NextResponse.json({ error: "Link not found" }, { status: 404 });
  }

  // Update link to point to new candidate and activate
  const { error: updateError } = await supabase
    .from("candidate_email_links")
    .update({
      candidate_id: newCandidateId,
      status: "active",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", linkId);

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to reassign match" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
