/**
 * POST /api/candidates/[id]/erase
 *
 * US-346: Cascading Right-to-Erasure (GDPR Art. 17)
 *
 * Calls the erase_candidate() stored procedure which:
 *   - Deletes all PII (emails, activities, applications, consents, etc.)
 *   - Triggers ON DELETE CASCADE for FKed tables
 *   - Writes an immutable GDPR_ERASURE entry to audit_log
 *   - Marks any open DSAR erasure requests as fulfilled
 *
 * Requires explicit confirmation token in the request body to prevent
 * accidental erasure. Restricted to agency owners/admins (owner role check).
 *
 * This action is IRREVERSIBLE. Callers must show a strong confirmation UI
 * before submitting.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkCsrf } from "@/lib/csrf";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  // US-326: erasure is irreversible — never accept cross-origin calls
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Resolve user's agency + role
  const { data: userRow } = await supabase
    .from("users")
    .select("agency_id, role")
    .eq("id", user.id)
    .single();

  if (!userRow?.agency_id) {
    return NextResponse.json({ error: "No agency" }, { status: 403 });
  }

  // Only owners and admins may erase candidates
  if (!["owner", "admin"].includes(userRow.role ?? "")) {
    return NextResponse.json({ error: "Forbidden — owner/admin role required" }, { status: 403 });
  }

  // Require explicit confirmation token in the request body
  const body = await req.json().catch(() => ({}));
  const expectedToken = `ERASE:${params.id}`;
  if (body?.confirmationToken !== expectedToken) {
    return NextResponse.json(
      { error: "Missing or invalid confirmationToken. Expected: " + expectedToken },
      { status: 400 }
    );
  }

  try {
    // Call the stored procedure — it handles all deletions and the audit log
    const { data: summary, error: eraseError } = await supabase.rpc("erase_candidate", {
      p_candidate_id: params.id,
      p_agency_id: userRow.agency_id,
      p_erased_by: user.id,
    });

    if (eraseError) {
      console.error("[erase] erase_candidate RPC failed:", eraseError);
      return NextResponse.json({ error: eraseError.message }, { status: 500 });
    }

    return NextResponse.json({ erased: true, summary });
  } catch (err) {
    console.error("[erase] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
