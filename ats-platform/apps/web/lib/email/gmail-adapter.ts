/**
 * Gmail adapter implementing the EmailProvider interface.
 * Handles OAuth token refresh, message listing, fetching, and delta sync.
 */

import type {
  EmailProvider,
  ProviderConnection,
  MessageRef,
  FullMessage,
  ProviderError,
  EmailDirection,
} from "@/types/email/provider";
import { ProviderError as ProviderErrorClass } from "@/types/email/provider";
import { decrypt, encrypt } from "./token-store";
import { createClient } from "@/lib/supabase/server";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GMAIL_API_BASE = "https://www.googleapis.com/gmail/v1/users/me";

class GmailAdapter implements EmailProvider {
  readonly id = "google";

  buildAuthUrl(params: { state: string; loginHint?: string }): string {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!clientId || !appUrl) {
      throw new Error("Missing GOOGLE_OAUTH_CLIENT_ID or NEXT_PUBLIC_APP_URL");
    }

    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", `${appUrl}/api/auth/google/callback`);
    url.searchParams.set("response_type", "code");
    url.searchParams.set(
      "scope",
      [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/gmail.modify",
      ].join(" ")
    );
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", params.state);
    if (params.loginHint) {
      url.searchParams.set("login_hint", params.loginHint);
    }
    return url.toString();
  }

  async handleCallback(params: {
    code: string;
    state: string;
  }): Promise<{ connection: ProviderConnection; refreshToken: string }> {
    throw new Error("handleCallback should be called via API route");
  }

  async revoke(conn: ProviderConnection): Promise<void> {
    try {
      const refreshToken = await decrypt(conn.refreshTokenSecretRef!);
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: refreshToken }).toString(),
      });
    } catch (err) {
      console.error("Failed to revoke token:", err);
      // Continue silently
    }
  }

  async getAccessToken(conn: ProviderConnection): Promise<string> {
    // Check if token is still valid
    if (
      conn.accessTokenExpiresAt &&
      new Date(conn.accessTokenExpiresAt) > new Date()
    ) {
      // Token is still valid, but we need to fetch it from somewhere
      // This is a limitation of the current design — access token is not stored in DB
      // For now, refresh it every time
    }

    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new ProviderErrorClass(
        "Missing OAuth credentials",
        "unknown"
      );
    }

    const refreshToken = await decrypt(conn.refreshTokenSecretRef!);

    const res = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }).toString(),
    });

    if (!res.ok) {
      if (res.status === 400) {
        const body = await res.json();
        if (body.error === "invalid_grant") {
          throw new ProviderErrorClass(
            "Refresh token expired",
            "invalid_grant"
          );
        }
      }
      throw new ProviderErrorClass(
        `Token refresh failed: ${res.status}`,
        "network"
      );
    }

    const tokens = await res.json();
    const expiresAt = new Date(
      Date.now() + (tokens.expires_in || 3600) * 1000
    ).toISOString();

    // US-339 + US-340: Use optimistic locking (token_revision) to detect
    // concurrent refresh races. Only update if our revision is still current.
    const supabase = await createClient();
    const currentRevision: number = (conn as any).token_revision ?? 1;
    const { data: updateData, error: updateError } = await supabase
      .from("provider_connections")
      .update({
        access_token_expires_at: expiresAt,
        token_revision: currentRevision + 1,
      })
      .eq("id", conn.id)
      .eq("token_revision", currentRevision) // US-340: optimistic lock
      .select("id");
    const count = updateData?.length ?? 0;

    // US-339: If the update failed (DB error or 0 rows — race condition),
    // disable the connection and surface the error.
    if (updateError) {
      console.error(`[gmail-adapter] Token persist error for ${conn.id}:`, updateError);
      await supabase
        .from("provider_connections")
        .update({ sync_enabled: false })
        .eq("id", conn.id);
      await supabase.from("sync_events").insert({
        agency_id: conn.tenantId,
        user_id: conn.userId,
        provider: "google",
        event_type: "token_persist_failed",
        detail: { error: updateError.message },
      });
      throw new ProviderErrorClass("Token persist failed — connection disabled", "unknown");
    }

    if ((count ?? 0) === 0) {
      // Another concurrent refresh won the race. Re-fetch and continue —
      // the winning refresh already stored a valid token.
      console.warn(`[gmail-adapter] Token revision mismatch for ${conn.id} — concurrent refresh detected`);
    }

    return tokens.access_token;
  }

  async *listMessages(
    conn: ProviderConnection,
    opts: { sinceIso: string; folder: "inbox" | "sent" }
  ): AsyncIterable<MessageRef[]> {
    const accessToken = await this.getAccessToken(conn);
    const sinceUnix = Math.floor(new Date(opts.sinceIso).getTime() / 1000);
    const folderQuery = opts.folder === "inbox" ? "in:inbox" : "in:sent";
    const query = `${folderQuery} after:${sinceUnix}`;

    let pageToken: string | undefined;
    const batchSize = 50;

    while (true) {
      const params = new URLSearchParams({
        q: query,
        maxResults: String(batchSize),
      });
      if (pageToken) {
        params.set("pageToken", pageToken);
      }

      const res = await fetch(`${GMAIL_API_BASE}/messages?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) {
        if (res.status === 401) {
          throw new ProviderErrorClass(
            "Access token invalid",
            "invalid_grant"
          );
        }
        if (res.status === 429) {
          throw new ProviderErrorClass("Rate limited", "rate_limited", null, 60);
        }
        throw new ProviderErrorClass(
          `List messages failed: ${res.status}`,
          "network"
        );
      }

      const body = await res.json();
      const messages = body.messages ?? [];

      if (messages.length === 0) break;

      // Fetch minimal headers for each message to get timestamps and addresses
      const refs: MessageRef[] = await Promise.all(
        messages.map((m: { id: string }) =>
          this.getMessageRef(accessToken, m.id)
        )
      );

      yield refs.filter((r) => r !== null);

      pageToken = body.nextPageToken;
      if (!pageToken) break;
    }
  }

  private async getMessageRef(
    accessToken: string,
    messageId: string
  ): Promise<MessageRef> {
    const res = await fetch(
      `${GMAIL_API_BASE}/messages/${messageId}?format=metadata&metadataHeaders=From,To,Cc,Bcc,Subject,Date,Message-ID`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!res.ok) {
      throw new ProviderErrorClass(
        `Get message ref failed: ${res.status}`,
        "network"
      );
    }

    const msg = await res.json();
    const headers = msg.payload?.headers ?? [];
    const headerMap: Record<string, string | string[]> = {};

    for (const h of headers) {
      const key = h.name.toLowerCase();
      if (key === "to" || key === "cc" || key === "bcc") {
        headerMap[key] = h.value
          .split(",")
          .map((e: string) => this.extractEmail(e));
      } else {
        headerMap[key] = h.value;
      }
    }

    return {
      providerMessageId: messageId,
      providerThreadId: msg.threadId,
      internetMessageId: (headerMap["message-id"] as string) || null,
      receivedAt: new Date(parseInt(msg.internalDate)).toISOString(),
      from: this.extractEmail(headerMap["from"] as string),
      to: Array.isArray(headerMap.to)
        ? (headerMap.to as string[])
        : [(headerMap.to as string) || ""],
      cc: Array.isArray(headerMap.cc)
        ? (headerMap.cc as string[])
        : (headerMap.cc ? [(headerMap.cc as string)] : []),
      bcc: Array.isArray(headerMap.bcc)
        ? (headerMap.bcc as string[])
        : (headerMap.bcc ? [(headerMap.bcc as string)] : []),
      subject: (headerMap.subject as string) || null,
    };
  }

  async getMessage(
    conn: ProviderConnection,
    providerMessageId: string
  ): Promise<FullMessage> {
    const accessToken = await this.getAccessToken(conn);
    const res = await fetch(
      `${GMAIL_API_BASE}/messages/${providerMessageId}?format=full`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!res.ok) {
      if (res.status === 404) {
        throw new ProviderErrorClass("Message not found", "not_found");
      }
      throw new ProviderErrorClass(
        `Get message failed: ${res.status}`,
        "network"
      );
    }

    const msg = await res.json();
    const headers = msg.payload?.headers ?? [];
    const headerMap: Record<string, string> = {};

    for (const h of headers) {
      headerMap[h.name.toLowerCase()] = h.value;
    }

    const subject = headerMap.subject || null;
    const from = this.extractEmail(headerMap.from || "");
    const to = this.parseEmailList(headerMap.to || "");
    const cc = this.parseEmailList(headerMap.cc || "");
    const bcc = this.parseEmailList(headerMap.bcc || "");

    // Determine direction
    const userEmail = conn.email.toLowerCase();
    const direction: EmailDirection = from.toLowerCase() === userEmail
      ? "outbound"
      : "inbound";

    // Extract body
    const { snippet, bodyHtml, bodyText } =
      this.extractBody(msg.payload);

    return {
      providerMessageId,
      providerThreadId: msg.threadId,
      internetMessageId: headerMap["message-id"] || null,
      receivedAt: new Date(parseInt(msg.internalDate)).toISOString(),
      from,
      fromDisplay: headerMap.from || null,
      toAddresses: to.map((addr) => ({
        address: addr,
        rawAddress: addr,
      })),
      ccAddresses: cc.map((addr) => ({
        address: addr,
        rawAddress: addr,
      })),
      bccAddresses: bcc.map((addr) => ({
        address: addr,
        rawAddress: addr,
      })),
      to,
      cc,
      bcc,
      subject,
      snippet,
      bodyHtml: bodyHtml || null,
      bodyText: bodyText || null,
      labelsOrCategories: msg.labelIds ?? [],
      rawHeaders: JSON.stringify(headerMap),
      hasAttachments: (msg.payload?.parts ?? []).some(
        (p: { mimeType: string }) => p.mimeType.startsWith("application/")
      ),
    };
  }

  async sendMessage(
    conn: ProviderConnection,
    input: Parameters<EmailProvider["sendMessage"]>[1]
  ): Promise<MessageRef> {
    throw new Error("Not implemented in Stage 6");
  }

  async subscribeRealtime(
    conn: ProviderConnection,
    _params: { webhookUrl: string; clientStateHmac: string }
  ): Promise<{ id: string; expiresAt: string; metadata?: Record<string, unknown> }> {
    const token = await this.getAccessToken(conn);

    const projectId = process.env.GOOGLE_PUBSUB_PROJECT_ID;
    const topicName = process.env.GOOGLE_PUBSUB_TOPIC;
    if (!projectId || !topicName) {
      throw new ProviderErrorClass(
        "Missing GOOGLE_PUBSUB_PROJECT_ID or GOOGLE_PUBSUB_TOPIC",
        "unknown"
      );
    }

    const response = await fetch(`${GMAIL_API_BASE}/watch`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        topicName: `projects/${projectId}/topics/${topicName}`,
        labelIds: ["INBOX", "SENT"],
      }),
    });

    if (!response.ok) {
      throw new ProviderErrorClass(
        `Gmail watch failed: ${response.status} ${response.statusText}`,
        "unknown"
      );
    }

    const data = await response.json();
    // data = { historyId: "123456", expiration: "1714003200000" }
    const expiresAt = new Date(parseInt(data.expiration, 10)).toISOString();

    return {
      id: data.historyId ?? "",
      expiresAt,
      metadata: { historyId: data.historyId },
    };
  }

  async renewSubscription(
    conn: ProviderConnection,
    _sub?: { id: string; expiresAt: string }
  ): Promise<{ id: string; expiresAt: string }> {
    // Gmail watch is idempotent — re-calling users.watch renews the subscription
    const result = await this.subscribeRealtime(conn, {
      webhookUrl: "",
      clientStateHmac: "",
    });
    return { id: result.id, expiresAt: result.expiresAt };
  }

  async *fetchDelta(
    conn: ProviderConnection
  ): AsyncGenerator<FullMessage[]> {
    const token = await this.getAccessToken(conn);

    if (!conn.deltaCursor) {
      // First sync: start from a recent time
      const startTime = Math.floor(
        (Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000
      );

      for await (const messageRefs of this.listMessages(conn, {
        sinceIso: new Date(startTime * 1000).toISOString(),
        folder: "inbox",
      })) {
        const fullMessages: FullMessage[] = [];
        for (const ref of messageRefs) {
          fullMessages.push(await this.getMessage(conn, ref.providerMessageId));
        }
        yield fullMessages;
      }

      // Store initial historyId
      const historyResponse = await fetch(
        `${GMAIL_API_BASE}/profile`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const profileData = await historyResponse.json();

      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      await supabase
        .from("provider_connections")
        .update({ delta_cursor: profileData.historyId })
        .eq("id", conn.id);
    } else {
      // Subsequent syncs: fetch changes since historyId
      try {
        const params = new URLSearchParams({
          startHistoryId: conn.deltaCursor,
          fields: "history(messages(id))",
        });

        const response = await fetch(
          `${GMAIL_API_BASE}/history?${params}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (response.status === 401) {
          throw new ProviderErrorClass("Token expired", "invalid_grant");
        }

        if (!response.ok) {
          throw new ProviderErrorClass(
            `Failed to fetch delta: ${response.statusText}`,
            "unknown"
          );
        }

        const data = await response.json();
        const history = data.history || [];
        const messageIds = new Set<string>();

        for (const item of history) {
          if (item.messages) {
            for (const msg of item.messages) {
              messageIds.add(msg.id);
            }
          }
        }

        if (messageIds.size > 0) {
          const fullMessages: FullMessage[] = [];
          for (const msgId of messageIds) {
            fullMessages.push(await this.getMessage(conn, msgId));
          }
          yield fullMessages;
        }

        // Update historyId
        if (data.historyId) {
          const { createClient } = await import("@/lib/supabase/server");
          const supabase = await createClient();
          await supabase
            .from("provider_connections")
            .update({ delta_cursor: data.historyId })
            .eq("id", conn.id);
        }
      } catch (error) {
        if (error instanceof ProviderErrorClass) {
          throw error;
        }
        throw new ProviderErrorClass(
          `Error fetching delta: ${error}`,
          "unknown"
        );
      }
    }
  }

  private extractEmail(str: string): string {
    const match = str.match(/<([^>]+)>/);
    return (match ? match[1] : str).toLowerCase().trim();
  }

  private parseEmailList(str: string): string[] {
    if (!str) return [];
    return str
      .split(",")
      .map((e) => this.extractEmail(e))
      .filter((e) => e);
  }

  private extractBody(
    payload: {
      mimeType?: string;
      parts?: { mimeType: string; body: { data?: string } }[];
      body?: { data?: string };
    }
  ): { snippet: string; bodyHtml?: string; bodyText?: string } {
    let bodyHtml: string | undefined;
    let bodyText: string | undefined;

    if (payload.mimeType === "text/plain") {
      bodyText = payload.body?.data
        ? Buffer.from(payload.body.data, "base64").toString()
        : undefined;
    } else if (payload.mimeType === "text/html") {
      bodyHtml = payload.body?.data
        ? Buffer.from(payload.body.data, "base64").toString()
        : undefined;
    } else if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === "text/plain" && !bodyText) {
          bodyText = part.body?.data
            ? Buffer.from(part.body.data, "base64").toString()
            : undefined;
        } else if (part.mimeType === "text/html" && !bodyHtml) {
          bodyHtml = part.body?.data
            ? Buffer.from(part.body.data, "base64").toString()
            : undefined;
        }
      }
    }

    const snippet = (bodyText || bodyHtml || "")
      .substring(0, 150)
      .replace(/\s+/g, " ");

    return { snippet, bodyHtml, bodyText };
  }
}

export const gmailAdapter = new GmailAdapter();
