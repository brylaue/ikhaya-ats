/**
 * Cron endpoint — renews expiring Gmail / Graph realtime subscriptions.
 *
 * Must be called with Authorization: Bearer $CRON_SECRET
 * (set the same secret in your cron scheduler, e.g. Vercel Cron / GitHub Actions).
 *
 * Stage 8.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { refreshExpiredSubscriptions } from "@/lib/email/subscription-refresher";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const cronSecret  = process.env.CRON_SECRET!;

export async function POST(request: NextRequest) {
  // Validate CRON_SECRET bearer token
  const authHeader = request.headers.get("authorization");
  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
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
