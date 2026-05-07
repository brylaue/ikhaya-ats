/**
 * Microsoft Graph adapter implementing the EmailProvider interface.
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

const TOKEN_ENDPOINT = "https://login.microsoftonline.com";
const GRAPH_API_BASE = "https://graph.microsoft.com/v1.0/me";

class GraphAdapter implements EmailProvider {
  readonly id = "microsoft" as const;

  /**
   * Stub: full OAuth callback flow lives in `lib/email/providers/microsoft.ts`.
   * This adapter is the legacy path used by cron/webhook routes.
   */
  async handleCallback(_params: { code: string; state: string }): Promise<{
    connection: ProviderConnection;
    refreshToken: string;
  }> {
    throw new ProviderErrorClass(
      "handleCallback not implemented in legacy graph-adapter — use providers/microsoft.ts",
      "unknown"
    );
  }

  buildAuthUrl(params: { state: string; loginHint?: string }): string {
    const clientId = process.env.MS_OAUTH_CLIENT_ID;
    const authority = process.env.MS_OAUTH_AUTHORITY;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;

    if (!clientId || !authority || !appUrl) {
      throw new Error(
        "Missing MS_OAUTH_CLIENT_ID, MS_OAUTH_AUTHORITY, or NEXT_PUBLIC_APP_URL"
      );
    }

    const url = new URL(`${authority}/oauth2/v2.0/authorize`);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", `${appUrl}/api/auth/microsoft/callback`);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("response_mode", "query");
    url.searchParams.set(
      "scope",
      [
        "openid",
        "email",
        "profile",
        "Mail.ReadWrite",
        "Calendars.ReadWrite",
      ].join(" ")
    );
    url.searchParams.set("state", params.state);
    url.searchParams.set("prompt", "login");

    return url.toString();
  }

  async getAccessToken(conn: ProviderConnection): Promise<string> {
    if (!conn.refreshTokenSecretRef) {
      throw new ProviderErrorClass("No refresh token stored", "invalid_grant");
    }

    const decrypted = await decrypt(conn.refreshTokenSecretRef ?? "");
    const clientId = process.env.MS_OAUTH_CLIENT_ID;
    const clientSecret = process.env.MS_OAUTH_CLIENT_SECRET;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    const authority = process.env.MS_OAUTH_AUTHORITY;

    if (!clientId || !clientSecret || !appUrl || !authority) {
      throw new ProviderErrorClass("Missing OAuth environment variables", "unknown");
    }

    const tenant = conn.msTenantId || "common";

    try {
      const response = await fetch(
        `${authority}/${tenant}/oauth2/v2.0/token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: decrypted,
            redirect_uri: `${appUrl}/api/auth/microsoft/callback`,
          }).toString(),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new ProviderErrorClass(
          response.status === 401 ? "invalid_grant" : "unknown",
          data.error || `Token refresh failed: ${response.statusText}`
        );
      }

      const data = await response.json();
      const expiresAt = new Date(Date.now() + data.expires_in * 1000);

      // Update token in database
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();

      const encrypted = await encrypt(data.refresh_token);

      // US-339 + US-340: Optimistic locking via token_revision.
      // If 0 rows updated, a concurrent refresh already succeeded — log and
      // continue (the winning refresh holds a valid token). If there's a DB
      // error, disable the connection and surface it.
      const currentRevision: number = (conn as any).token_revision ?? 1;
      const { data: updateData, error: updateError } = await supabase
        .from("provider_connections")
        .update({
          access_token: data.access_token,
          access_token_expires_at: expiresAt.toISOString(),
          refresh_token: encrypted,
          token_revision: currentRevision + 1,
        })
        .eq("id", conn.id)
        .eq("token_revision", currentRevision) // US-340: optimistic lock
        .select("id");
      const updateCount = updateData?.length ?? 0;

      if (updateError) {
        // US-339: Persist failure — disable connection and write audit event
        console.error(`[graph-adapter] Token persist error for ${conn.id}:`, updateError);
        await supabase
          .from("provider_connections")
          .update({ sync_enabled: false })
          .eq("id", conn.id);
        await supabase.from("sync_events").insert({
          agency_id: conn.msTenantId,
          user_id: conn.userId,
          provider: "microsoft",
          event_type: "unknown",
          detail: { error: updateError.message },
        });
        throw new ProviderErrorClass("Token persist failed — connection disabled", "unknown");
      }

      if ((updateCount ?? 0) === 0) {
        console.warn(`[graph-adapter] Token revision mismatch for ${conn.id} — concurrent refresh detected`);
      }

      return data.access_token;
    } catch (error) {
      if (error instanceof ProviderErrorClass) {
        throw error;
      }
      throw new ProviderErrorClass(`Token refresh failed: ${error}`, "unknown");
    }
  }

  async *listMessages(
    conn: ProviderConnection,
    opts: { sinceIso: string; folder: "inbox" | "sent" } = { sinceIso: new Date(0).toISOString(), folder: "inbox" }
  ): AsyncGenerator<MessageRef[]> {
    const token = await this.getAccessToken(conn);
    let skip = 0;
    const pageSize = 50;

    const filter = `receivedDateTime ge ${opts.sinceIso}`;

    while (true) {
      try {
        const url = new URL(`${GRAPH_API_BASE}/messages`);
        url.searchParams.set("$filter", filter);
        url.searchParams.set("$skip", skip.toString());
        url.searchParams.set("$top", pageSize.toString());
        url.searchParams.set(
          "$select",
          [
            "id",
            "from",
            "toRecipients",
            "ccRecipients",
            "bccRecipients",
            "subject",
            "sentDateTime",
            "receivedDateTime",
            "internetMessageId",
            "hasAttachments",
          ].join(",")
        );

        const response = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (response.status === 401) {
          throw new ProviderErrorClass("Token expired", "invalid_grant");
        }

        if (!response.ok) {
          throw new ProviderErrorClass(`Failed to list messages: ${response.statusText}`, "unknown");
        }

        const data = await response.json();
        const messages = data.value || [];

        if (messages.length === 0) break;

        const refs: MessageRef[] = messages.map((msg: any) => ({
          providerMessageId: msg.id,
          providerThreadId: msg.conversationId ?? msg.id,
          internetMessageId: msg.internetMessageId ?? null,
          receivedAt: msg.receivedDateTime || msg.sentDateTime || new Date().toISOString(),
          from: msg.from?.emailAddress?.address?.toLowerCase() ?? "",
          to: (msg.toRecipients ?? []).map((r: any) => r.emailAddress?.address?.toLowerCase()).filter(Boolean),
          cc: (msg.ccRecipients ?? []).map((r: any) => r.emailAddress?.address?.toLowerCase()).filter(Boolean),
          bcc: (msg.bccRecipients ?? []).map((r: any) => r.emailAddress?.address?.toLowerCase()).filter(Boolean),
          subject: msg.subject ?? null,
        }));

        yield refs;

        skip += pageSize;
      } catch (error) {
        if (error instanceof ProviderErrorClass) {
          throw error;
        }
        throw new ProviderErrorClass(`Error listing messages: ${error}`, "unknown");
      }
    }
  }

  async getMessage(
    conn: ProviderConnection,
    id: string
  ): Promise<FullMessage> {
    const token = await this.getAccessToken(conn);

    try {
      const response = await fetch(`${GRAPH_API_BASE}/messages/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 401) {
        throw new ProviderErrorClass("Token expired", "invalid_grant");
      }

      if (response.status === 404) {
        throw new ProviderErrorClass("Message not found", "not_found");
      }

      if (!response.ok) {
        throw new ProviderErrorClass(`Failed to get message: ${response.statusText}`, "unknown");
      }

      const msg = await response.json();

      // Extract body
      const bodyContent =
        msg.bodyPreview ||
        (msg.body?.content
          ? msg.body.content.substring(0, 500)
          : "");

      // Determine direction
      const userEmail = conn.email;
      const fromEmail = msg.from?.emailAddress?.address || "";
      const direction: EmailDirection =
        fromEmail.toLowerCase() === userEmail.toLowerCase()
          ? "outbound"
          : "inbound";

      // Extract recipients
      const toAddresses = (msg.toRecipients || []).map(
        (r: any) => r.emailAddress?.address
      );
      const ccAddresses = (msg.ccRecipients || []).map(
        (r: any) => r.emailAddress?.address
      );
      const bccAddresses = (msg.bccRecipients || []).map(
        (r: any) => r.emailAddress?.address
      );

      void direction; // computed for diagnostics; not part of FullMessage shape
      return {
        providerMessageId: msg.id,
        providerThreadId: msg.conversationId ?? msg.id,
        internetMessageId: msg.internetMessageId ?? null,
        receivedAt: msg.receivedDateTime || msg.sentDateTime || new Date().toISOString(),
        from: fromEmail.toLowerCase(),
        fromDisplay: msg.from?.emailAddress?.name ?? null,
        to: toAddresses,
        cc: ccAddresses,
        bcc: bccAddresses,
        toAddresses: toAddresses.map((a: string) => ({ address: a.toLowerCase(), rawAddress: a })),
        ccAddresses: ccAddresses.map((a: string) => ({ address: a.toLowerCase(), rawAddress: a })),
        bccAddresses: bccAddresses.map((a: string) => ({ address: a.toLowerCase(), rawAddress: a })),
        subject: msg.subject || "(no subject)",
        snippet: bodyContent,
        bodyHtml: msg.body?.content ?? null,
        bodyText: null,
        labelsOrCategories: [],
        rawHeaders: null,
        hasAttachments: msg.hasAttachments || false,
      };
    } catch (error) {
      if (error instanceof ProviderErrorClass) {
        throw error;
      }
      throw new ProviderErrorClass(`Error getting message: ${error}`, "unknown");
    }
  }

  async *fetchDelta(conn: ProviderConnection): AsyncGenerator<FullMessage[]> {
    const token = await this.getAccessToken(conn);
    let deltaLink = conn.deltaCursor;

    if (!deltaLink) {
      // First sync: get initial delta link
      try {
        const response = await fetch(`${GRAPH_API_BASE}/messages/delta`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          throw new ProviderErrorClass(`Failed to get delta: ${response.statusText}`, "unknown");
        }

        const data = await response.json();
        deltaLink = data["@odata.deltaLink"];

        const messages = data.value || [];
        const fullMessages: FullMessage[] = [];

        for (const msg of messages) {
          fullMessages.push(await this.getMessage(conn, msg.id));
        }

        if (fullMessages.length > 0) {
          yield fullMessages;
        }

        // Store deltaLink
        const { createClient } = await import("@/lib/supabase/server");
        const supabase = await createClient();
        await supabase
          .from("provider_connections")
          .update({ delta_cursor: deltaLink })
          .eq("id", conn.id);
      } catch (error) {
        if (error instanceof ProviderErrorClass) {
          throw error;
        }
        throw new ProviderErrorClass(`Error fetching delta: ${error}`, "unknown");
      }
    } else {
      // Subsequent syncs: use stored delta link
      try {
        const response = await fetch(deltaLink, {
          headers: { Authorization: `Bearer ${token}` },
        });

        // 410 Gone = delta cursor expired (>30 days idle). Trigger re-backfill.
        if (response.status === 410) {
          console.warn(
            `fetchDelta: Graph delta link expired for connection ${conn.id}, clearing cursor for re-backfill`
          );
          const { createClient } = await import("@/lib/supabase/server");
          const supabase = await createClient();
          await supabase
            .from("provider_connections")
            .update({ delta_cursor: null })
            .eq("id", conn.id);
          throw new ProviderErrorClass(
            "Delta link expired (410 Gone) — connection needs re-backfill",
            "delta_expired"
          );
        }

        if (!response.ok) {
          throw new ProviderErrorClass(`Failed to fetch delta updates: ${response.statusText}`, "unknown");
        }

        const data = await response.json();
        const messages = data.value || [];

        const fullMessages: FullMessage[] = [];
        for (const msg of messages) {
          if (msg.id) {
            fullMessages.push(await this.getMessage(conn, msg.id));
          }
        }

        if (fullMessages.length > 0) {
          yield fullMessages;
        }

        // Update deltaLink if provided
        if (data["@odata.deltaLink"]) {
          const { createClient } = await import("@/lib/supabase/server");
          const supabase = await createClient();
          await supabase
            .from("provider_connections")
            .update({ delta_cursor: data["@odata.deltaLink"] })
            .eq("id", conn.id);
        }
      } catch (error) {
        if (error instanceof ProviderErrorClass) {
          throw error;
        }
        throw new ProviderErrorClass(`Error fetching delta updates: ${error}`, "unknown");
      }
    }
  }

  /**
   * Create realtime subscriptions for inbox AND sentitems.
   * Returns a combined Subscription with IDs stored as JSON array.
   */
  async subscribeRealtime(
    conn: ProviderConnection,
    params: { webhookUrl: string; clientStateHmac: string }
  ): Promise<{ id: string; expiresAt: string }> {
    const token = await this.getAccessToken(conn);
    const webhookUrl = params.webhookUrl || process.env.MS_GRAPH_WEBHOOK_URL;

    if (!webhookUrl) {
      throw new ProviderErrorClass("MS_GRAPH_WEBHOOK_URL not configured", "unknown");
    }

    const clientState = params.clientStateHmac || conn.id;
    // Max Graph mail subscription: 4230 min (~70.5h). We use 70h = 4200 min.
    const expirationDateTime = new Date(
      Date.now() + 70 * 60 * 60 * 1000
    ).toISOString();

    const folders = [
      "/me/mailFolders('inbox')/messages",
      "/me/mailFolders('sentitems')/messages",
    ];

    const subscriptionIds: string[] = [];
    let latestExpiry = expirationDateTime;

    for (const resource of folders) {
      const response = await fetch("https://graph.microsoft.com/v1.0/subscriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          changeType: "created,updated",
          notificationUrl: webhookUrl,
          resource,
          expirationDateTime,
          clientState,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new ProviderErrorClass(`Failed to create Graph subscription for ${resource}: ${response.status} — ${body}`, "unknown");
      }

      const data = await response.json();
      subscriptionIds.push(data.id);
      latestExpiry = data.expirationDateTime;
    }

    // Store both subscription IDs as JSON array
    return {
      id: JSON.stringify(subscriptionIds),
      expiresAt: latestExpiry,
    };
  }

  /**
   * Renew existing Graph subscriptions by PATCHing new expiry.
   */
  async renewSubscription(
    conn: ProviderConnection,
    sub?: { id: string; expiresAt: string }
  ): Promise<{ id: string; expiresAt: string }> {
    const token = await this.getAccessToken(conn);
    const storedId = sub?.id ?? conn.realtimeSubscriptionId;

    if (!storedId) {
      // No existing subscription — create fresh
      const hmacSecret = process.env.MS_GRAPH_WEBHOOK_CLIENT_STATE_SECRET ?? "";
      const crypto = await import("crypto");
      const hmac = crypto
        .createHmac("sha256", hmacSecret)
        .update(conn.id)
        .digest("hex");
      const clientState = Buffer.from(`${conn.id}:${hmac}`).toString("base64");

      return this.subscribeRealtime(conn, {
        webhookUrl: process.env.MS_GRAPH_WEBHOOK_URL ?? "",
        clientStateHmac: clientState,
      });
    }

    // Parse subscription IDs (may be a JSON array or a single ID)
    let ids: string[];
    try {
      ids = JSON.parse(storedId);
      if (!Array.isArray(ids)) ids = [storedId];
    } catch {
      ids = [storedId];
    }

    const newExpiry = new Date(
      Date.now() + 70 * 60 * 60 * 1000
    ).toISOString();

    const renewedIds: string[] = [];

    for (const subscriptionId of ids) {
      try {
        const response = await fetch(
          `https://graph.microsoft.com/v1.0/subscriptions/${subscriptionId}`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              expirationDateTime: newExpiry,
            }),
          }
        );

        if (response.ok) {
          renewedIds.push(subscriptionId);
        } else if (response.status === 404) {
          // Subscription gone — will be re-created on next full subscribe
          console.warn(
            `renewSubscription: subscription ${subscriptionId} not found, skipping`
          );
        } else {
          const body = await response.text();
          console.error(
            `renewSubscription: failed to renew ${subscriptionId}: ${response.status} — ${body}`
          );
        }
      } catch (err) {
        console.error(`renewSubscription: error renewing ${subscriptionId}:`, err);
      }
    }

    return {
      id: JSON.stringify(renewedIds.length > 0 ? renewedIds : ids),
      expiresAt: newExpiry,
    };
  }

  async sendMessage(
    _conn: ProviderConnection,
    _input: import("@/types/email/provider").SendMessageInput
  ): Promise<MessageRef> {
    throw new ProviderErrorClass("sendMessage not yet implemented", "unknown");
  }

  async revoke(conn: ProviderConnection): Promise<void> {
    if (!conn.refreshTokenSecretRef) {
      return;
    }

    const decrypted = await decrypt(conn.refreshTokenSecretRef ?? "");
    const clientId = process.env.MS_OAUTH_CLIENT_ID;
    const clientSecret = process.env.MS_OAUTH_CLIENT_SECRET;
    const authority = process.env.MS_OAUTH_AUTHORITY;
    const tenant = conn.msTenantId || "common";

    if (!clientId || !clientSecret || !authority) {
      console.error("Missing OAuth environment variables for revoke");
      return;
    }

    try {
      await fetch(`${authority}/${tenant}/oauth2/v2.0/token/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          token: decrypted,
        }).toString(),
      });
    } catch (error) {
      console.error("Error revoking Microsoft token:", error);
    }
  }
}

export const graphAdapter = new GraphAdapter();
