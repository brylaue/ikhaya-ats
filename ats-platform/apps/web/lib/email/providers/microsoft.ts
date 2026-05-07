/**
 * Microsoft Graph adapter — implements the EmailProvider contract for Azure AD / MSAL.
 *
 * Stage 4 surface: buildAuthUrl + handleCallback + admin consent support.
 * Stage 7 surface: listMessages, getMessage, fetchDelta stub (sync engine).
 * Stage 8 surface: subscribeRealtime, renewSubscription, fetchDelta full (realtime).
 */

import type {
  EmailProvider,
  ProviderId,
  ProviderConnection,
  MessageRef,
  FullMessage,
  EmailAddress,
  SendMessageInput,
  Subscription,
} from "@/types/email/provider";
import { ProviderError } from "@/types/email/provider";
import { encrypt, decrypt } from "@/lib/email/token-store";

const GRAPH_API_BASE = "https://graph.microsoft.com/v1.0";
const GRAPH_USERINFO_URL = `${GRAPH_API_BASE}/me`;
const MS_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "User.Read",
  "Mail.ReadWrite",
  "Mail.Send",
] as const;

class NotImplementedError extends Error {
  constructor(method: string) {
    super(`MicrosoftProvider.${method} not implemented until Stage 7`);
    this.name = "NotImplementedError";
  }
}

/**
 * US-340: Per-connection in-process mutex for token refresh.
 *
 * Microsoft rotates refresh tokens on every use — if two workers in the same
 * Node process call getAccessToken() concurrently for the same connection,
 * both hit MS's token endpoint, both receive distinct new refresh tokens,
 * and the last DB write wins. The "losing" token is technically still valid
 * within MS's 24h grace window, but subsequent rotations can cascade into
 * invalid_grant once grace expires.
 *
 * This map coalesces concurrent refreshes: the first caller performs the
 * MS round-trip + DB persist; all joiners await the same promise and
 * receive the same access token.
 *
 * Note: in-process only. For multi-worker deployments, the DB-level CAS
 * on token_revision (below) catches cross-process races.
 */
const _refreshInFlight = new Map<string, Promise<string>>();

/** Decode a JWT payload without verification (we trust Microsoft's HTTPS delivery). */
function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT");
  return JSON.parse(Buffer.from(parts[1], "base64").toString("utf-8"));
}

export class MicrosoftProvider implements EmailProvider {
  readonly id: ProviderId = "microsoft";

  private get clientId(): string {
    const v = process.env.MS_OAUTH_CLIENT_ID;
    if (!v) throw new Error("Missing MS_OAUTH_CLIENT_ID");
    return v;
  }

  private get clientSecret(): string {
    const v = process.env.MS_OAUTH_CLIENT_SECRET;
    if (!v) throw new Error("Missing MS_OAUTH_CLIENT_SECRET");
    return v;
  }

  private get appUrl(): string {
    const v = process.env.NEXT_PUBLIC_APP_URL;
    if (!v) throw new Error("Missing NEXT_PUBLIC_APP_URL");
    return v;
  }

  private get authority(): string {
    return process.env.MS_OAUTH_AUTHORITY || "https://login.microsoftonline.com/common";
  }

  private get redirectUri(): string {
    return `${this.appUrl}/api/auth/microsoft/callback`;
  }

  // ─── Admin consent URL (Stage 4) ────────────────────────────────────────

