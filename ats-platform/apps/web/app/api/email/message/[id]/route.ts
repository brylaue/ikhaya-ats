/**
 * GET /api/email/message/[id]
 *
 * Streams the full email body from S3 on demand. Returns sanitised HTML
 * (or plain text fallback) for the timeline card expansion.
 *
 * SECURITY (US-313): email bodies arrive from the sender, so the HTML is
 * untrusted. We run it through DOMPurify here so the timeline card can safely
 * render the result with dangerouslySetInnerHTML. Never return raw HTML from
 * this route — it is the only sanitisation layer.
 *
 * Stage 9.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import DOMPurify from "isomorphic-dompurify";

type DOMPurifyConfig = {
  FORBID_TAGS?: string[];
  FORBID_ATTR?: string[];
  ALLOW_DATA_ATTR?: boolean;
  USE_PROFILES?: { html?: boolean; svg?: boolean; svgFilters?: boolean; mathMl?: boolean };
};

// Email-safe allowlist: strip <script>, <iframe>, <object>, inline event
// handlers, javascript: URLs, and any CSS expressions. Keep images (we use
// S3-hosted blob URLs) and common formatting tags.
const EMAIL_PURIFY_CONFIG: DOMPurifyConfig = {
  FORBID_TAGS: ["script", "iframe", "object", "embed", "base", "form", "meta", "link"],
  FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur", "srcdoc", "formaction"],
  ALLOW_DATA_ATTR: false,
  USE_PROFILES: { html: true },
};

function sanitiseEmailHtml(raw: string): string {
  return DOMPurify.sanitize(raw, EMAIL_PURIFY_CONFIG) as unknown as string;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // US-321: derive agency_id from auth token; never trust request params for scoping
  const { data: userRow } = await supabase
    .from("users")
    .select("agency_id")
    .eq("id", user.id)
    .single();

  if (!userRow?.agency_id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { data: message, error } = await supabase
    .from("email_messages")
    .select("id, body_html_s3_key, body_text_s3_key, snippet")
    .eq("id", id)
    .eq("agency_id", userRow.agency_id)  // US-321: explicit agency isolation
    .single();

  if (error || !message) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // If we have an S3 key, fetch from storage
  // For now, return snippet as fallback — S3 streaming will be wired in Stage 10
  let bodyHtml: string | null = null;
  let bodyText: string | null = null;

  if (message.body_html_s3_key) {
    try {
      const { data: fileData } = await supabase.storage
        .from("email-bodies")
        .download(message.body_html_s3_key);

      if (fileData) {
        const raw = await fileData.text();
        bodyHtml = sanitiseEmailHtml(raw);
      }
    } catch {
      // Fall through to text or snippet
    }
  }

  if (!bodyHtml && message.body_text_s3_key) {
    try {
      const { data: fileData } = await supabase.storage
        .from("email-bodies")
        .download(message.body_text_s3_key);

      if (fileData) {
        bodyText = await fileData.text();
      }
    } catch {
      // Fall through to snippet
    }
  }

  return NextResponse.json({
    bodyHtml: bodyHtml ?? null,
    bodyText: bodyText ?? message.snippet ?? null,
  });
}
