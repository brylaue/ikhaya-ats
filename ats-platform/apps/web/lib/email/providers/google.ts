/**
 * Gmail adapter — implements the EmailProvider contract for Google OAuth.
 *
 * Stage 3 surface: buildAuthUrl + handleCallback (auth flow only).
 * Stage 6 surface: listMessages, getMessage, access-token refresh (sync engine).
 * Stage 8 surface: subscribeRealtime, renewSubscription, fetchDelta (realtime).
 */

import type {
  EmailProvider,
  ProviderId,
  ProviderConnection,
  MessageRef,
  FullMessage,
  SendMessageInput,
  Subscription,
  EmailAddress,
} from "@/types/email/provider";
import { ProviderError } from "@/types/email/provider";
import { getRefreshToken } from "@/lib/email/storage/connections";
import { createClient } from "@/lib/supabase/server";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const GMAIL_API_BASE = "https://www.googleapis.com/gmail/v1/users/me";
const GMAIL_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.modify",
] as const;

/** Default batch size for listMessages pagination (Gmail max is 500; 100 is a reasonable middle). */
const LIST_PAGE_SIZE = 100;

class NotImplementedError extends Error {
  constructor(method: string) {
    super(`GoogleProvider.${method} not implemented yet`);
    this.name = "NotImplementedError";
  }
}

export class GoogleProvider implements EmailProvider {
  readonly id: ProviderId = "google";

  private get clientId(): string {
    const v = process.env.GOOGLE_OAUTH_CLIENT_ID;
    if (!v) throw new Error("Missing GOOGLE_OAUTH_CLIENT_ID");
    return v;
  }

  private get clientSecret(): string {
    const v = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    if (!v) throw new Error("Missing GOOGLE_OAUTH_CLIENT_SECRET");
    return v;
  }

  private get appUrl(): string {
    const v = process.env.NEXT_PUBLIC_APP_URL;
    if (!v) throw new Error("Missing NEXT_PUBLIC_APP_URL");
    return v;
  }

  private get redirectUri(): string {
    return `${this.appUrl}/api/auth/google/callback`;
  }

  // ─── Auth flow (Stage 3) ─────────────────────────────────────────────────