  buildAdminConsentUrl({ state, msTenantId }: { state: string; msTenantId: string }): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: `${this.appUrl}/api/auth/microsoft/adminconsent-callback`,
      scope: MS_SCOPES.join(" "),
      state,
    });
    return `${this.authority}/${msTenantId}/adminconsent?${params}`;
  }

  // ─── Auth flow (Stage 4) ─────────────────────────────────────────────────

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
      scope: MS_SCOPES.join(" "),
      state,
    });
    if (loginHint) params.set("login_hint", loginHint);
    // US-338: PKCE — include challenge when provided
    if (codeChallenge) {
      params.set("code_challenge", codeChallenge);
      params.set("code_challenge_method", "S256");
    }
    return `${this.authority}/oauth2/v2.0/authorize?${params}`;
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
    const tokenParams: Record<string, string> = {
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: this.redirectUri,
      scope: MS_SCOPES.join(" "),
    };
    // US-338: Include PKCE verifier when provided
    if (codeVerifier) tokenParams.code_verifier = codeVerifier;

    const tokenRes = await fetch(`${this.authority}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(tokenParams).toString(),
    });

    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      if (body.includes("invalid_grant")) {
        throw new ProviderError("Authorization code expired or already used", "invalid_grant");
      }
      if (body.includes("admin_consent_required")) {
        throw new ProviderError(
          "Admin consent required for this tenant",
          "admin_consent_required"
        );
      }
      throw new ProviderError(`Token exchange failed: ${tokenRes.status}`, "unknown");
    }

    const tokens = await tokenRes.json();

    if (!tokens.refresh_token) {
      throw new ProviderError("No refresh token returned", "insufficient_scope");
    }

    // Decode ID token for tid (tenant) and oid (user object ID)
    let msTenantId: string | null = null;
    let providerSub: string | null = null;
    try {
      const payload = decodeJwtPayload(tokens.id_token);
      msTenantId = (payload.tid as string) || null;
      providerSub = (payload.oid as string) || (payload.sub as string) || null;
    } catch {
      throw new ProviderError("Failed to decode ID token", "unknown");
    }

    // Fetch user profile from Graph
    const userRes = await fetch(GRAPH_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!userRes.ok) {
      throw new ProviderError(`Graph /me failed: ${userRes.status}`, "unknown");
    }
    const userInfo = await userRes.json();

    const expiresInSeconds = tokens.expires_in || 3600;
    const now = new Date();
    const accessTokenExpiresAt = new Date(now.getTime() + expiresInSeconds * 1000).toISOString();

    const connection: ProviderConnection = {
      id: "",
      userId: "",
      tenantId: "",
      provider: "microsoft",
      providerSub: providerSub ?? userInfo.id,
      email: userInfo.mail || userInfo.userPrincipalName,
      msTenantId,
      scopes: [...MS_SCOPES],
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

  async revoke(_conn: ProviderConnection): Promise<void> {
    // Microsoft doesn't have a token revoke endpoint analogous to Google's.
    // Revocation happens via Azure Portal. We just delete the DB row.
  }

  // ─── Token refresh ──────────────────────────────────────────────────────

  /**
   * Refresh access token using stored refresh token via MSAL token endpoint.
   * Uses ms_tenant_id when available, falls back to 'common'.
   *
   * Fetches the refresh token via getRefreshToken() which decrypts from DB,
   * so this works regardless of whether the caller passes a mapped
   * StoredConnection or a raw ProviderConnection.
   */
  async getAccessToken(conn: ProviderConnection): Promise<string> {
    // US-340: coalesce concurrent refreshes for the same connection in this
    // process. Joiners share the same MS round-trip + DB persist.
    const existing = _refreshInFlight.get(conn.id);
    if (existing) return existing;

    const promise = this._doRefresh(conn).finally(() => {
      _refreshInFlight.delete(conn.id);
    });
    _refreshInFlight.set(conn.id, promise);
    return promise;
  }

  private async _doRefresh(conn: ProviderConnection): Promise<string> {
    // Use refreshTokenSecretRef if available on the connection object,
    // otherwise fetch + decrypt from DB by connection ID.
    // US-340: also capture token_revision for optimistic-lock CAS on persist.
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();

    let refreshToken: string;
    let currentRevision: number;

    // Always read the current revision from DB (in-memory conn may be stale)
    const { data: liveRow, error: readErr } = await supabase
      .from("provider_connections")
      .select("token_revision, refresh_token_secret_ref")
      .eq("id", conn.id)
      .single();

    if (readErr || !liveRow) {
      throw new ProviderError("Connection not found", "not_found");
    }

    currentRevision = (liveRow.token_revision as number | null) ?? 1;
    // Prefer the DB's current ciphertext over any stale value passed on conn
    refreshToken = await decrypt(liveRow.refresh_token_secret_ref as string);

    const tenant = conn.msTenantId || "common";

    const res = await fetch(
      `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
          scope: MS_SCOPES.join(" "),
        }).toString(),
      }
    );

    if (!res.ok) {
      const body = await res.text();
      if (body.includes("invalid_grant") || body.includes("AADSTS700082")) {
        throw new ProviderError("Refresh token expired or revoked", "invalid_grant");
      }
      throw new ProviderError(`Token refresh failed: ${res.status}`, "unknown");
    }

    const tokens = await res.json();
    const expiresAt = new Date(
      Date.now() + (tokens.expires_in || 3600) * 1000
    ).toISOString();

    const updates: Record<string, unknown> = {
      access_token_expires_at: expiresAt,
      token_revision:          currentRevision + 1,
    };

    // Microsoft rotates refresh tokens on use — persist the new one
    if (tokens.refresh_token) {
      const encrypted = await encrypt(tokens.refresh_token);
      updates.refresh_token_secret_ref = encrypted;
    }

    // US-340: CAS on token_revision — only persist if nobody raced us.
    // US-339: on DB-write failure (including lost CAS), disable the
    // connection so the user re-auths cleanly.
    const { data: casRow, error: updateError } = await supabase
      .from("provider_connections")
      .update(updates)
      .eq("id", conn.id)
      .eq("token_revision", currentRevision)
      .select("id")
      .maybeSingle();

    if (updateError) {
      console.error("microsoft._doRefresh: failed to persist rotated refresh token —", updateError);
      try {
        await supabase
          .from("provider_connections")
          .update({ sync_enabled: false })
          .eq("id", conn.id);
        await supabase.from("sync_events").insert({
          agency_id:   conn.tenantId,
          user_id:     conn.userId,
          provider:    "microsoft",
          event_type:  "token_persist_failed",
          occurred_at: new Date().toISOString(),
        });
      } catch (disableErr) {
        console.error("microsoft._doRefresh: also failed to disable connection —", disableErr);
      }
      throw new ProviderError(
        "Refresh token rotation persisted with errors — connection disabled, reconnect required",
        "invalid_grant"
      );
    }

    if (!casRow) {
      // US-340: another process rotated the token between our read and write.
      // Our newly-minted access_token is still valid for this caller's single
      // use, but the refresh_token we just obtained is now orphaned in MS's
      // rotation chain. Log and continue — the next getAccessToken() call
      // will re-read the DB's winning refresh_token and proceed normally.
      console.warn(
        "microsoft._doRefresh: lost token_revision CAS for connection",
        conn.id,
        "— concurrent refresh detected; access token still returned"
      );
    }

    return tokens.access_token;
  }

  // ─── Graph API helper ───────────────────────────────────────────────────

  /**
   * Fetch wrapper that handles 429/503 rate limiting with Retry-After header.
   * Returns the response; caller is responsible for checking .ok / parsing.
   */
  private async graphFetch(
    url: string,
    accessToken: string,
    headers?: Record<string, string>
  ): Promise<Response> {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...headers,
      },
    });

    if (res.status === 429 || res.status === 503) {
      const retryAfter = res.headers.get("Retry-After");
      const retrySeconds = retryAfter ? parseInt(retryAfter, 10) : 60;
      throw new ProviderError(
        `Rate limited (${res.status})`,
        "rate_limited",
        null,
        isNaN(retrySeconds) ? 60 : retrySeconds
      );
    }

    if (res.status === 401) {
      throw new ProviderError("Access token expired", "invalid_grant");
    }

    if (res.status === 403) {
      const body = await res.text();
      if (body.includes("AADSTS65001")) {
        throw new ProviderError(
          "Admin consent required for this tenant",
          "admin_consent_required"
        );
      }
      throw new ProviderError(`Forbidden: ${body}`, "unknown");
    }

    return res;
  }

  // ─── Sync (Stage 7) ────────────────────────────────────────────────────

  /**
   * List messages from a specific folder using folder-scoped Graph endpoint.
   * CRITICAL: Using /mailFolders('inbox')/messages bypasses Focused Inbox (spec §9.1).
   * Paginates via @odata.nextLink. Yields MessageRef[] batches.
   */
  async *listMessages(
    conn: ProviderConnection,
    opts: { sinceIso: string; folder: "inbox" | "sent" }
  ): AsyncIterable<MessageRef[]> {
    const accessToken = await this.getAccessToken(conn);

    // Map folder param to Graph folder name
    const graphFolder = opts.folder === "inbox" ? "inbox" : "sentitems";

    const selectFields = [
      "id",
      "conversationId",
      "subject",
      "from",
      "toRecipients",
      "ccRecipients",
      "bccRecipients",
      "receivedDateTime",
      "internetMessageId",
      "hasAttachments",
    ].join(",");

    const filter = `receivedDateTime ge ${opts.sinceIso}`;

    let url: string | null =
      `${GRAPH_API_BASE}/me/mailFolders('${graphFolder}')/messages` +
      `?$filter=${encodeURIComponent(filter)}` +
      `&$top=100` +
      `&$select=${selectFields}` +
      `&$orderby=${encodeURIComponent("receivedDateTime desc")}`;

    while (url) {
      const res = await this.graphFetch(url, accessToken);

      if (!res.ok) {
        throw new ProviderError(
          `List messages failed: ${res.status} ${res.statusText}`,
          "unknown"
        );
      }

      const data = await res.json();
      const messages: unknown[] = data.value ?? [];

      if (messages.length === 0) break;

      const refs: MessageRef[] = messages.map((msg: any) => {
        const fromAddr = msg.from?.emailAddress?.address?.toLowerCase() ?? "";
        const toAddrs = (msg.toRecipients ?? []).map(
          (r: any) => r.emailAddress?.address?.toLowerCase() ?? ""
        );
        const ccAddrs = (msg.ccRecipients ?? []).map(
          (r: any) => r.emailAddress?.address?.toLowerCase() ?? ""
        );
        const bccAddrs = (msg.bccRecipients ?? []).map(
          (r: any) => r.emailAddress?.address?.toLowerCase() ?? ""
        );

        return {
          providerMessageId: msg.id,
          providerThreadId: msg.conversationId,
          internetMessageId: msg.internetMessageId ?? null,
          receivedAt: msg.receivedDateTime
            ? new Date(msg.receivedDateTime).toISOString()
            : new Date().toISOString(),
          from: fromAddr,
          to: toAddrs,
          cc: ccAddrs,
          bcc: bccAddrs,
          subject: msg.subject ?? null,
        } satisfies MessageRef;
      });

      yield refs;

      // Follow @odata.nextLink for pagination
      url = data["@odata.nextLink"] ?? null;
    }
  }

  /**
   * Fetch full message payload from Graph.
   * Maps Graph response to FullMessage interface.
   */
  async getMessage(conn: ProviderConnection, providerMessageId: string): Promise<FullMessage> {
    const accessToken = await this.getAccessToken(conn);

    const res = await this.graphFetch(
      `${GRAPH_API_BASE}/me/messages/${providerMessageId}`,
      accessToken,
      // Use text preference during backfill for smaller payloads (spec §7.4)
      { Prefer: 'outlook.body-content-type="text"' }
    );

    if (res.status === 404) {
      throw new ProviderError("Message not found", "not_found");
    }

    if (!res.ok) {
      throw new ProviderError(
        `Get message failed: ${res.status} ${res.statusText}`,
        "unknown"
      );
    }

    const msg = await res.json();

    const fromAddr = msg.from?.emailAddress?.address?.toLowerCase() ?? "";
    const fromDisplay = msg.from?.emailAddress?.name ?? null;

    const mapRecipients = (arr: any[] | undefined): EmailAddress[] =>
      (arr ?? []).map((r: any) => ({
        address: r.emailAddress?.address?.toLowerCase() ?? "",
        rawAddress: r.emailAddress?.address ?? "",
        displayName: r.emailAddress?.name ?? null,
      }));

    const toAddresses = mapRecipients(msg.toRecipients);
    const ccAddresses = mapRecipients(msg.ccRecipients);
    const bccAddresses = mapRecipients(msg.bccRecipients);

    // Body handling: Graph returns {contentType, content} pair
    const bodyContent = msg.body?.content ?? "";
    const bodyType = msg.body?.contentType?.toLowerCase() ?? "text";
    const bodyHtml = bodyType === "html" ? bodyContent : null;
    const bodyText = bodyType === "text" ? bodyContent : null;

    const snippet = (bodyText || bodyContent || "")
      .replace(/<[^>]*>/g, "") // strip HTML tags for snippet
      .substring(0, 150)
      .replace(/\s+/g, " ")
      .trim();

    // Determine direction
    const userEmail = conn.email.toLowerCase();
    const direction = fromAddr === userEmail ? "outbound" : "inbound";

    return {
      providerMessageId,
      providerThreadId: msg.conversationId ?? "",
      internetMessageId: msg.internetMessageId ?? null,
      receivedAt: msg.receivedDateTime
        ? new Date(msg.receivedDateTime).toISOString()
        : new Date().toISOString(),
      from: fromAddr,
      fromDisplay,
      to: toAddresses.map((a) => a.address),
      cc: ccAddresses.map((a) => a.address),
      bcc: bccAddresses.map((a) => a.address),
      toAddresses,
      ccAddresses,
      bccAddresses,
      subject: msg.subject ?? null,
      snippet,
      bodyHtml,
      bodyText,
      labelsOrCategories: msg.categories ?? [],
      rawHeaders: null, // Graph doesn't expose raw headers
      hasAttachments: msg.hasAttachments ?? false,
    };
  }

  async sendMessage(_conn: ProviderConnection, _input: SendMessageInput): Promise<MessageRef> {
    throw new NotImplementedError("sendMessage");
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

  /**
   * Stage 7: stub — captures delta cursor at end of backfill.
   * Full delta processing is Stage 8.
   *
   * Calls GET /me/mailFolders('inbox')/messages/delta to obtain the initial
   * deltaLink cursor, which is stored in provider_connections.delta_cursor.
   */
  async *fetchDelta(conn: ProviderConnection): AsyncIterable<MessageRef[]> {
    const accessToken = await this.getAccessToken(conn);

    // Capture initial delta cursor by exhausting the delta feed
    let url: string | null =
      `${GRAPH_API_BASE}/me/mailFolders('inbox')/messages/delta`;
    let deltaLink: string | null = null;

    while (url) {
      const res = await this.graphFetch(url, accessToken);

      if (!res.ok) {
        throw new ProviderError(
          `Delta fetch failed: ${res.status} ${res.statusText}`,
          "unknown"
        );
      }

      const data = await res.json();

      // Yield any messages from the initial delta (though backfill already has them)
      const messages: unknown[] = data.value ?? [];
      if (messages.length > 0) {
        const refs: MessageRef[] = messages.map((msg: any) => ({
          providerMessageId: msg.id,
          providerThreadId: msg.conversationId ?? "",
          internetMessageId: msg.internetMessageId ?? null,
          receivedAt: msg.receivedDateTime
            ? new Date(msg.receivedDateTime).toISOString()
            : new Date().toISOString(),
          from: msg.from?.emailAddress?.address?.toLowerCase() ?? "",
          to: (msg.toRecipients ?? []).map(
            (r: any) => r.emailAddress?.address?.toLowerCase() ?? ""
          ),
          cc: (msg.ccRecipients ?? []).map(
            (r: any) => r.emailAddress?.address?.toLowerCase() ?? ""
          ),
          bcc: (msg.bccRecipients ?? []).map(
            (r: any) => r.emailAddress?.address?.toLowerCase() ?? ""
          ),
          subject: msg.subject ?? null,
        }));
        yield refs;
      }

      // Follow nextLink until we get deltaLink
      if (data["@odata.deltaLink"]) {
        deltaLink = data["@odata.deltaLink"];
        url = null;
      } else {
        url = data["@odata.nextLink"] ?? null;
      }
    }

    // Store the delta cursor for Stage 8 realtime processing
    if (deltaLink) {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      await supabase
        .from("provider_connections")
        .update({ delta_cursor: deltaLink })
        .eq("id", conn.id);
    }
  }
}

export const microsoftProvider = new MicrosoftProvider();
