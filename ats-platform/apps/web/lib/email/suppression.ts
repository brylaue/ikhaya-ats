/**
 * Suppression list helpers (US-473, US-482, US-472)
 *
 * Every outbound send must call `isSuppressed(agencyId, email)` before handing
 * the message to the Gmail/Graph adapter. Returns true → caller must skip send
 * and mark the activity as suppressed.
 *
 * Writes use the service-role client because:
 *   - Unsubscribe links fire from an unauthenticated public route.
 *   - Bounce handlers fire from the inbound sync worker (no user session).
 *
 * Reads from the recruiter UI should use the user-scoped supabase client so
 * RLS applies — this module is for server-side dispatch only.
 */

import { createServiceClient } from "@/lib/supabase/service";

export type SuppressionReason =
  | "unsubscribe"
  | "hard_bounce"
  | "complaint"
  | "manual"
  | "list_unsubscribe_post";

export interface AddSuppressionArgs {
  agencyId:  string;
  email:     string;
  reason:    SuppressionReason;
  messageId?: string;
  source?:   string;
  note?:     string;
}

/** Returns true if (agency, email) is present on the suppression list. */
export async function isSuppressed(
  agencyId: string,
  email:    string
): Promise<boolean> {
  try {
    const db = createServiceClient();
    const { data } = await db
      .from("email_suppression_list")
      .select("id")
      .eq("agency_id", agencyId)
      .eq("email", email.toLowerCase())
      .maybeSingle();
    return !!data;
  } catch (err) {
    // Fail-CLOSED for suppression: if we can't verify, don't send.
    // Rationale: sending to a suppressed address is a regulatory violation;
    // a short outage is preferable to a CAN-SPAM complaint.
    console.error("[email/suppression] read failed, failing closed:", err);
    return true;
  }
}

/** Filter a list of recipients, returning only the ones NOT suppressed. */
export async function filterSuppressed(
  agencyId: string,
  emails:   string[]
): Promise<{ allowed: string[]; blocked: string[] }> {
  if (emails.length === 0) return { allowed: [], blocked: [] };
  const normalized = emails.map((e) => e.toLowerCase());
  try {
    const db = createServiceClient();
    const { data } = await db
      .from("email_suppression_list")
      .select("email")
      .eq("agency_id", agencyId)
      .in("email", normalized);
    const blockedSet = new Set((data ?? []).map((r: { email: string }) => r.email.toLowerCase()));
    const allowed: string[] = [];
    const blocked: string[] = [];
    for (const addr of emails) {
      if (blockedSet.has(addr.toLowerCase())) blocked.push(addr);
      else allowed.push(addr);
    }
    return { allowed, blocked };
  } catch (err) {
    console.error("[email/suppression] batch read failed, failing closed:", err);
    return { allowed: [], blocked: emails };
  }
}

/** Insert (or no-op-on-conflict) a suppression row. */
export async function addSuppression(args: AddSuppressionArgs): Promise<void> {
  const db = createServiceClient();
  const { error } = await db
    .from("email_suppression_list")
    .upsert(
      {
        agency_id:  args.agencyId,
        email:      args.email.toLowerCase(),
        reason:     args.reason,
        message_id: args.messageId ?? null,
        source:     args.source ?? null,
        note:       args.note ?? null,
      },
      { onConflict: "agency_id,email", ignoreDuplicates: true }
    );
  if (error) throw error;
}

/** Record a bounce. Hard bounces and complaints auto-suppress via DB trigger. */
export async function recordBounce(args: {
  agencyId:       string;
  recipientEmail: string;
  bounceType:     "hard" | "soft" | "complaint" | "auto_reply" | "unknown";
  diagnosticCode?: string;
  smtpStatus?:    string;
  messageId?:     string;
  dsnRaw?:        Record<string, unknown>;
}): Promise<void> {
  const db = createServiceClient();
  const { error } = await db.from("email_bounces").insert({
    agency_id:       args.agencyId,
    recipient_email: args.recipientEmail.toLowerCase(),
    bounce_type:     args.bounceType,
    diagnostic_code: args.diagnosticCode ?? null,
    smtp_status:     args.smtpStatus ?? null,
    message_id:      args.messageId ?? null,
    dsn_raw:         args.dsnRaw ?? null,
  });
  if (error) throw error;
}