  buildAuthUrl({
    state,
    loginHint,
    codeChallenge,
  }: {
    state: string;
    loginHint?: string;
    /** US-338: PKCE S256 code_challenge */
    codeChallenge?: string;
  }): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: "code",
      scope: GMAIL_SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      state,
    });
    if (loginHint) params.set("login_hint", loginHint);
    // US-338: PKCE — include challenge when provided
    if (codeChallenge) {
      params.set("code_challenge", codeChallenge);
      params.set("code_challenge_method", "S256");
    }
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  async handleCallback({
    code,
    codeVerifier,
  }: {
    code: string;
    state: string;
    /** US-338: PKCE verifier to include in token exchange */
    codeVerifier?: string;
  }): Promise<{
    connection: ProviderConnection;
    refreshToken: string;
  }> {
    // Exchange code for tokens
    const tokenParams: Record<string, string> = {
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: this.redirectUri,
    };
    // US-338: Include PKCE verifier when provided
    if (codeVerifier) tokenParams.code_verifier = codeVerifier;

    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(tokenParams).toString(),
    });

    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      if (body.includes("invalid_grant")) {
        throw new ProviderError("Authorization code expired or already used", "invalid_grant");
      }
      throw new ProviderError(`Token exchange failed: ${tokenRes.status}`, "unknown");
    }

    const tokens = await tokenRes.json();

    if (!tokens.refresh_token) {
      throw new ProviderError(
        "No refresh token returned — user may need to re-consent with prompt=consent",
        "insufficient_scope"
      );
    }

    // Fetch user profile
    const userRes = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!userRes.ok) {
      throw new ProviderError(`User info fetch failed: ${userRes.status}`, "unknown");
    }
    const userInfo = await userRes.json();

    const expiresInSeconds = tokens.expires_in || 3600;
    const now = new Date();
    const accessTokenExpiresAt = new Date(now.getTime() + expiresInSeconds * 1000).toISOString();

    const connection: ProviderConnection = {
      id: "",                       // filled by DB after upsert
      userId: "",                   // filled by caller after auth check
      tenantId: "",                 // filled by caller
      provider: "google",
      providerSub: userInfo.id,
      email: userInfo.email,
      msTenantId: null,
      scopes: [...GMAIL_SCOPES],
      syncEnabled: true,
      backfillCompletedAt: null,
      deltaCursor: null,
      realtimeSubscriptionId: null,
      realtimeExpiresAt: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    return { connection, refreshToken: tokens.refresh_token };
  }

  async revoke(conn: ProviderConnection): Promise<void> {
    // US-342: Google's /revoke endpoint requires the token as an
    // x-www-form-urlencoded body field. An empty POST is silently rejected,
    // which previously left the OAuth grant live at Google even after the
    // local DB row was deleted. We send the refresh token (preferred — it
    // invalidates access tokens too) and treat 200/400 as success ("already
    // revoked" legitimately returns 400).
    const revokeUrl = "https://oauth2.googleapis.com/revoke";
    try {
      const refreshToken = await getRefreshToken(conn.id).catch(() => null);
      if (!refreshToken) {
        // Nothing to revoke — DB row was already the only remaining artefact
        return;
      }
      const res = await fetch(revokeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: refreshToken }).toString(),
      });
      if (!res.ok && res.status !== 400) {
        console.warn(`google.revoke: unexpected status ${res.status} — grant may still be active`);
      }
    } catch (err) {
      // best-effort — network failure should not block local disconnect
      console.warn("google.revoke: network error —", err);
    }
  }

  // ─── Sync (Stage 6) ──────────────────────────────────────────────────────

  /**
   * Exchange the stored encrypted refresh token for a fresh access token.
   *
   * Google access tokens live ~1 hour; rather than persist and race the
   * clock, we refresh on every worker invocation. On `invalid_grant` we
   * map to our shared ProviderError code so callers (sync worker, delta
   * webhook) can disable the connection uniformly.
   */
  async getAccessToken(conn: ProviderConnection): Promise<string> {
    const refreshToken = await getRefreshToken(conn.id);

    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }).toString(),
    });

    if (!res.ok) {
      const body = await res.text();
      if (res.status === 400 && body.includes("invalid_grant")) {
        throw new ProviderError(
          "Refresh token revoked or expired — user must reconnect",
          "invalid_grant"
        );
      }
      if (res.status === 429) {
        throw new ProviderError("Rate limited during token refresh", "rate_limited", null, 60);
      }
      throw new ProviderError(`Token refresh failed: ${res.status}`, "network");
    }

    const tokens = (await res.json()) as { access_token: string; expires_in?: number };
    const expiresAt = new Date(
      Date.now() + (tokens.expires_in ?? 3600) * 1000
    ).toISOString();

    // Update access_token_expires_at so the UI can surface "stale" connections
    try {
      const supabase = await createClient();
      await supabase
        .from("provider_connections")
        .update({ access_token_expires_at: expiresAt })
        .eq("id", conn.id);
    } catch {
      // Best-effort: token works even if we can't update the hint column
    }

    return tokens.access_token;
  }

  /**
   * Paginate over Gmail messages in a single folder, yielding batches of
   * lightweight MessageRefs so the matcher can probe without paying for
   * a full-body fetch per message.
   *
   * Gmail search syntax quirks handled:
   *   - `in:inbox` / `in:sent` — the `folder` opt
   *   - `after:UNIX_TS` — limits to the last N days; spec §7.1 uses 90d
   */
  async *listMessages(
    conn: ProviderConnection,
    opts: { sinceIso: string; folder: "inbox" | "sent" }
  ): AsyncIterable<MessageRef[]> {
    const accessToken = await this.getAccessToken(conn);
    const sinceUnix = Math.floor(new Date(opts.sinceIso).getTime() / 1000);
    const folderQuery = opts.folder === "inbox" ? "in:inbox" : "in:sent";
    const q = `${folderQuery} after:${sinceUnix}`;

    let pageToken: string | undefined;

    while (true) {
      const params = new URLSearchParams({ q, maxResults: String(LIST_PAGE_SIZE) });
      if (pageToken) params.set("pageToken", pageToken);

      const res = await fetch(`${GMAIL_API_BASE}/messages?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) this.throwFromStatus(res.status, "listMessages");

      const body = (await res.json()) as {
        messages?: { id: string; threadId: string }[];
        nextPageToken?: string;
      };
      const messages = body.messages ?? [];
      if (messages.length === 0) break;

      // Metadata-only fetch per message so we can run the matcher cheaply.
      // Parallel within a page; callers cap cross-connection concurrency
      // via `p-limit` in sync/backfill.ts.
      const refs = await Promise.all(
        messages.map((m) => this.fetchRef(accessToken, m.id))
      );

      yield refs.filter((r): r is MessageRef => r !== null);

      pageToken = body.nextPageToken;
      if (!pageToken) break;
    }
  }

  /**
   * Fetch a lightweight MessageRef (metadata-only) for matching.
   * Returns null if the message vanished between list and fetch (deleted).
   */
  private async fetchRef(accessToken: string, id: string): Promise<MessageRef | null> {
    const url =
      `${GMAIL_API_BASE}/messages/${id}` +
      `?format=metadata` +
      `&metadataHeaders=From&metadataHeaders=To` +
      `&metadataHeaders=Cc&metadataHeaders=Bcc` +
      `&metadataHeaders=Subject&metadataHeaders=Date` +
      `&metadataHeaders=Message-ID`;

    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.status === 404) return null;
    if (!res.ok) this.throwFromStatus(res.status, "fetchRef");

    const msg = (await res.json()) as GmailMessagePayload;
    const headers = toHeaderMap(msg.payload?.headers ?? []);

    return {
      providerMessageId: id,
      providerThreadId: msg.threadId ?? "",
      internetMessageId: headers["message-id"] ?? null,
      receivedAt: new Date(parseInt(msg.internalDate ?? "0", 10)).toISOString(),
      from: extractAddress(headers["from"] ?? ""),
      to: parseAddressList(headers["to"] ?? ""),
      cc: parseAddressList(headers["cc"] ?? ""),
      bcc: parseAddressList(headers["bcc"] ?? ""),
      subject: headers["subject"] ?? null,
    };
  }

  /**
   * Full message payload (format=FULL). Extracts HTML + text bodies from
   * the MIME tree, strips known tracking pixels from the HTML, and maps
   * addresses to EmailAddress[] so the matcher can keep display-name hints.
   */
  async getMessage(conn: ProviderConnection, id: string): Promise<FullMessage> {
    const accessToken = await this.getAccessToken(conn);

    const res = await fetch(`${GMAIL_API_BASE}/messages/${id}?format=full`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) this.throwFromStatus(res.status, "getMessage");

    const msg = (await res.json()) as GmailMessagePayload;
    const headers = toHeaderMap(msg.payload?.headers ?? []);
    const { bodyHtml, bodyText } = extractBody(msg.payload);
    const cleanedHtml = bodyHtml ? stripTrackingPixels(bodyHtml) : null;

    const from = extractAddress(headers["from"] ?? "");
    const toAddresses = parseAddressObjects(headers["to"] ?? "");
    const ccAddresses = parseAddressObjects(headers["cc"] ?? "");
    const bccAddresses = parseAddressObjects(headers["bcc"] ?? "");
    const snippet = (msg.snippet ?? "").slice(0, 200);

    return {
      providerMessageId: id,
      providerThreadId: msg.threadId ?? "",
      internetMessageId: headers["message-id"] ?? null,
      receivedAt: new Date(parseInt(msg.internalDate ?? "0", 10)).toISOString(),
      from,
      fromDisplay: headers["from"] ?? null,
      to: toAddresses.map((a) => a.address),
      cc: ccAddresses.map((a) => a.address),
      bcc: bccAddresses.map((a) => a.address),
      toAddresses,
      ccAddresses,
      bccAddresses,
      subject: headers["subject"] ?? null,
      snippet,
      bodyHtml: cleanedHtml,
      bodyText: bodyText ?? null,
      labelsOrCategories: msg.labelIds ?? [],
      rawHeaders: JSON.stringify(headers),
      hasAttachments: (msg.payload?.parts ?? []).some(
        (p) => !!p.filename && p.filename.length > 0
      ),
    };
  }

  async sendMessage(_conn: ProviderConnection, _input: SendMessageInput): Promise<MessageRef> {
    throw new NotImplementedError("sendMessage");
  }

  /** Centralised HTTP status → ProviderError mapping. */
  private throwFromStatus(status: number, op: string): never {
    if (status === 401 || status === 403) {
      throw new ProviderError(`Gmail ${op} unauthorized`, "invalid_grant");
    }
    if (status === 404) {
      throw new ProviderError(`Gmail ${op} not found`, "not_found");
    }
    if (status === 429 || status === 503) {
      throw new ProviderError(`Gmail ${op} rate limited`, "rate_limited", null, 60);
    }
    throw new ProviderError(`Gmail ${op} failed: ${status}`, "network");
  }

  // ─── Realtime (Stage 8 — not yet implemented) ────────────────────────────

  async subscribeRealtime(
    _conn: ProviderConnection,
    _params: { webhookUrl: string; clientStateHmac: string }
  ): Promise<Subscription> {
    throw new NotImplementedError("subscribeRealtime");
  }

  async renewSubscription(_conn: ProviderConnection, _sub: Subscription): Promise<Subscription> {
    throw new NotImplementedError("renewSubscription");
  }

  async *fetchDelta(_conn: ProviderConnection): AsyncIterable<MessageRef[]> {
    throw new NotImplementedError("fetchDelta");
    // eslint-disable-next-line no-unreachable
    yield [] as MessageRef[];
  }
}

export const googleProvider = new GoogleProvider();

// ─── Gmail payload helpers ───────────────────────────────────────────────────

interface GmailHeader { name: string; value: string }
interface GmailPayloadPart {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { data?: string; size?: number };
  parts?: GmailPayloadPart[];
}
interface GmailMessagePayload {
  id?: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailPayloadPart;
}

/** Lower-case header map for case-insensitive lookups. */
function toHeaderMap(headers: GmailHeader[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const h of headers) map[h.name.toLowerCase()] = h.value;
  return map;
}

/** Extract `foo@bar.com` from `"Display" <foo@bar.com>` or pass-through. */
function extractAddress(raw: string): string {
  if (!raw) return "";
  const match = raw.match(/<([^>]+)>/);
  return (match ? match[1] : raw).trim().toLowerCase();
}

/** Parse an RFC 2822 address list header into bare addresses. */
function parseAddressList(raw: string): string[] {
  if (!raw) return [];
  return raw.split(",").map((e) => extractAddress(e.trim())).filter(Boolean);
}

/** Parse an address list preserving display-name. */
function parseAddressObjects(raw: string): EmailAddress[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => {
      const trimmed = entry.trim();
      const match = trimmed.match(/^(.*)<([^>]+)>\s*$/);
      if (match) {
        return {
          address: match[2].trim().toLowerCase(),
          rawAddress: match[2].trim(),
          displayName: match[1].trim().replace(/^"|"$/g, "") || null,
        };
      }
      return {
        address: trimmed.toLowerCase(),
        rawAddress: trimmed,
        displayName: null,
      };
    })
    .filter((a) => a.address);
}

/** Walk a Gmail MIME tree and return the first text/html + text/plain bodies. */
function extractBody(payload?: GmailPayloadPart): { bodyHtml?: string; bodyText?: string } {
  if (!payload) return {};
  let bodyHtml: string | undefined;
  let bodyText: string | undefined;

  const visit = (part: GmailPayloadPart) => {
    if (part.mimeType === "text/html" && part.body?.data && !bodyHtml) {
      bodyHtml = decodeBase64Url(part.body.data);
    } else if (part.mimeType === "text/plain" && part.body?.data && !bodyText) {
      bodyText = decodeBase64Url(part.body.data);
    }
    if (part.parts) part.parts.forEach(visit);
  };

  visit(payload);
  return { bodyHtml, bodyText };
}

/** Gmail body.data is base64url (not standard base64). */
function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf-8");
}

/**
 * Strip the most common marketing tracking pixels (1x1 imgs, open-tracking
 * beacons, utm_* query redirects). This is pre-DOMPurify — DOMPurify
 * handles the security sanitisation; we handle the privacy stripping.
 */
function stripTrackingPixels(html: string): string {
  return html
    // 1×1 transparent tracking images
    .replace(/<img[^>]*(?:width=["']?1["']?[^>]*height=["']?1["']?|height=["']?1["']?[^>]*width=["']?1["']?)[^>]*>/gi, "")
    // Known open-tracking hosts (best-effort — will be extended as they appear)
    .replace(/<img[^>]*src=["'](?:https?:)?\/\/(?:track|open|pixel|beacon)\.[^"']+["'][^>]*>/gi, "");
}
