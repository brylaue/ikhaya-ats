/**
 * Unsubscribe token mint / verify (US-473, US-482)
 *
 * Tokens are HMAC-signed so:
 *   - They can be placed in mailto: and GET URLs without DB lookup.
 *   - A tampered/guessed recipient address fails verification.
 *   - They do not expire (RFC 8058 one-click links are long-lived; the user
 *     expects links from a year-old email to still unsubscribe them).
 *
 * Format: `v1.<b64url-payload>.<b64url-hmac>`
 *   payload = JSON { a: agencyId, e: email, m?: messageId }
 *
 * Signing key: UNSUBSCRIBE_SECRET env var.
 *
 * Keep this file server-only — it imports `node:crypto`.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_VERSION = "v1";

export interface UnsubscribePayload {
  agencyId:  string;
  email:     string;
  messageId?: string;
}

function b64urlEncode(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf) : buf;
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
  const pad = 4 - (s.length % 4 || 4);
  const normalized = s.replace(/-/g, "+").replace(/_/g, "/") + (pad < 4 ? "=".repeat(pad) : "");
  return Buffer.from(normalized, "base64");
}

function getSecret(): string {
  const s = process.env.UNSUBSCRIBE_SECRET;
  if (!s) throw new Error("UNSUBSCRIBE_SECRET env var is not set");
  return s;
}

export function mintUnsubscribeToken(p: UnsubscribePayload): string {
  const json = JSON.stringify({ a: p.agencyId, e: p.email.toLowerCase(), m: p.messageId });
  const payload = b64urlEncode(json);
  const mac = createHmac("sha256", getSecret()).update(`${TOKEN_VERSION}.${payload}`).digest();
  return `${TOKEN_VERSION}.${payload}.${b64urlEncode(mac)}`;
}

/**
 * Verify an unsubscribe token. Returns the decoded payload on success,
 * or null on any validation failure. Never throws.
 */
export function verifyUnsubscribeToken(token: string): UnsubscribePayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [version, payloadB64, macB64] = parts;
    if (version !== TOKEN_VERSION) return null;

    const expected = createHmac("sha256", getSecret())
      .update(`${version}.${payloadB64}`)
      .digest();
    const actual = b64urlDecode(macB64);
    if (expected.length !== actual.length) return null;
    if (!timingSafeEqual(expected, actual)) return null;

    const decoded = JSON.parse(b64urlDecode(payloadB64).toString("utf8")) as {
      a?: string; e?: string; m?: string;
    };
    if (!decoded.a || !decoded.e) return null;
    return { agencyId: decoded.a, email: decoded.e, messageId: decoded.m };
  } catch {
    return null;
  }
}

/** Absolute unsubscribe URL for the footer link. */
export function unsubscribeUrl(
  baseUrl: string,
  payload: UnsubscribePayload
): string {
  const token = mintUnsubscribeToken(payload);
  // Trim trailing slash on baseUrl.
  const trimmed = baseUrl.replace(/\/$/, "");
  return `${trimmed}/unsubscribe/${encodeURIComponent(token)}`;
}
