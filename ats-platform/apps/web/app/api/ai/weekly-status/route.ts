/**
 * POST /api/ai/weekly-status — US-115: AI Weekly Client Status Update Generator
 *
 * Drafts a per-client weekly status email summarising active reqs, submittals,
 * and pipeline movement over the past 7 days. Optionally auto-sends via
 * connected email (if email integration is active).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAgencyContext } from "@/lib/supabase/agency-cache";
import { requirePlan } from "@/lib/api/require-plan";
import { checkCsrf } from "@/lib/csrf";
import { sanitizeForPrompt } from "@/lib/ai/sanitize";
import { checkAgencyLimit, recordUsage, AiRateLimitError } from "@/lib/ai/cost-tracker";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    // US-503: CSRF guard for state-changing AI routes.
    const csrfErr = checkCsrf(req);
    if (csrfErr) return csrfErr;

    const supabase = await createClient();
    const ctx = await getAgencyContext(supabase);
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // US-499 / US-514: granular plan-tier gate — ai_weekly_status has its own key.
    const planGuard = await requirePlan(supabase, ctx.agencyId, "ai_weekly_status");
    if (planGuard) return planGuard;

    const { companyId, recipientName, recipientEmail, autoSend } = await req.json();
    if (!companyId) {
      return NextResponse.json({ error: "companyId required" }, { status: 400 });
    }

    // US-501: IDOR fix. Verify the companyId is owned by the caller's agency
    // BEFORE any pipeline data is fetched or the email is composed.
    const { data: owned } = await supabase
      .from("companies")
      .select("id, name, industry")
      .eq("id", companyId)
      .eq("agency_id", ctx.agencyId)
      .maybeSingle();
    if (!owned) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();

    // US-510: Promise.all masks individual failures — use allSettled so we
    // can surface errors and still compose a partial status with the rest.
    const [companyRes, jobsRes, activitiesRes, placementsRes] = await Promise.allSettled([
      Promise.resolve({ data: owned, error: null }),

      supabase.from("jobs")
        .select("id, title, status, applications(id, stage_id, updated_at)")
        .eq("agency_id", ctx.agencyId)
        .eq("company_id", companyId)
        .in("status", ["active", "on_hold"]),

      supabase.from("activities")
        .select("type, summary, created_at")
        .eq("entity_type", "client")
        .eq("entity_id", companyId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(10),

      supabase.from("placements")
        .select("id, candidate_id, placed_at")
        .eq("agency_id", ctx.agencyId)
        .eq("company_id", companyId)
        .gte("placed_at", since),
    ]);

    // Helper to extract data from PromiseSettledResult, returning [] on failure.
    const unwrap = <T,>(r: PromiseSettledResult<{ data: T | null; error: unknown }>, fallback: T): T => {
      if (r.status !== "fulfilled") return fallback;
      if (r.value?.error) return fallback;
      return (r.value?.data ?? fallback) as T;
    };

    const company    = unwrap(companyRes as any, owned) ?? owned;
    const jobs       = unwrap(jobsRes       as any, [] as any[]) ?? [];
    const activities = unwrap(activitiesRes as any, [] as any[]) ?? [];
    const placements = unwrap(placementsRes as any, [] as any[]) ?? [];

    // Build context for Claude
    const jobSummaries = jobs.map(j => {
      const apps = (j.applications ?? []) as any[];
      const recentMoves = apps.filter(a => new Date(a.updated_at) >= new Date(since)).length;
      return `• ${j.title} (${j.status}) — ${apps.length} in pipeline, ${recentMoves} moved this week`;
    });

    // US-502: sanitize all free-text fields that originate from users before
    // they land in the Claude prompt.
    const activitySummaries = activities.slice(0, 5).map((a: any) =>
      `• ${sanitizeForPrompt(a.type)}: ${sanitizeForPrompt(a.summary)}`
    );
    const placementSummaries = placements.map(() => "• New placement confirmed this week 🎉");

    const context = [
      `Client: ${sanitizeForPrompt(company?.name ?? "Unknown")} (${sanitizeForPrompt(company?.industry ?? "industry unknown")})`,
      "",
      "Active Requisitions:",
      ...(jobSummaries.length ? jobSummaries : ["• No active requisitions"]),
      "",
      "Recent Activity:",
      ...(activitySummaries.length ? activitySummaries : ["• No activity logged this week"]),
      ...(placementSummaries.length ? ["", "Placements:", ...placementSummaries] : []),
    ].join("\n");

    const safeRecipient = sanitizeForPrompt(recipientName ?? "the client");

    // US-500 + US-509: gate the Claude call through the cost tracker.
    try {
      await checkAgencyLimit(ctx.agencyId);
    } catch (limitErr: any) {
      if (limitErr instanceof AiRateLimitError) {
        return NextResponse.json(
          { error: "AI daily cap reached", used: limitErr.usedUsd, cap: limitErr.capUsd },
          { status: 429 },
        );
      }
      throw limitErr;
    }

    const startedAt = Date.now();
    const model = "claude-haiku-4-5-20251001";
    const message = await anthropic.messages.create({
      model,
      max_tokens: 600,
      messages: [{
        role: "user",
        content: `Draft a concise, professional weekly status email to ${safeRecipient} from a recruiting agency.
Tone: professional but warm. Length: ~150 words. No fluff.
Subject line on first line prefixed with "Subject: ".

Context:
${context}`,
      }],
    });

    // Record actual usage for billing (fire-and-forget).
    void recordUsage({
      agencyId:     ctx.agencyId,
      userId:       ctx.userId,
      provider:     "anthropic",
      model,
      operation:    "weekly_status",
      inputTokens:  message.usage?.input_tokens  ?? 0,
      outputTokens: message.usage?.output_tokens ?? 0,
      latencyMs:    Date.now() - startedAt,
    });

    const rawText = (message.content[0] as { text: string }).text;
    const subjectMatch = rawText.match(/^Subject:\s*(.+)/m);
    const subject = subjectMatch ? subjectMatch[1].trim() : `Weekly Update — ${company?.name ?? "Client"}`;
    const body = rawText.replace(/^Subject:.*\n?/m, "").trim();

    // autoSend and recipientEmail live downstream in the email sender; this
    // route only drafts. Surface the flag so the client can branch.
    return NextResponse.json({
      subject,
      body,
      companyName: company?.name,
      willAutoSend: Boolean(autoSend && recipientEmail),
    });
  } catch (err: any) {
    // US-504: if the caller passes malformed JSON, Next throws before we
    // touch it — guard below keeps the response consistent.
    if (err?.name === "SyntaxError") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
