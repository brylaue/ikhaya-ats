/**
 * Envelope encryption for email provider refresh tokens.
 *
 * Uses AES-256-GCM via Node.js `crypto` module.
 * Requires EMAIL_TOKEN_ENCRYPTION_KEY env var — a 32-byte base64 string.
 * Generate one with: `openssl rand -base64 32`
 *
 * Wire format (base64-encoded): iv (12 bytes) || authTag (16 bytes) || ciphertext
 *
 * Stage 3 — Google OAuth token storage.
 */

import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits — recommended for GCM
const TAG_LENGTH = 16; // 128 bits

function getKey(): Buffer {
  const raw = process.env.EMAIL_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "Missing EMAIL_TOKEN_ENCRYPTION_KEY — set a 32-byte base64 value in .env.local. " +
        "Generate with: openssl rand -base64 32"
    );
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error(
      `EMAIL_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (got ${buf.length}). ` +
        "Generate with: openssl rand -base64 32"
    );
  }
  return buf;
}

/**
 * Encrypt a plaintext refresh token.
 * Returns a base64 string of iv || authTag || ciphertext.
 */
export function encryptToken(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  // Pack: iv (12) + tag (16) + ciphertext
  const packed = Buffer.concat([iv, tag, encrypted]);
  return packed.toString("base64");
}

/**
 * Decrypt a wrapped token string (base64 of iv || authTag || ciphertext).
 * Returns the plaintext refresh token.
 */
export function decryptToken(wrapped: string): string {
  const key = getKey();
  const packed = Buffer.from(wrapped, "base64");

  if (packed.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error("Encrypted token payload is too short — possibly corrupted");
  }

  const iv = packed.subarray(0, IV_LENGTH);
  const tag = packed.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = packed.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
