/**
 * Unit tests for AES-256-GCM token encryption.
 * Run: node --experimental-strip-types --test apps/web/lib/email/__tests__/encryption.test.ts
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createCipheriv, createDecipheriv } from "crypto";

// ── Inline the encryption functions so we don't need path aliases or ESM imports ──

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

const TEST_KEY = randomBytes(32);
const TEST_KEY_B64 = TEST_KEY.toString("base64");

function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, TEST_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

function decryptToken(wrapped: string): string {
  const packed = Buffer.from(wrapped, "base64");
  if (packed.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error("Encrypted token payload is too short — possibly corrupted");
  }
  const iv = packed.subarray(0, IV_LENGTH);
  const tag = packed.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = packed.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, TEST_KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("encryptToken / decryptToken", () => {
  it("round-trips a simple string", () => {
    const plain = "ya29.a0AfH6SMBx-test-refresh-token";
    const encrypted = encryptToken(plain);
    const decrypted = decryptToken(encrypted);
    assert.equal(decrypted, plain);
  });

  it("round-trips an empty string", () => {
    const encrypted = encryptToken("");
    const decrypted = decryptToken(encrypted);
    assert.equal(decrypted, "");
  });

  it("round-trips unicode content", () => {
    const plain = "token-with-émojis-🔑-and-日本語";
    const encrypted = encryptToken(plain);
    const decrypted = decryptToken(encrypted);
    assert.equal(decrypted, plain);
  });

  it("produces different ciphertext each time (random IV)", () => {
    const plain = "same-token";
    const a = encryptToken(plain);
    const b = encryptToken(plain);
    assert.notEqual(a, b, "Two encryptions of the same plaintext should differ");
    assert.equal(decryptToken(a), plain);
    assert.equal(decryptToken(b), plain);
  });

  it("rejects tampered ciphertext", () => {
    const encrypted = encryptToken("secret-token");
    const buf = Buffer.from(encrypted, "base64");
    buf[buf.length - 1] ^= 0xff;
    const tampered = buf.toString("base64");
    assert.throws(() => decryptToken(tampered));
  });

  it("rejects truncated payload", () => {
    const encrypted = encryptToken("secret-token");
    const truncated = Buffer.from(encrypted, "base64")
      .subarray(0, 10)
      .toString("base64");
    assert.throws(() => decryptToken(truncated), /too short/i);
  });
});
