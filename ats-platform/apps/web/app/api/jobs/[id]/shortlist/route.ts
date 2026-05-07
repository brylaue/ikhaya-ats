/**
 * POST /api/jobs/[id]/shortlist
 * US-384: AI Shortlist Compiler — ranked candidate package.
 *
 * Compiles a ranked shortlist for a job by:
 * 1. Fetching top candidates from ai_match_scores ordered by score DESC.
 * 2. Calling Claude to write a 2–3 sentence profile summary per candidate
 *    tailored to the job description.
 * 3. Returning the ranked list with AI summaries + optional markdown export.
 *
 * Body: { candidateIds?: string[]; limit?: number }
 *   - candidateIds: override default (uses top by score if omitted)
 *   - limit: max candidates to include (default 8, max 20)
 *
 * Returns: { shortlist: ShortlistEntry[]; markdown: string; jobTitle: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@/lib/supabase/server";
import { createClient as svc }       from "@supabase/supabase-js";
import { callClaude, AiRateLimitError } from "@/lib/ai/client";
import { checkCsrf }                 from "@/lib/csrf";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export interface ShortlistEntry {
  rank:           number;
  candidateId:    string;
  fullName:       string;
  currentTitle:   string | null;
  currentCompany: string | null;
  location:       string | null;
  skills:         string[];
  score:          number;          // 0–100 AI match score
  aiSummary:      string;          // Claude-written tailored summary
}

const BATCH_SYSTEM = `You are a senior executive recruiter writing a structured candidate shortlist
for a hiring manager. For each candidate provided, write a tailored 2–3 sentence profile summary
that explains WHY this person is a strong fit for the specific role described.

Be specific — reference actual titles, companies, skills, and experience from the candidate data.
Keep each summary punchy and hiring-manager friendly. No fluff, no generic phrases.

Return ONLY valid JSON — an array of objects in this exact shape:
[
  { "candidateId": string, "summary": string },
  ...
]`;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: userRow } = await supabase
    .from("users").select("agency_id").eq("id", user.id).single();
  const agencyId = userRow?.agency_id;
  if (!agencyId) return NextResponse.json({ error: "No agency" }, { status: 403 });

  const { id: jobId } = await params;
  const body = await req.json().catch(() => ({}));
  const { candidateIds, limit = 8 } = body as { candidateIds?: string[]; limit?: number };
  const safeLimit = Math.min(limit, 20);

  // Verify job belongs to this agency
  const { data: job } = await supabase
    .from("jobs")
    .select("id, title, description, location, company_id, companies(name)")
    .eq("id", jobId)
    .eq("agency_id", agencyId)
    .single();

  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const db = svc(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  // ── Resolve candidate list ─────────────────────────────────────────────────
  let candidateIdList: string[] = candidateIds ?? [];
  const scoreMap = new Map<string, number>();

  if (candidateIdList.length === 0) {
    // Use top candidates by AI match score
    const { data: scores } = await db
      .from("ai_match_scores")
      .select("candidate_id, score")
      .eq("job_id", jobId)
      .order("score", { ascending: false })
      .limit(safeLimit);

    candidateIdList = (scores ?? []).map((s) => s.candidate_id);
    (scores ?? []).forEach((s) => scoreMap.set(s.candidate_id, Number(s.score)));
  } else {
    // Caller provided specific IDs — fetch their scores too
    candidateIdList = candidateIdList.slice(0, safeLimit);
    const { data: scores } = await db
      .from("ai_match_scores")
      .select("candidate_id, score")
      .eq("job_id", jobId)
      .in("candidate_id", candidateIdList);
    (scores ?? []).forEach((s) => scoreMap.set(s.candidate_id, Number(s.score)));
  }

  if (candidateIdList.length === 0) {
    return NextResponse.json({
      shortlist: [],
      markdown: `# Shortlist — ${job.title}\n\nNo candidates with AI match scores yet. Run the embedding backfill first.`,
      jobTitle: job.title,
    });
  }

  // Hydrate candidate details
  const { data: candidates } = await db
    .from("candidates")
    .select("id, full_name, current_title, current_company, location, skills, years_experience, summary")
    .in("id", candidateIdList);

  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ error: "Could not fetch candidate data" }, { status: 500 });
  }

  // ── Call Claude for tailored summaries ────────────────────────────────────
  const jd = [
    `Job: ${job.title}`,
    (job.companies as { name: string } | null)?.name ? `Company: ${(job.companies as { name: string }).name}` : null,
    job.location ? `Location: ${job.location}` : null,
    job.description ? `Description: ${job.description.slice(0, 1000)}` : null,
  ].filter(Boolean).join("\n");

  const candidateBlocks = candidates.map((c) => {
    const skills = Array.isArray(c.skills) ? (c.skills as string[]).slice(0, 10).join(", ") : "";
    return [
      `Candidate ID: ${c.id}`,
      `Name: ${c.full_name}`,
      c.current_title ? `Title: ${c.current_title}` : null,
      c.current_company ? `Company: ${c.current_company}` : null,
      c.location ? `Location: ${c.location}` : null,
      c.years_experience ? `Experience: ${c.years_experience} years` : null,
      skills ? `Skills: ${skills}` : null,
      c.summary ? `Bio: ${c.summary.slice(0, 300)}` : null,
    ].filter(Boolean).join("\n");
  }).join("\n\n---\n\n");

  let summaryMap = new Map<string, string>();
  try {
    const raw = await callClaude(
      BATCH_SYSTEM,
      [{ role: "user", content: `${jd}\n\n===CANDIDATES===\n\n${candidateBlocks}` }],
      2048,
      { agencyId, userId: user.id, operation: "shortlist_compile" }
    );
    const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    const parsed = JSON.parse(cleaned) as { candidateId: string; summary: string }[];
    parsed.forEach((p) => summaryMap.set(p.candidateId, p.summary));
  } catch (err) {
    if (err instanceof AiRateLimitError) {
      return NextResponse.json(
        { error: "AI daily cost limit reached", retryAfter: "24h" },
        { status: 429 }
      );
    }
    console.error("[shortlist] Claude call failed:", err);
    // Fall back to generic summaries so we still return data
    candidates.forEach((c) => {
      summaryMap.set(c.id, `${c.full_name} brings ${c.years_experience ?? "several"} years of experience as ${c.current_title ?? "a professional"}.`);
    });
  }

  // ── Build ranked shortlist ────────────────────────────────────────────────
  const shortlist: ShortlistEntry[] = candidates
    .sort((a, b) => (scoreMap.get(b.id) ?? 0) - (scoreMap.get(a.id) ?? 0))
    .map((c, i) => ({
      rank:           i + 1,
      candidateId:    c.id,
      fullName:       c.full_name,
      currentTitle:   c.current_title ?? null,
      currentCompany: c.current_company ?? null,
      location:       c.location ?? null,
      skills:         Array.isArray(c.skills) ? (c.skills as string[]).slice(0, 8) : [],
      score:          scoreMap.get(c.id) ?? 0,
      aiSummary:      summaryMap.get(c.id) ?? "",
    }));

  // ── Generate markdown export ──────────────────────────────────────────────
  const companyName = (job.companies as { name: string } | null)?.name;
  const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const markdown = [
    `# Candidate Shortlist — ${job.title}`,
    companyName ? `**Client:** ${companyName}` : null,
    job.location ? `**Location:** ${job.location}` : null,
    `**Compiled:** ${dateStr}`,
    `**Candidates:** ${shortlist.length}`,
    "",
    "---",
    "",
    ...shortlist.map((e) => [
      `## ${e.rank}. ${e.fullName}`,
      `**Match Score:** ${e.score}%`,
      e.currentTitle && e.currentCompany ? `**Current:** ${e.currentTitle} at ${e.currentCompany}` : e.currentTitle ? `**Title:** ${e.currentTitle}` : null,
      e.location ? `**Location:** ${e.location}` : null,
      e.skills.length > 0 ? `**Skills:** ${e.skills.join(", ")}` : null,
      "",
      e.aiSummary,
      "",
      "---",
      "",
    ].filter((l) => l !== null).join("\n")),
  ].filter((l) => l !== null).join("\n");

  // Audit log
  await db.from("audit_events").insert({
    actor_id: user.id,
    action:   "job.shortlist_compiled",
    resource: `job:${jobId}`,
    metadata: { candidate_count: shortlist.length, job_title: job.title },
  }).maybeSingle();

  return NextResponse.json({ shortlist, markdown, jobTitle: job.title });
}
