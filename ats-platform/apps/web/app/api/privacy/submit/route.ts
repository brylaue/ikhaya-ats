/**
 * POST /api/privacy/submit — US-353: Candidate Privacy Self-Service Portal
 * Public endpoint — no auth required. Submits a DSAR request.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const { email, requestType, additionalInfo, agencySlug } = await req.json();

    if (!email || !requestType || !agencySlug) {
      return NextResponse.json({ error: "email, requestType, and agencySlug are required" }, { status: 400 });
    }

    const supabase = await createClient();

    // Look up agency by slug
    const { data: agency } = await supabase
      .from("agencies")
      .select("id")
      .eq("slug", agencySlug)
      .single();

    if (!agency) {
      return NextResponse.json({ error: "Agency not found" }, { status: 404 });
    }

    const { data, error } = await supabase
      .from("privacy_requests")
      .insert({
        agency_id:       agency.id,
        email:           email.toLowerCase().trim(),
        request_type:    requestType,
        additional_info: additionalInfo || null,
      })
      .select("status_token, verification_token")
      .single();

    if (error) throw error;

    // In production: send verification email with data.verification_token link
    // For now we return the status token so the user can check status

    return NextResponse.json({ statusToken: data.status_token });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
