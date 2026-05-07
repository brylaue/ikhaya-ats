/**
 * Shared resume-text extraction helpers (US-380).
 *
 * Lifted out of the original sync parse-resume route so the async enqueue
 * and the worker route can both reuse them without duplicating code.
 */

export async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
  // Minimal text-stream scan — works for PDFs with an embedded text layer,
  // returns whatever printable ASCII is in the file otherwise (so scanned
  // image PDFs yield a short string and the caller can 422 on length).
  const bytes = new Uint8Array(buffer);
  const text  = new TextDecoder("latin1").decode(bytes);

  const streamMatches = text.match(/stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g) ?? [];
  const readable = streamMatches
    .map((s) => s.replace(/stream[\r\n]+/, "").replace(/[\r\n]+endstream/, ""))
    .join(" ")
    .replace(/[^\x20-\x7E\n]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (readable.length < 100) {
    return text.replace(/[^\x20-\x7E\n]/g, " ").replace(/\s+/g, " ").trim();
  }
  return readable;
}

export async function extractDocxText(buffer: ArrayBuffer): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mammoth = require("mammoth");
    const result  = await mammoth.extractRawText({ buffer });
    return result.value as string;
  } catch {
    const bytes = new Uint8Array(buffer);
    const text  = new TextDecoder().decode(bytes);
    return text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }
}

export async function extractResumeText(
  buffer: ArrayBuffer,
  ext:    string
): Promise<string> {
  if (ext === "pdf") return extractPdfText(buffer);
  if (ext === "docx" || ext === "doc") return extractDocxText(buffer);
  throw new Error(`Unsupported file extension: ${ext}`);
}

// ── Claude extraction prompt (shared) ─────────────────────────────────────────

export const RESUME_PARSE_SYSTEM = `You are a precise resume parser. Extract structured data from the provided resume text.
Return ONLY valid JSON matching this exact schema — no markdown, no extra keys:
{
  "firstName": string | null,
  "lastName": string | null,
  "currentTitle": string | null,
  "currentCompany": string | null,
  "location": string | null,
  "email": string | null,
  "phone": string | null,
  "summary": string | null,
  "skills": string[],
  "yearsExperience": number | null
}
Be conservative with yearsExperience — only estimate if there's enough date information.
For skills, include only real skills (not soft skills like "communication").`;

export interface ParsedResume {
  firstName?:       string;
  lastName?:        string;
  currentTitle?:    string;
  currentCompany?:  string;
  location?:        string;
  email?:           string;
  phone?:           string;
  summary?:         string;
  skills?:          string[];
  yearsExperience?: number;
}

/** Convert a ParsedResume into a `candidates` update patch — only non-empty fields. */
export function parsedResumeToUpdates(parsed: ParsedResume): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  if (parsed.currentTitle)           updates.current_title   = parsed.currentTitle;
  if (parsed.currentCompany)         updates.current_company = parsed.currentCompany;
  if (parsed.location)               updates.location        = parsed.location;
  if (parsed.summary)                updates.summary         = parsed.summary;
  if (parsed.skills?.length)         updates.skills          = parsed.skills;
  if (parsed.yearsExperience != null) updates.years_experience = parsed.yearsExperience;
  if (parsed.email)                  updates.email           = parsed.email;
  if (parsed.phone)                  updates.phone           = parsed.phone;
  return updates;
}
