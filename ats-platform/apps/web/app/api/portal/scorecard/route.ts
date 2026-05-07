import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkCsrf } from "@/lib/csrf";
import { rateLimit, clientIpFromHeaders } from "@/lib/rate-limit";

const supabaseUrl      = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAdminKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// ─── POST /api/portal/scorecard ───────────────────────────────────────────────
// Called from the client portal (unauthenticated) to submit a scorecard.
//
// Body:
//   portalSlug:     string
//   candidateId:    string
//   clientName:     string
//   clientEmail?:   string
//   recommendation: "strong_yes" | "yes" | "maybe" | "no"
//   overallRating:  number (1–5)
//   pros?:          string
//   cons?:          string
//   notes?:         string

export async function POST(req: NextRequest) {
  // US-320: CSRF protection — reject non-JSON and cross-origin requests
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  try {
    const body = await req.json();
    const {
      portalSlug,
      candidateId,
      clientName,
      clientEmail,
      recommendation,
      overallRating,
      pros,
      cons,
      notes,
    } = body as {
      portalSlug:     string;
      candidateId:    string;
      clientName:     string;
      clientEmail?:   string;
      recommendation: string;
      overallRating:  number;
      pros?:          string;
      cons?:          string;
      notes?:         string;
    };

    if (!portalSlug || !candidateId || !clientName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // US-335: 5 submissions/hour per (IP, portalSlug, candidate). Portal is
    // unauthenticated so IP is the only pre-DB signal we can key on. Combined
    // with slug+candidate to avoid collateral damage from shared corporate NATs.
    const ip = clientIpFromHeaders(req.headers);
    const rl = rateLimit(
      `portal-scorecard:${ip}:${portalSlug}:${candidateId}`,
      5,
      60 * 60 * 1000
    );
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many submissions — please try again later" },
        {
          status: 429,
          headers: {
            "Retry-After": String(rl.retryAfter),
            "X-RateLimit-Limit": "5",
            "X-RateLimit-Remaining": "0",
          },
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAdminKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Look up the client_portal by slug to get agency_id
    const { data: portal } = await supabase
      .from("client_portals")
      .select("id, agency_id, company_id")
      .eq("slug", portalSlug)
      .maybeSingle();

    if (!portal) {
      return NextResponse.json({ error: "Portal not found" }, { status: 404 });
    }

    // Verify candidate belongs to this agency
    const { data: candidate } = await supabase
      .from("candidates")
      .select("id, agency_id")
      .eq("id", candidateId)
      .eq("agency_id", portal.agency_id)
      .maybeSingle();

    if (!candidate) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    // Insert scorecard using service role (bypasses RLS)
    const { data: scorecard, error } = await supabase
      .from("scorecard_submissions")
      .insert({
        agency_id:           portal.agency_id,
        candidate_id:        candidateId,
        job_id:              null,
        interviewer_id:      null,
        overall_rating:      overallRating ?? null,
        recommendation:      recommendation ?? null,
        ratings:             {},
        notes:               notes ?? null,
        pros:                pros ?? null,
        cons:                cons ?? null,
        portal_slug:         portalSlug,
        portal_client_name:  clientName,
        portal_client_email: clientEmail ?? null,
        submitted_via:       "portal",
        submitted_at:        new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error) {
      console.error("[portal/scorecard] insert error:", error);
      return NextResponse.json({ error: "Failed to save scorecard" }, { status: 500 });
    }

    // Log to activities
    await supabase.from("activities").insert({
      agency_id:   portal.agency_id,
      entity_type: "candidate",
      entity_id:   candidateId,
      actor_id:    null,
      action:      "scorecard_submitted",
      metadata:    {
        summary:        `Scorecard submitted by portal client: ${clientName}`,
        portal_slug:    portalSlug,
        client_name:    clientName,
        recommendation: recommendation,
        overall_rating: overallRating,
      },
    });

    return NextResponse.json({ scorecardId: scorecard.id }, { status: 201 });
  } catch (err) {
    console.error("[portal/scorecard] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
