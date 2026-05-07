/**
 * Cron endpoint — renews expiring Gmail / Graph realtime subscriptions.
 *
 * Runs every 6 hours. Protected by CRON_SECRET.
 *
 * Stage 8.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { refreshExpiredSubscriptions } from "@/lib/email/subscription-refresher";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest) {
  // US-319: fail closed — missing/empty CRON_SECRET must never allow access
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    // US-336: keep ticket refs out of runtime log output
    console.error("[cron/refresh-subscriptions] CRON_SECRET is not set — refusing all requests");
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const authHeader = request.headers.get("authorization");
  const vercelCron = request.headers.get("x-vercel-cron");

  if (vercelCron !== cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { renewed, errors } = await refreshExpiredSubscriptions(supabase);

    return NextResponse.json(
      { status: "done", renewed, errors },
      { status: 200 }
    );
  } catch (error) {
    console.error("refresh-subscriptions: unhandled error:", error);
    return NextResponse.json(
      { error: "Subscription refresh failed" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
