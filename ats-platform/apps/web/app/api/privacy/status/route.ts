/**
 * GET /api/privacy/status?token=xxx — US-353
 * Public endpoint — check request status by token.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

  const supabase = await createClient();
  const { data } = await supabase
    .from("privacy_requests")
    .select("status, request_type, created_at, completed_at")
    .eq("status_token", token)
    .single();

  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    status:      data.status,
    requestType: data.request_type,
    submittedAt: data.created_at,
    completedAt: data.completed_at,
  });
}
