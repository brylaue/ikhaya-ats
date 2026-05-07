/**
 * Email address normalisation helpers.
 *
 * Rules applied (in order):
 *   1. Lowercase + trim whitespace
 *   2. Gmail dot-insensitivity: strip dots from the local part for @gmail.com / @googlemail.com
 *   3. Gmail plus-addressing: strip +tag from local part
 *   4. Domain alias collapse: googlemail.com → gmail.com
 *
 * Used by the matcher before querying the candidates table so that
 * "first.last+tag@gmail.com" and "firstlast@googlemail.com" resolve to the
 * same canonical address.
 *
 * Stage 6.
 */

// ─── Domain aliases ───────────────────────────────────────────────────────────
// Maps secondary domain → canonical domain.
const DOMAIN_ALIASES: Record<string, string> = {
  "googlemail.com": "gmail.com",
};

// Domains where Gmail's dot-insensitivity rule applies.
const DOT_INSENSITIVE_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

// ─── Core normaliser ──────────────────────────────────────────────────────────

/**
 * Returns the canonical form of an email address.
 * Input may be a bare address ("foo@bar.com") or a display-name address
 * ("Alice Foo <foo@bar.com>") — the angle-bracket form is unwrapped first.
 *
 * Never throws; returns the lowercased input unchanged if parsing fails.
 */
export function normalizeEmail(raw: string): string {
  const address = extractAddress(raw);
  if (!address.includes("@")) return address.toLowerCase().trim();

  const atIdx = address.lastIndexOf("@");
  let local = address.slice(0, atIdx).toLowerCase().trim();
  let domain = address.slice(atIdx + 1).toLowerCase().trim();

  // Canonicalise domain alias
  domain = DOMAIN_ALIASES[domain] ?? domain;

  // Gmail dot-insensitivity + plus-addressing
  if (DOT_INSENSITIVE_DOMAINS.has(domain)) {
    // Strip +tag
    const plusIdx = local.indexOf("+");
    if (plusIdx !== -1) local = local.slice(0, plusIdx);
    // Remove all dots
    local = local.replace(/\./g, "");
  }

  return `${local}@${domain}`;
}

/**
 * Extract the bare email address from a "Display Name <addr>" string,
 * or return the original value if no angle-brackets are present.
 */
export function extractAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match ? match[1] : value).trim();
}

/**
 * Return all the normalised addresses that should be checked against the
 * candidates table for a given raw address.  For most domains this is just
 * `[normalizeEmail(raw)]`, but for Gmail we also include the dot-variant so
 * that pre-existing rows that weren't normalised still match.
 */
export function expandAddresses(raw: string): string[] {
  const canonical = normalizeEmail(raw);
  const seen = new Set<string>([canonical]);

  // Also include the original lowercased bare address in case it was stored
  // without normalization (e.g., during a manual import).
  const bare = extractAddress(raw).toLowerCase().trim();
  if (bare !== canonical) seen.add(bare);

  return Array.from(seen);
}

/**
 * Check whether two email addresses refer to the same inbox after normalization.
 */
export function emailsMatch(a: string, b: string): boolean {
  return normalizeEmail(a) === normalizeEmail(b);
}

/**
 * Parse a comma-separated list of addresses (RFC 2822 list header value)
 * and return the normalised form of each.
 */
export function parseAddressList(header: string): string[] {
  if (!header) return [];
  return header
    .split(",")
    .map((e) => normalizeEmail(e.trim()))
    .filter(Boolean);
}
