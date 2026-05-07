/**
 * GET  /api/candidate-portal/prep-content?candidateId=&jobId=
 * POST /api/candidate-portal/prep-content
 * US-242: Recruiter CRUD for per-candidate stage prep content.
 *
 * GET  → list prep items for a candidate (+ optional job filter)
 * POST → create a new prep item
 *
 * Body (POST): {
 *   candidateId: string;
 *   jobId?: string;
 *   stageName?: string;
 *   contentType: 'text' | 'link';
 *   title: string;
 *   body?: string;
 *   url?: string;
 *   sortOrder?: number;
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@/lib/supabase/server";
import { getAgencyContext }          from "@/lib/supabase/agency-cache";
import { checkCsrf }                 from "@/lib/csrf";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const ctx      = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const candidateId = searchParams.get("candidateId");
  const jobId       = searchParams.get("jobId");

  if (!candidateId) {
    return NextResponse.json({ error: "candidateId is required" }, { status: 400 });
  }

  let query = supabase
    .from("prep_content")
    .select("*")
    .eq("agency_id", ctx.agencyId)
    .eq("candidate_id", candidateId)
    .order("sort_order");

  if (jobId) query = query.eq("job_id", jobId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: NextRequest) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const ctx      = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { candidateId, jobId, stageName, contentType, title, body: text, url, sortOrder } = body as {
    candidateId?:  string;
    jobId?:        string;
    stageName?:    string;
    contentType?:  string;
    title?:        string;
    body?:         string;
    url?:          string;
    sortOrder?:    number;
  };

  if (!candidateId || !title || !contentType) {
    return NextResponse.json({ error: "candidateId, title, contentType are required" }, { status: 400 });
  }
  if (!["text", "link"].includes(contentType)) {
    return NextResponse.json({ error: "contentType must be text or link" }, { status: 400 });
  }

  const insert: Record<string, unknown> = {
    agency_id:    ctx.agencyId,
    candidate_id: candidateId,
    content_type: contentType,
    title,
    sort_order:   sortOrder ?? 0,
    created_by:   ctx.userId,
  };
  if (jobId)     insert.job_id     = jobId;
  if (stageName) insert.stage_name = stageName;
  if (text)      insert.body       = text;
  if (url)       insert.url        = url;

  const { data, error } = await supabase
    .from("prep_content")
    .insert(insert)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ item: data }, { status: 201 });
}
