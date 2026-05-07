/**
 * Token storage — delegates to AES-256-GCM encryption.
 *
 * This module re-exports the encrypt/decrypt functions that connections.ts
 * and other modules import. In dev, if EMAIL_TOKEN_ENCRYPTION_KEY is not set,
 * falls back to plaintext passthrough so local development works without
 * generating a key. In production this env var MUST be set.
 *
 * Stage 3: upgraded from identity passthrough to real AES-256-GCM.
 */

import { encryptToken, decryptToken } from "./encryption";

function checkProductionKey(): boolean {
  const hasKey = !!process.env.EMAIL_TOKEN_ENCRYPTION_KEY;
  const isProduction = process.env.NODE_ENV === "production";
  // US-324: in production, a missing key is a hard error — no silent plaintext fallback.
  // Throw lazily at first use so build-time page-data collection doesn't fail.
  if (!hasKey && isProduction) {
    throw new Error(
      "[token-store] EMAIL_TOKEN_ENCRYPTION_KEY must be set in production. " +
        "Generate a 32-byte hex key: openssl rand -hex 32"
    );
  }
  return hasKey;
}

/**
 * Encrypt a refresh token for storage in provider_connections.
 *
 * US-324: production without a key throws (see checkProductionKey).
 * In non-production, falls back to passthrough for local dev ergonomics.
 */
export async function encrypt(plaintext: string): Promise<string> {
  const hasKey = checkProductionKey();
  if (!hasKey) {
    console.warn(
      "[token-store] EMAIL_TOKEN_ENCRYPTION_KEY not set — storing token as plaintext. " +
        "This is only acceptable in local development."
    );
    return plaintext;
  }
  return encryptToken(plaintext);
}

/**
 * Decrypt a stored token from provider_connections.
 */
export async function decrypt(stored: string): Promise<string> {
  const hasKey = checkProductionKey();
  if (!hasKey) {
    return stored;
  }
  return decryptToken(stored);
}
