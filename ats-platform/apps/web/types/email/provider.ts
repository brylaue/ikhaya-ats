/**
 * Email provider abstraction.
 *
 * Two concrete adapters implement this: Gmail (Stage 6) and Microsoft Graph (Stage 7).
 * Everything above the adapter — matching, storage, timeline UI, admin, purge — is
 * provider-agnostic and consumes this interface.
 *
 * Do NOT leak provider-specific types (Gmail threadId, Graph deltaLink) across this
 * boundary. Convert to / from the shared types below inside each adapter.
 */

export type ProviderId = "google" | "microsoft";

export type EmailDirection = "inbound" | "outbound";

export type MatchStrategy = "exact" | "alt" | "thread" | "fuzzy";

export type MatchStatus = "active" | "pending_review" | "rejected";

/**
 * A lightweight handle to a message, used during backfill / delta pagination.
 * Full message body is fetched on-demand via getMessage().
 */
export interface MessageRef {
  providerMessageId: string;
  providerThreadId: string;
  internetMessageId?: string | null; // RFC 822 Message-ID, if available pre-fetch
  receivedAt: string;                // ISO 8601
  // Participant addresses (lowercased) — used by the matcher before we pay for body fetch.
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject?: string | null;
}

export interface EmailAddress {
  address: string;           // lowercased, normalised
  rawAddress: string;        // as seen on the wire
  displayName?: string | null;
}

/**
 * A fully hydrated message; produced by getMessage() and persisted.
 */
export interface FullMessage extends MessageRef {
  from: string;              // inherited, kept for convenience
  fromDisplay?: string | null;
  toAddresses: EmailAddress[];
  ccAddresses: EmailAddress[];
  bccAddresses: EmailAddress[];
  snippet: string;
  bodyHtml?: string | null;  // sanitised HTML
  bodyText?: string | null;
  labelsOrCategories: string[]; // gmail labels or outlook categories, normalised strings
  rawHeaders?: string | null;
  hasAttachments: boolean;
}

/**
 * Stored connection between an Ikhaya user and their provider account.
 * Refresh tokens never appear here in plaintext — they're held as encrypted refs.
 */
export interface ProviderConnection {
  id: string;                         // uuid
  userId: string;
  agencyId?: string;                  // agency this connection belongs to
  tenantId?: string;
  provider: ProviderId;
  providerSub: string;                // stable user id from provider
  email: string;
  msTenantId?: string | null;         // null for google
  scopes: string[];
  syncEnabled: boolean;
  backfillCompletedAt?: string | null;
  deltaCursor?: string | null;        // historyId (google) or deltaLink (microsoft)
  realtimeSubscriptionId?: string | null;
  realtimeExpiresAt?: string | null;
  accessTokenExpiresAt?: string | null;
  refreshTokenSecretRef?: string | null; // encrypted refresh token reference
  createdAt: string;
  updatedAt: string;
}

/**
 * Handle to an active realtime subscription (Gmail watch response, or Graph subscription).
 */
export interface Subscription {
  id: string;
  expiresAt: string;
  // Opaque provider-specific metadata (e.g., historyId at watch time). Stored as JSON.
  metadata?: Record<string, unknown>;
}

export interface SendMessageInput {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  inReplyTo?: string;        // internetMessageId of parent, for threading
  references?: string[];     // prior message-ids in the thread
  attachments?: Array<{
    filename: string;
    mimeType: string;
    contentBase64: string;
  }>;
}

/**
 * The provider-agnostic adapter contract. Each adapter is a stateless class
 * instantiated per-connection.
 */
export interface EmailProvider {
  readonly id: ProviderId;

  /** Build the consent URL for a fresh user. */
  buildAuthUrl(params: { state: string; loginHint?: string }): string;

  /** Exchange an auth code for tokens and a normalised connection row. */
  handleCallback(params: { code: string; state: string }): Promise<{
    connection: ProviderConnection;
    refreshToken: string;   // caller encrypts + stores this; never persist plaintext
  }>;

  /** Revoke access at the provider + invalidate our stored refresh token. */
  revoke(conn: ProviderConnection): Promise<void>;

  /**
   * Iterate candidate-eligible messages within the given window.
   * Implementations must paginate internally and yield batches.
   */
  listMessages(
    conn: ProviderConnection,
    opts: { sinceIso: string; folder: "inbox" | "sent" }
  ): AsyncIterable<MessageRef[]>;

  /** Fetch the full message payload once a match is confirmed. */
  getMessage(conn: ProviderConnection, providerMessageId: string): Promise<FullMessage>;

  /** Send a new message (Stage 6+ / v1.1). */
  sendMessage(conn: ProviderConnection, input: SendMessageInput): Promise<MessageRef>;

  /** Start a realtime subscription; returns opaque handle we must persist. */
  subscribeRealtime(
    conn: ProviderConnection,
    params: { webhookUrl: string; clientStateHmac: string }
  ): Promise<Subscription>;

  /** Renew before TTL. Returns updated subscription. */
  renewSubscription(conn: ProviderConnection, sub?: Subscription): Promise<Subscription>;

  /**
   * Pull messages that changed since the stored delta cursor.
   * Yields batches; caller runs them through the matcher, same path as backfill.
   */
  fetchDelta(conn: ProviderConnection): AsyncIterable<MessageRef[]>;
}

/**
 * Error taxonomy shared across providers. Each adapter normalises provider-specific
 * errors into one of these before throwing.
 */
export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "invalid_grant"        // refresh token revoked / expired
      | "insufficient_scope"   // user hasn't granted required scopes
      | "rate_limited"         // 429 / 503 — caller should backoff
      | "subscription_expired" // graph subscription past TTL, or gmail watch expired
      | "delta_expired"        // delta cursor invalidated (30d for graph)
      | "not_found"            // message or thread vanished
      | "admin_consent_required" // ms tenant requires admin consent
      | "network"
      | "unknown",
    public readonly cause?: unknown,
    public readonly retryAfterSeconds?: number
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
