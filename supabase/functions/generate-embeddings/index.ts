/**
 * Edge Function: generate-embeddings
 *
 * Generates OpenAI vector embeddings for a candidate or job and writes them
 * to the inline embedding columns (candidates.embedding, jobs.embedding).
 * Also upserts into candidate_embeddings / job_embeddings tables and computes
 * ai_match_scores when both embeddings are available.
 *
 * Expected POST body:
 *   { candidate_id: string }
 *   { job_id: string }
 *   { candidate_id: string; job_id: string }  -- generates both + match score
 *
 * Required secrets:
 *   OPENAI_API_KEY
 *   SUPABASE_URL          (auto-populated)
 *   SUPABASE_SERVICE_ROLE_KEY (auto-populated)
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";
const OPENAI_API_URL         = "https://api.openai.com/v1/embeddings";

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface RequestBody {
  candidate_id?: string;
  job_id?:       string;
}

// ── OpenAI helper ──────────────────────────────────────────────────────────────

async function getEmbedding(text: string, apiKey: string): Promise<number[]> {
  const res = await fetch(OPENAI_API_URL, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: OPENAI_EMBEDDING_MODEL, input: text.slice(0, 8000) }),
  });
  if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.data[0].embedding as number[];
}

// ── Text builders ──────────────────────────────────────────────────────────────

function candidateToText(c: Record<string, unknown>): string {
  const parts: string[] = [];
  if (c.first_name && c.last_name) parts.push(`${c.first_name} ${c.last_name}`);
  if (c.current_title)   parts.push(c.current_title as string);
  if (c.current_company) parts.push(`at ${c.current_company as string}`);
  if (c.location)        parts.push(c.location as string);
  if (c.summary)         parts.push(c.summary as string);
  const skills = (c.skills as string[] | null) ?? [];
  if (skills.length > 0) parts.push(`Skills: ${skills.join(", ")}`);
  if (c.resume_text)     parts.push(c.resume_text as string);
  return parts.join(". ");
}

function jobToText(j: Record<string, unknown>): string {
  return [j.title, j.description, j.requirements, j.location]
    .filter(Boolean)
    .join(". ");
}

// ── Cosine similarity ──────────────────────────────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  return (na === 0 || nb === 0) ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function similarityToScore(sim: number): number {
  return Math.round(((sim + 1) / 2) * 100);
}

// ── Main handler ───────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const { candidate_id, job_id } = body;

  if (!candidate_id && !job_id) {
    return new Response(
      JSON.stringify({ error: "candidate_id or job_id required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    let candidateEmbedding: number[] | null = null;
    let jobEmbedding:       number[] | null = null;
    let agencyId:           string  | null = null;

    // ── Candidate ──────────────────────────────────────────────────────────────
    if (candidate_id) {
      const { data: cand, error } = await db
        .from("candidates")
        .select("id, agency_id, first_name, last_name, current_title, current_company, location, summary, skills, resume_text")
        .eq("id", candidate_id)
        .single();

      if (error || !cand) throw new Error(`Candidate ${candidate_id} not found`);
      agencyId = cand.agency_id;

      const text = candidateToText(cand as Record<string, unknown>);
      candidateEmbedding = await getEmbedding(text, apiKey);
      const embeddingStr = `[${candidateEmbedding.join(",")}]`;

      await db.from("candidates").update({ embedding: embeddingStr }).eq("id", candidate_id);

      await db.from("candidate_embeddings").upsert({
        candidate_id,
        agency_id:    agencyId,
        embedding:    embeddingStr,
        model:        OPENAI_EMBEDDING_MODEL,
        generated_at: new Date().toISOString(),
      }, { onConflict: "candidate_id" });

      await db.from("embedding_jobs").update({
        status: "done",
        completed_at: new Date().toISOString(),
      }).eq("entity_type", "candidates").eq("entity_id", candidate_id);
    }

    // ── Job ────────────────────────────────────────────────────────────────────
    if (job_id) {
      const { data: job, error } = await db
        .from("jobs")
        .select("id, agency_id, title, description, requirements, location")
        .eq("id", job_id)
        .single();

      if (error || !job) throw new Error(`Job ${job_id} not found`);
      if (!agencyId) agencyId = job.agency_id;

      const text = jobToText(job as Record<string, unknown>);
      jobEmbedding = await getEmbedding(text, apiKey);
      const embeddingStr = `[${jobEmbedding.join(",")}]`;

      await db.from("jobs").update({ embedding: embeddingStr }).eq("id", job_id);

      await db.from("job_embeddings").upsert({
        job_id,
        agency_id:    agencyId,
        embedding:    embeddingStr,
        model:        OPENAI_EMBEDDING_MODEL,
        generated_at: new Date().toISOString(),
      }, { onConflict: "job_id" });

      await db.from("embedding_jobs").update({
        status: "done",
        completed_at: new Date().toISOString(),
      }).eq("entity_type", "jobs").eq("entity_id", job_id);
    }

    // ── Match score (when both present) ───────────────────────────────────────
    if (candidate_id && job_id && candidateEmbedding && jobEmbedding && agencyId) {
      const score = similarityToScore(cosineSimilarity(candidateEmbedding, jobEmbedding));
      await db.from("ai_match_scores").upsert({
        agency_id:    agencyId,
        candidate_id,
        job_id,
        score,
        computed_at:  new Date().toISOString(),
      }, { onConflict: "candidate_id,job_id" });
    } else if (candidate_id && candidateEmbedding && agencyId) {
      // Score against all jobs with embeddings in this agency
      const { data: jobEmbs } = await db
        .from("job_embeddings")
        .select("job_id, embedding")
        .eq("agency_id", agencyId);

      if (jobEmbs && jobEmbs.length > 0) {
        const scores = (jobEmbs as { job_id: string; embedding: number[] | string }[]).map((je) => {
          const jEmb  = typeof je.embedding === "string"
            ? JSON.parse(je.embedding) as number[]
            : je.embedding;
          const score = similarityToScore(cosineSimilarity(candidateEmbedding!, jEmb));
          return {
            agency_id:    agencyId!,
            candidate_id,
            job_id:       je.job_id,
            score,
            computed_at:  new Date().toISOString(),
          };
        });
        await db.from("ai_match_scores").upsert(scores, { onConflict: "candidate_id,job_id" });
      }
    }

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (err) {
    console.error("[generate-embeddings]", err);

    if (candidate_id) {
      await db.from("embedding_jobs").update({
        status: "error",
        error:  String(err),
        completed_at: new Date().toISOString(),
      }).eq("entity_type", "candidates").eq("entity_id", candidate_id);
    }
    if (job_id) {
      await db.from("embedding_jobs").update({
        status: "error",
        error:  String(err),
        completed_at: new Date().toISOString(),
      }).eq("entity_type", "jobs").eq("entity_id", job_id);
    }

    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
