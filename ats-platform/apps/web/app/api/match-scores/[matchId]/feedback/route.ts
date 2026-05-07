/**
 * POST   /api/match-scores/[matchId]/feedback  — vote thumbs up/down on a score
 * DELETE /api/match-scores/[matchId]/feedback  — retract the current user's vote
 * GET    /api/match-scores/[matchId]/feedback  — read rollup + current user's vote
 *
 * US-110: Recruiters give explicit signal on whether the AI match score felt
 * right. We store one vote per (match_score_id, user_id) so each recruiter's
 * opinion counts once and can be retracted/flipped. Reason is an optional
 * free-text note ("weights skills too heavily", "location gap is a dealbreaker")
 * that a future reranker-training job can attend to.
 *
 * RLS on `ai_match_score_feedback` scopes all reads/writes to the caller's
 * agency — cross-tenant feedback is impossible.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@/lib/supabase/server";
import { checkCsrf }                 from "@/lib/csrf";

type Vote = -1 | 1;

interface FeedbackBody {
  rating?:  number;
  reason?:  string;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { matchId } = await params;

  const [rollupRes, meRes] = await Promise.all([
    supabase
      .from("ai_match_score_feedback_rollup")
      .select("vote_count, avg_rating, thumbs_up, thumbs_down")
      .eq("match_score_id", matchId)
      .maybeSingle(),
    supabase
      .from("ai_match_score_feedback")
      .select("id, rating, reason, created_at")
      .eq("match_score_id", matchId)
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const rollup = rollupRes.data;
  return NextResponse.json({
    matchScoreId: matchId,
    voteCount:    rollup ? Number(rollup.vote_count ?? 0) : 0,
    avgRating:    rollup ? Number(rollup.avg_rating ?? 0) : 0,
    thumbsUp:     rollup ? Number(rollup.thumbs_up ?? 0)  : 0,
    thumbsDown:   rollup ? Number(rollup.thumbs_down ?? 0): 0,
    myVote:       meRes.data
      ? {
          rating:    Number((meRes.data as { rating: number }).rating) as Vote,
          reason:    (meRes.data as { reason: string | null }).reason ?? null,
          createdAt: (meRes.data as { created_at: string }).created_at,
        }
      : null,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { matchId } = await params;
  const body = (await req.json().catch(() => ({}))) as FeedbackBody;

  const rating = body.rating;
  if (rating !== -1 && rating !== 1) {
    return NextResponse.json(
      { error: "rating must be -1 (thumbs down) or 1 (thumbs up)" },
      { status: 400 },
    );
  }
  const reason = typeof body.reason === "string" ? body.reason.slice(0, 1000) : null;

  // Need the agency_id of the match score to satisfy the INSERT WITH CHECK
  // policy; RLS will also reject this if the score is cross-tenant.
  const { data: score } = await supabase
    .from("ai_match_scores")
    .select("id, agency_id")
    .eq("id", matchId)
    .maybeSingle();

  if (!score) return NextResponse.json({ error: "Score not found" }, { status: 404 });

  const { data: vote, error } = await supabase
    .from("ai_match_score_feedback")
    .upsert(
      {
        agency_id:      (score as { agency_id: string }).agency_id,
        match_score_id: matchId,
        user_id:        user.id,
        rating,
        reason,
      },
      { onConflict: "match_score_id,user_id" },
    )
    .select("id, rating, reason, created_at")
    .single();

  if (error) {
    console.error("[match-scores/:id/feedback] upsert failed:", error);
    return NextResponse.json({ error: "Feedback save failed" }, { status: 500 });
  }

  return NextResponse.json({
    id:        (vote as { id: string }).id,
    rating:    Number((vote as { rating: number }).rating) as Vote,
    reason:    (vote as { reason: string | null }).reason,
    createdAt: (vote as { created_at: string }).created_at,
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { matchId } = await params;

  const { error } = await supabase
    .from("ai_match_score_feedback")
    .delete()
    .eq("match_score_id", matchId)
    .eq("user_id", user.id);

  if (error) {
    console.error("[match-scores/:id/feedback] delete failed:", error);
    return NextResponse.json({ error: "Retract vote failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
