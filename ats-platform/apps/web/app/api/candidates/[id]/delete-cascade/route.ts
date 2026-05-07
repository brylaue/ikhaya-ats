/**
 * DELETE /api/candidates/:id/delete-cascade
 *
 * Extends the candidate deletion path with email data cleanup (RTBF).
 * When a candidate is deleted, all their email links and orphaned
 * messages are purged.
 *
 * Stage 10.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { purgeCandidateEmailData } from "@/lib/email/sync/purge";
import { checkCsrf } from "@/lib/csrf";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  // US-326: cross-origin delete guard
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const candidateId = params.id;

  // Get user's agency
  const { data: userRow } = await supabase
    .from("users")
    .select("agency_id")
    .eq("id", user.id)
    .single();

  if (!userRow) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Verify the candidate belongs to the user's agency
  const { data: candidate } = await supabase
    .from("candidates")
    .select("id, agency_id")
    .eq("id", candidateId)
    .eq("agency_id", userRow.agency_id)
    .single();

  if (!candidate) {
    return NextResponse.json(
      { error: "Candidate not found" },
      { status: 404 }
    );
  }

  try {
    // 1. Purge email data (RTBF)
    const purgeResult = await purgeCandidateEmailData(
      supabase,
      candidateId,
      userRow.agency_id
    );

    // 2. Delete the candidate record itself
    const { error: deleteError } = await supabase
      .from("candidates")
      .delete()
      .eq("id", candidateId);

    if (deleteError) {
      console.error("[delete-cascade] Candidate delete failed:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete candidate" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      emailLinksDeleted: purgeResult.linksDeleted,
      emailMessagesDeleted: purgeResult.messagesDeleted,
    });
  } catch (err) {
    console.error("[delete-cascade] Error:", err);
    return NextResponse.json(
      { error: "Delete cascade failed" },
      { status: 500 }
    );
  }
}
