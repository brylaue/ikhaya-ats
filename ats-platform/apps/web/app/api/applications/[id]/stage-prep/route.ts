/**
 * GET /api/applications/[id]/stage-prep
 * US-203: Auto-populate Stage Prep.
 *
 * When a recruiter opens an application page, this endpoint returns a
 * "briefing" block pulling together what the recruiter needs right now:
 *  - candidate snapshot
 *  - job & company summary
 *  - upcoming interviews from the calendar (next 7 days)
 *  - the last 3 activities (calls, notes, emails) on this candidate/job
 *  - any placements this candidate has had before (client knowledge)
 *
 * Everything comes from existing tables; no extra state is stored. This
 * collapses what used to be ~5 separate network calls in the legacy UI.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAgencyContext } from "@/lib/supabase/agency-cache";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: applicationId } = await params;
  const supabase = await createClient();
  const ctx = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: app, error: appErr } = await supabase
    .from("applications")
    .select(`
      id, status, current_stage_id, submitted_at, is_calibration,
      candidate:candidates(id, first_name, last_name, email, phone, contact_status, headline, linkedin_url),
      job:jobs(id, title, company_id, company:companies(id, name, industry))
    `)
    .eq("id", applicationId)
    .maybeSingle();
  if (appErr) return NextResponse.json({ error: appErr.message }, { status: 500 });
  if (!app)   return NextResponse.json({ error: "Not found" }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidateId = (app.candidate as any)?.id;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jobId       = (app.job as any)?.id;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const companyId   = (app.job as any)?.company_id;

  // Run the 4 secondary queries in parallel; each is cheap on its own
  const [interviewsR, activitiesR, priorPlacementsR, notesR] = await Promise.all([
    // Upcoming interviews — scheduled_events table
    supabase.from("scheduled_events")
      .select("id, title, start_time, end_time, event_type, meeting_url")
      .eq("candidate_id", candidateId)
      .gte("start_time", new Date().toISOString())
      .lte("start_time", new Date(Date.now() + 7 * 86400 * 1000).toISOString())
      .order("start_time", { ascending: true })
      .limit(5),
    // Activity timeline
    supabase.from("activities")
      .select("id, activity_type, summary, created_at, created_by, metadata")
      .eq("entity_type", "candidate")
      .eq("entity_id", candidateId)
      .order("created_at", { ascending: false })
      .limit(3),
    // Prior placements for this candidate
    supabase.from("placements")
      .select("id, start_date, placed_at, job:jobs(title, company:companies(name))")
      .eq("candidate_id", candidateId)
      .order("placed_at", { ascending: false })
      .limit(3),
    // Last 3 notes specifically on this application
    supabase.from("application_notes")
      .select("id, body, created_at, created_by")
      .eq("application_id", applicationId)
      .order("created_at", { ascending: false })
      .limit(3),
  ]);

  return NextResponse.json({
    application: app,
    upcoming_interviews: interviewsR.data ?? [],
    recent_activity:     activitiesR.data ?? [],
    prior_placements:    priorPlacementsR.data ?? [],
    application_notes:   notesR.data ?? [],
    generated_at:        new Date().toISOString(),
    context: {
      candidate_id: candidateId,
      job_id:       jobId,
      company_id:   companyId,
    },
  });
}
