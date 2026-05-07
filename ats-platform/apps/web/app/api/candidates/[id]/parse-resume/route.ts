/**
 * POST /api/candidates/[id]/parse-resume
 * US-380: Async resume parser pipeline.
 *
 * Accepts a multipart/form-data upload with a "file" field (PDF or DOCX).
 * Extracts raw text, sends to Claude for structured extraction, then
 * writes the parsed fields back to the candidate record.
 *
 * Returns: { parsed: ParsedResume; updated: boolean }
 *
 * Supported formats: .pdf (basic text extraction), .docx (mammoth)
 * For scanned PDFs without text layer, returns a partial result.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient }              from "@/lib/supabase/server";
import { createClient as svc }       from "@supabase/supabase-js";
import { callClaude, AiRateLimitError } from "@/lib/ai/client";
import { recordAiDecision, describeDecision } from "@/lib/ai/decision-log";
import { getAgencyContext }          from "@/lib/supabase/agency-cache";
import { checkCsrf }                 from "@/lib/csrf";
import { requirePlan }               from "@/lib/api/require-plan";
import { sanitizeForPrompt }         from "@/lib/ai/sanitize";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export interface ParsedResume {
  firstName?:      string;
  lastName?:       string;
  currentTitle?:   string;
  currentCompany?: string;
  location?:       string;
  email?:          string;
  phone?:          string;
  summary?:        string;
  skills?:         string[];
  yearsExperience?: number;
}

const CLAUDE_SYSTEM = `You are a precise resume parser. Extract structured data from the provided resume text.
Return ONLY valid JSON matching this exact schema — no markdown, no extra keys:
{
  "firstName": string | null,
  "lastName": string | null,
  "currentTitle": string | null,       // Most recent job title
  "currentCompany": string | null,     // Most recent employer
  "location": string | null,           // City, State or City, Country
  "email": string | null,
  "phone": string | null,
  "summary": string | null,            // 2-3 sentence professional summary (write one if absent)
  "skills": string[],                  // Deduplicated list of technical/professional skills
  "yearsExperience": number | null     // Total years of professional experience (estimate if unclear)
}
Be conservative with yearsExperience — only estimate if there's enough date information.
For skills, include only real skills (not soft skills like "communication").`;

// ── Text extractors ───────────────────────────────────────────────────────────

async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
  // Dynamic import — pdf-parse is a CommonJS module
  // We use a minimal approach: look for text streams in the raw PDF bytes
  // For production: use pdf-parse or @mozilla/pdf.js on the server
  const bytes = new Uint8Array(buffer);
  const text  = new TextDecoder("latin1").decode(bytes);

  // Extract readable text content from PDF streams (handles text-layer PDFs)
  const streamMatches = text.match(/stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g) ?? [];
  const readable = streamMatches
    .map((s) => s.replace(/stream[\r\n]+/, "").replace(/[\r\n]+endstream/, ""))
    .join(" ")
    .replace(/[^\x20-\x7E\n]/g, " ")  // strip non-printable
    .replace(/\s+/g, " ")
    .trim();

  // Fallback: extract any printable ASCII sequences
  if (readable.length < 100) {
    return text.replace(/[^\x20-\x7E\n]/g, " ").replace(/\s+/g, " ").trim();
  }

  return readable;
}

async function extractDocxText(buffer: ArrayBuffer): Promise<string> {
  try {
    // mammoth is available as a pkg dep — try dynamic import
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mammoth = require("mammoth");
    const result  = await mammoth.extractRawText({ buffer });
    return result.value as string;
  } catch {
    // fallback: read raw XML from the DOCX zip
    const bytes = new Uint8Array(buffer);
    const text  = new TextDecoder().decode(bytes);
    return text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // US-503: CSRF guard on state-changing route.
  const csrfError = checkCsrf(req);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const ctx      = await getAgencyContext(supabase);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // US-499: plan gate — AI resume parsing is a Growth feature. Starter
  // plans can still import candidates manually; AI extraction requires
  // a paid tier so we can cover the token cost.
  const planGuard = await requirePlan(supabase, ctx.agencyId, "ai_resume_parser");
  if (planGuard) return planGuard;

  const { id } = await params;

  // Verify candidate belongs to user's agency
  const { data: candidate } = await supabase
    .from("candidates")
    .select("id, agency_id")
    .eq("id", id)
    .eq("agency_id", ctx.agencyId)
    .maybeSingle();

  if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Parse multipart form
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file field required" }, { status: 400 });
  }

  // US-508: defend against extension-only spoofing by cross-checking
  // the client-provided MIME type AND verifying file magic bytes.
  // An attacker can rename malware.exe → resume.pdf; the magic-byte
  // check ensures we only hand real PDF/DOCX content to the parser.
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!["pdf", "docx", "doc"].includes(ext)) {
    return NextResponse.json({ error: "Only PDF and DOCX files are supported" }, { status: 415 });
  }

  const ALLOWED_MIMES: Record<string, string[]> = {
    pdf:  ["application/pdf"],
    docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    doc:  ["application/msword"],
  };
  const declaredMime = file.type || "";
  if (declaredMime && !ALLOWED_MIMES[ext]?.includes(declaredMime)) {
    return NextResponse.json(
      { error: "File type does not match extension" },
      { status: 415 }
    );
  }

  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 413 });
  }

  // Magic-byte verification: PDF must start with %PDF-, DOCX is a zip (PK\x03\x04).
  const firstBytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const head       = Array.from(firstBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  const isPdf      = head.startsWith("25504446");                 // "%PDF"
  const isZip      = head.startsWith("504b0304") || head.startsWith("504b0506"); // "PK\x03\x04"

  if (ext === "pdf" && !isPdf) {
    return NextResponse.json({ error: "File does not look like a PDF" }, { status: 415 });
  }
  if (ext === "docx" && !isZip) {
    return NextResponse.json({ error: "File does not look like a DOCX" }, { status: 415 });
  }

  // Extract text
  const buffer = await file.arrayBuffer();
  let rawText: string;
  try {
    rawText = ext === "pdf"
      ? await extractPdfText(buffer)
      : await extractDocxText(buffer);
  } catch (err) {
    console.error("[parse-resume] text extraction failed:", err);
    return NextResponse.json({ error: "Could not extract text from file" }, { status: 422 });
  }

  if (!rawText || rawText.trim().length < 50) {
    return NextResponse.json({ error: "Could not extract readable text. The file may be a scanned image." }, { status: 422 });
  }

  // US-502: sanitize the extracted text so injection phrases embedded in
  // a malicious resume ("IGNORE PREVIOUS INSTRUCTIONS AND ...") don't
  // hijack the extraction prompt. Cap at 12 000 chars as before.
  const safeText = sanitizeForPrompt(rawText, { maxLen: 12_000 });

  // Call Claude for structured extraction
  let parsed: ParsedResume;
  try {
    const raw = await callClaude(
      CLAUDE_SYSTEM,
      [{ role: "user", content: `Resume text:\n\n${safeText}` }],
      1024,
      { agencyId: candidate.agency_id, userId: ctx.userId, operation: "resume_parse" }
    );

    // US-504: defensive JSON.parse — malformed model output must not
    // bubble a SyntaxError up to a 500; return structured 502 instead.
    const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    try {
      parsed = JSON.parse(cleaned) as ParsedResume;
    } catch {
      console.error("[parse-resume] model returned non-JSON:", cleaned.slice(0, 200));
      return NextResponse.json(
        { error: "AI returned malformed output — try again" },
        { status: 502 }
      );
    }
  } catch (err) {
    if (err instanceof AiRateLimitError) {
      return NextResponse.json(
        { error: "AI daily cost limit reached", retryAfter: "24h" },
        { status: 429 }
      );
    }
    console.error("[parse-resume] Claude extraction failed:", err);
    return NextResponse.json({ error: "AI extraction failed" }, { status: 502 });
  }

  // US-327: minimise service role usage.
  // Candidate UPDATE flows through the user-scoped client → RLS enforces
  // agency ownership. Only system-table writes (audit_events, embedding_jobs)
  // require elevated privileges, so the service client is scoped to those.
  const updates: Record<string, unknown> = {};
  if (parsed.currentTitle)   updates.current_title   = parsed.currentTitle;
  if (parsed.currentCompany) updates.current_company = parsed.currentCompany;
  if (parsed.location)       updates.location        = parsed.location;
  if (parsed.summary)        updates.summary         = parsed.summary;
  if (parsed.skills?.length) updates.skills          = parsed.skills;
  if (parsed.yearsExperience != null) updates.years_experience = parsed.yearsExperience;
  if (parsed.email)          updates.email           = parsed.email;
  if (parsed.phone)          updates.phone           = parsed.phone;

  let updated = false;
  if (Object.keys(updates).length > 0) {
    const { error } = await supabase
      .from("candidates")
      .update(updates)
      .eq("id", id);
    updated = !error;
    if (error) console.error("[parse-resume] DB update failed:", error);
  }

  // Service role only for system tables (no user-facing RLS)
  const db = svc(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  // Audit log
  await db.from("audit_events").insert({
    actor_id:  ctx.userId,
    action:    "candidate.resume_parsed",
    resource:  `candidate:${id}`,
    metadata:  { file_name: file.name, fields_extracted: Object.keys(updates), updated },
  }).maybeSingle();

  // Queue embedding refresh now that candidate text has changed
  if (updated) {
    await db.from("embedding_jobs").upsert({
      entity_type: "candidates",
      entity_id:   id,
      status:      "pending",
      queued_at:   new Date().toISOString(),
    }, { onConflict: "entity_type,entity_id" });
  }

  // US-422: AI decision log — candidate-visible because it altered the
  // record the candidate's portal shows. Input hash uses filename + size
  // rather than file bytes (avoids PII persistence).
  void recordAiDecision({
    agencyId:           candidate.agency_id,
    userId:             ctx.userId,
    type:               "resume_parse",
    subject:            { type: "candidate", id },
    provider:           "anthropic",
    model:              "claude-sonnet-4-6",
    rationale:          describeDecision("resume_parse"),
    inputPayload:       { fileName: file.name, fileSize: file.size, fieldsUpdated: Object.keys(updates) },
    visibleToCandidate: true,
  });

  return NextResponse.json({ parsed, updated });
}
