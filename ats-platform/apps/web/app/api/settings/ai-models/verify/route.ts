/**
 * POST /api/settings/ai-models/verify
 * Tests whether the agency's configured Anthropic key works.
 * Sends a minimal single-token request — ~$0.000001 cost.
 *
 * US-441: BYO AI Model Configuration.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@/lib/supabase/server";
import { getAgencyContext }           from "@/lib/supabase/agency-cache";
import { checkCsrf }                  from "@/lib/csrf";
import { getAIClient }                from "@/lib/ai/client";

export async function POST(req: NextRequest) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const ctx      = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const ai = getAIClient({ agencyId: ctx.agencyId, userId: ctx.userId, operation: "key_verify" });
    await ai.messages.create({
      model:      "claude-haiku-4-5-20251001",  // cheapest model for validation
      max_tokens: 5,
      messages:   [{ role: "user", content: "Say OK" }],
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 200 });
  }
}
