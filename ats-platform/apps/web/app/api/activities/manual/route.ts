/**
 * POST /api/activities/manual
 * US-054: Manual call / meeting activity log.
 *
 * Writes an `activities` row with type in ('call','meeting') and stashes
 * direction/duration/outcome/participants/transcript_id in the metadata JSONB
 * so timeline renderers can pull them back out.
 *
 * Deliberately NOT a dialer — we don't attempt VoIP, Twilio, or recording.
 * This is the "I just had a call, log it" button. Mobile-friendly payload.
 *
 * Body:
 *   { entity_type: 'candidate'|'job'|'application'|'client',
 *     entity_id:   uuid,
 *     type:        'call'|'meeting',
 *     direction:   'inbound'|'outbound',
 *     summary:     string (required, <= 4000),
 *     outcome:     'connected'|'voicemail'|'left_message'|'no_answer'|'completed' (optional),
 *     duration_min: number (optional),
 *     happened_at: ISO timestamp (optional, defaults to now),
 *     participants: string[] (optional, freetext names/emails),
 *     transcript_id: uuid (optional, links to US-135 meeting transcripts) }
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAgencyContext } from "@/lib/supabase/agency-cache";
import { checkCsrf } from "@/lib/csrf";

const ENTITY_TYPES  = ["candidate","job","application","client"] as const;
const ACTIVITY_TYPES = ["call","meeting"] as const;
const DIRECTIONS    = ["inbound","outbound"] as const;
const OUTCOMES      = ["connected","voicemail","left_message","no_answer","completed"] as const;

export async function POST(req: NextRequest) {
  const csrfError = checkCsrf(req); if (csrfError) return csrfError;
  const supabase = await createClient();
  const ctx = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const b = await req.json().catch(() => ({})) as Record<string, unknown>;
  if (typeof b.entity_type !== "string" || !(ENTITY_TYPES as readonly string[]).includes(b.entity_type))
    return NextResponse.json({ error: "Invalid entity_type" }, { status: 400 });
  if (typeof b.entity_id !== "string" || b.entity_id.length < 30)
    return NextResponse.json({ error: "Invalid entity_id" }, { status: 400 });
  if (typeof b.type !== "string" || !(ACTIVITY_TYPES as readonly string[]).includes(b.type))
    return NextResponse.json({ error: "type must be 'call' or 'meeting'" }, { status: 400 });
  if (typeof b.direction !== "string" || !(DIRECTIONS as readonly string[]).includes(b.direction))
    return NextResponse.json({ error: "Invalid direction" }, { status: 400 });
  if (typeof b.summary !== "string" || b.summary.trim().length === 0)
    return NextResponse.json({ error: "summary required" }, { status: 400 });

  const metadata: Record<string, unknown> = {
    direction:    b.direction,
    outcome:      typeof b.outcome === "string" && (OUTCOMES as readonly string[]).includes(b.outcome) ? b.outcome : null,
    duration_min: typeof b.duration_min === "number" && b.duration_min >= 0 && b.duration_min < 24*60 ? b.duration_min : null,
    happened_at:  typeof b.happened_at === "string" ? b.happened_at : new Date().toISOString(),
    participants: Array.isArray(b.participants)
      ? b.participants.filter((x): x is string => typeof x === "string").slice(0, 50).map((s) => s.slice(0, 200))
      : null,
    transcript_id: typeof b.transcript_id === "string" ? b.transcript_id : null,
  };

  const { data, error } = await supabase
    .from("activities")
    .insert({
      org_id:      ctx.agencyId,  // 'org_id' is the legacy column name; see hooks.ts
      entity_type: b.entity_type,
      entity_id:   b.entity_id,
      actor_id:    ctx.userId,
      type:        b.type,
      summary:     (b.summary as string).slice(0, 4000),
      metadata,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ activity: data });
}
