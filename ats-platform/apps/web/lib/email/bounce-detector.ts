/**
 * Bounce / DSN detector (US-472)
 *
 * Called from the inbound sync pipeline for every newly ingested message.
 * Identifies delivery status notifications (DSN per RFC 3464 / RFC 6522), spam
 * feedback loops (RFC 5965 ARF), and auto-reply markers, then routes them to
 * `recordBounce` so the suppression list stays current.
 *
 * Conservative by design: only "hard" classifications trigger suppression
 * (via the DB trigger on `email_bounces`). Soft bounces are logged for
 * observability but senders can keep retrying.
 *
 * This module is deliberately independent of the send path — `recordBounce`
 * resolves the original `message_id` later via matching the DSN's
 * `Original-Recipient` / `Final-Recipient` fields against recent outbound
 * messages. If no match is found, the bounce is still recorded (recipient
 * address is enough to suppress).
 */

import { recordBounce } from "./suppression";

// ─── Heuristic classifiers ──────────────────────────────────────────────────

const DSN_CONTENT_TYPES = [
  "multipart/report",
  "message/delivery-status",
];

const MAILER_DAEMON_PATTERNS = [
  /mailer-daemon@/i,
  /postmaster@/i,
  /mail delivery subsystem/i,
  /\bbounce\b/i,
];

const HARD_SMTP_PREFIXES = ["5.1.", "5.2.", "5.3.", "5.4.", "5.5.", "5.6.", "5.7."];
const SOFT_SMTP_PREFIXES = ["4."];

const FEEDBACK_LOOP_HEADERS = ["x-abuse-report", "feedback-type", "abuse-type"];

// ─── Public API ─────────────────────────────────────────────────────────────

export interface InboundMessageHeaders {
  contentType?:  string;
  from?:         string;
  subject?:      string;
  rawHeaders?:   Record<string, string>; // lower-cased keys
}

export interface InboundMessage {
  agencyId:       string;
  headers:        InboundMessageHeaders;
  bodyText?:      string;
  bodyHtml?:      string;
  rawHeadersJson?: string; // pass-through for storage
}

export interface DetectedBounce {
  bounceType:     "hard" | "soft" | "complaint" | "auto_reply";
  recipient:      string;
  smtpStatus?:    string;
  diagnostic?:    string;
}

/**
 * Main entry — returns the bounce record if one was detected, else null.
 * Does NOT write to the DB on its own; the caller should call
 * `handleInboundMessage` to get both detection AND persistence in one step.
 */
export function detectBounce(msg: InboundMessage): DetectedBounce | null {
  const headers = msg.headers.rawHeaders ?? {};
  const contentType = msg.headers.contentType ?? headers["content-type"] ?? "";
  const from        = msg.headers.from        ?? headers["from"]         ?? "";
  const subject     = msg.headers.subject     ?? headers["subject"]      ?? "";
  const body        = `${msg.bodyText ?? ""}\n${msg.bodyHtml ?? ""}`;

  // ── 1. Spam complaint (feedback loop) ───
  if (FEEDBACK_LOOP_HEADERS.some((h) => headers[h])) {
    return {
      bounceType: "complaint",
      recipient:  extractRecipient(headers, body) ?? "",
      diagnostic: "Spam complaint (feedback loop)",
    };
  }

  // ── 2. Auto-reply (vacation, out-of-office) ───
  const autoSubmitted = headers["auto-submitted"];
  if (autoSubmitted && autoSubmitted !== "no") {
    return {
      bounceType: "auto_reply",
      recipient:  extractRecipient(headers, body) ?? "",
      diagnostic: `Auto-submitted: ${autoSubmitted}`,
    };
  }

  // ── 3. DSN ───
  const looksLikeDsn =
    DSN_CONTENT_TYPES.some((t) => contentType.toLowerCase().includes(t)) ||
    MAILER_DAEMON_PATTERNS.some((p) => p.test(from)) ||
    /undeliverable|delivery status notification|returned mail|mail delivery failed/i.test(subject);

  if (!looksLikeDsn) return null;

  const recipient = extractRecipient(headers, body);
  if (!recipient) return null;

  const smtpStatus  = extractSmtpStatus(body);
  const diagnostic  = extractDiagnostic(body);
  const bounceType  = classify(smtpStatus, body);

  return { bounceType, recipient, smtpStatus, diagnostic };
}

/**
 * Convenience: detect + persist in one call. Caller should pass the agency id
 * and (optionally) the resolved outbound message_id that this DSN refers to.
 */
export async function handleInboundMessage(
  msg:       InboundMessage,
  messageId?: string
): Promise<DetectedBounce | null> {
  const detected = detectBounce(msg);
  if (!detected) return null;

  try {
    await recordBounce({
      agencyId:       msg.agencyId,
      recipientEmail: detected.recipient,
      bounceType:     detected.bounceType,
      smtpStatus:     detected.smtpStatus,
      diagnosticCode: detected.diagnostic,
      messageId,
      dsnRaw: msg.rawHeadersJson
        ? (safeJson(msg.rawHeadersJson) as Record<string, unknown>)
        : undefined,
    });
  } catch (err) {
    console.error("[bounce-detector] recordBounce failed", err);
  }
  return detected;
}

// ─── Internal helpers ───────────────────────────────────────────────────────

function extractRecipient(
  headers: Record<string, string>,
  body:    string
): string | null {
  // Prefer RFC 3464 Final-Recipient / Original-Recipient fields in the body.
  const match =
    body.match(/^Final-Recipient:\s*(?:rfc822;)?\s*([^\s\r\n]+)/im) ??
    body.match(/^Original-Recipient:\s*(?:rfc822;)?\s*([^\s\r\n]+)/im);
  if (match) return match[1].replace(/[<>]/g, "").toLowerCase();

  // Fall back to x-failed-recipients header.
  const failed = headers["x-failed-recipients"];
  if (failed) return failed.split(",")[0].trim().toLowerCase();

  return null;
}

function extractSmtpStatus(body: string): string | undefined {
  const m = body.match(/^(?:Status|Diagnostic-Code):\s*(?:smtp;\s*)?(\d\.\d+\.\d+|\d{3}[-\s]\d\.\d+\.\d+)/im);
  if (!m) return undefined;
  // Reduce "550-5.1.1" forms to "5.1.1".
  const tail = m[1].match(/\d\.\d+\.\d+/);
  return tail ? tail[0] : m[1];
}

function extractDiagnostic(body: string): string | undefined {
  const m = body.match(/^Diagnostic-Code:\s*(.+)$/im);
  if (m) return m[1].trim().slice(0, 500);
  return undefined;
}

function classify(
  smtpStatus: string | undefined,
  body:       string
): "hard" | "soft" {
  if (smtpStatus) {
    if (HARD_SMTP_PREFIXES.some((p) => smtpStatus.startsWith(p))) return "hard";
    if (SOFT_SMTP_PREFIXES.some((p) => smtpStatus.startsWith(p))) return "soft";
  }
  // Fall back to body heuristics when the status code is absent.
  if (/user unknown|does not exist|no such user|address rejected|mailbox not found/i.test(body)) {
    return "hard";
  }
  if (/over quota|temporarily|try again|deferred|greylist/i.test(body)) {
    return "soft";
  }
  return "hard"; // When uncertain, prefer to protect sender reputation.
}

function safeJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}
