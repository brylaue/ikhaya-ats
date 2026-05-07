/**
 * US-046: Client Portal Audit Trail — event logger.
 *
 * The client portal routes live under /api/portal/* and /api/client-invites/*.
 * They run under the service key because portal users don't have agency-scoped
 * auth. We log each meaningful action here so the recruiter can audit it
 * without the portal user having any DB writes of their own.
 *
 * Usage:
 *   await logClientPortalEvent(admin, {
 *     agency_id, company_id, job_id, candidate_id,
 *     portal_user_email, event_type: "view_candidate",
 *     duration_seconds: 47,
 *   });
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAdmin = any;

export interface PortalEventInput {
  agency_id: string;
  company_id?: string | null;
  job_id?: string | null;
  candidate_id?: string | null;
  portal_user_email?: string | null;
  event_type: "login" | "view_candidate" | "view_job" | "decision" | "comment" | "download_resume" | "export";
  decision?: string | null;
  duration_seconds?: number | null;
  metadata?: Record<string, unknown>;
}

export async function logClientPortalEvent(admin: SupabaseAdmin, evt: PortalEventInput) {
  // Fire-and-forget: if the insert fails, we should NOT break the portal
  // request. Worst case, the recruiter misses one audit row.
  try {
    await admin.from("client_portal_events").insert({
      agency_id:         evt.agency_id,
      company_id:        evt.company_id ?? null,
      job_id:            evt.job_id ?? null,
      candidate_id:      evt.candidate_id ?? null,
      portal_user_email: evt.portal_user_email ?? null,
      event_type:        evt.event_type,
      decision:          evt.decision ?? null,
      duration_seconds:  evt.duration_seconds ?? null,
      metadata:          evt.metadata ?? {},
    });
  } catch (e) {
    console.warn("[client_portal_events] insert failed:", e);
  }
}
