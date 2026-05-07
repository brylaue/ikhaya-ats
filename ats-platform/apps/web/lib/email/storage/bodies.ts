/**
 * Email body blob storage.
 *
 * Bodies live in an S3-compatible bucket (R2, S3, Minio) rather than Postgres
 * because they're large, write-once, and rarely read. The `email_messages`
 * row only keeps a reference — the body is fetched lazily by the timeline UI.
 *
 * Key layout: `tenants/<tid>/<provider>/<provider_message_id>/body.html` (or `.text`)
 *
 * HTML is sanitised through DOMPurify before write — we never trust the
 * provider to have stripped script/iframe/onclick. Text bodies are stored
 * as-is since they can't execute.
 *
 * Stage 6.
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import DOMPurify from "isomorphic-dompurify";
import type { ProviderId } from "@/types/email/provider";

// ─── Client config ────────────────────────────────────────────────────────────

/**
 * Single shared S3 client, lazily constructed so builds without an S3 bucket
 * configured (dev, tests) don't crash at import time.
 */
let _client: S3Client | null = null;

function client(): S3Client {
  if (_client) return _client;

  const region = process.env.EMAIL_BODIES_S3_REGION ?? "auto";
  const endpoint = process.env.EMAIL_BODIES_S3_ENDPOINT; // R2/Minio override
  const accessKeyId = process.env.EMAIL_BODIES_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.EMAIL_BODIES_S3_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "S3 body storage not configured — set EMAIL_BODIES_S3_ACCESS_KEY_ID + EMAIL_BODIES_S3_SECRET_ACCESS_KEY"
    );
  }

  _client = new S3Client({
    region,
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    // R2 requires path-style; S3 accepts either
    forcePathStyle: !!endpoint,
  });
  return _client;
}

function bucket(): string {
  const b = process.env.EMAIL_BODIES_S3_BUCKET;
  if (!b) throw new Error("Missing EMAIL_BODIES_S3_BUCKET");
  return b;
}

// ─── Key helpers ──────────────────────────────────────────────────────────────

function htmlKey(tenantId: string, provider: ProviderId, providerMessageId: string): string {
  return `tenants/${tenantId}/${provider}/${providerMessageId}/body.html`;
}

function textKey(tenantId: string, provider: ProviderId, providerMessageId: string): string {
  return `tenants/${tenantId}/${provider}/${providerMessageId}/body.text`;
}

// ─── DOMPurify config ────────────────────────────────────────────────────────
// Strict: no script/iframe/object/embed/form; no `javascript:` / `data:` URIs.
// `mailto:` + https links allowed so Reply-in-timeline links still work.
const PURIFY_CFG: Parameters<typeof DOMPurify.sanitize>[1] = {
  ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|cid:)/i,
  FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input", "button"],
  FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus"],
  // Keep inline styles (email templates rely on them) but strip `expression(...)` via FORBID_CONTENTS
  // handled implicitly by DOMPurify's default CSS sanitiser.
};

// ─── Public API ──────────────────────────────────────────────────────────────

export interface StoreBodiesInput {
  tenantId: string;
  provider: ProviderId;
  providerMessageId: string;
  bodyHtml?: string | null;
  bodyText?: string | null;
}

/**
 * Sanitise and upload the HTML + text bodies. Safe to call repeatedly — S3
 * PutObject is idempotent on the same key.
 */
export async function storeBodies(input: StoreBodiesInput): Promise<{
  htmlKey: string | null;
  textKey: string | null;
  htmlBytes: number;
  textBytes: number;
}> {
  const { tenantId, provider, providerMessageId } = input;
  const hKey = htmlKey(tenantId, provider, providerMessageId);
  const tKey = textKey(tenantId, provider, providerMessageId);

  const c = client();
  const bkt = bucket();

  let htmlBytes = 0;
  let textBytes = 0;
  let storedHtmlKey: string | null = null;
  let storedTextKey: string | null = null;

  if (input.bodyHtml) {
    const clean = DOMPurify.sanitize(input.bodyHtml, PURIFY_CFG) as string;
    const buf = Buffer.from(clean, "utf-8");
    await c.send(
      new PutObjectCommand({
        Bucket: bkt,
        Key: hKey,
        Body: buf,
        ContentType: "text/html; charset=utf-8",
        // Force-downloads-as-attachment in the browser — nobody should ever
        // render these directly from object storage without going through
        // our timeline sandbox.
        ContentDisposition: "attachment",
      })
    );
    htmlBytes = buf.byteLength;
    storedHtmlKey = hKey;
  }

  if (input.bodyText) {
    const buf = Buffer.from(input.bodyText, "utf-8");
    await c.send(
      new PutObjectCommand({
        Bucket: bkt,
        Key: tKey,
        Body: buf,
        ContentType: "text/plain; charset=utf-8",
      })
    );
    textBytes = buf.byteLength;
    storedTextKey = tKey;
  }

  return { htmlKey: storedHtmlKey, textKey: storedTextKey, htmlBytes, textBytes };
}

export interface FetchBodiesInput {
  tenantId: string;
  provider: ProviderId;
  providerMessageId: string;
}

export interface FetchedBodies {
  bodyHtml: string | null;
  bodyText: string | null;
}

/**
 * Fetch stored bodies. Returns null for any key that doesn't exist — callers
 * should treat missing bodies as "never fetched" (e.g., message that matched
 * no candidate).
 */
export async function fetchBodies(input: FetchBodiesInput): Promise<FetchedBodies> {
  const { tenantId, provider, providerMessageId } = input;
  const c = client();
  const bkt = bucket();

  const [bodyHtml, bodyText] = await Promise.all([
    readKey(c, bkt, htmlKey(tenantId, provider, providerMessageId)),
    readKey(c, bkt, textKey(tenantId, provider, providerMessageId)),
  ]);

  return { bodyHtml, bodyText };
}

async function readKey(c: S3Client, bucketName: string, key: string): Promise<string | null> {
  try {
    const out = await c.send(new GetObjectCommand({ Bucket: bucketName, Key: key }));
    // Body is a ReadableStream in Node 18+
    const text = await out.Body?.transformToString("utf-8");
    return text ?? null;
  } catch (err: unknown) {
    const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (e?.name === "NoSuchKey" || e?.$metadata?.httpStatusCode === 404) return null;
    throw err;
  }
}

/**
 * Purge all bodies for a single message. Used by the data-purge worker (Stage 10)
 * when a candidate link is rejected or a connection is disconnected with "purge".
 */
export async function deleteBodies(input: FetchBodiesInput): Promise<void> {
  const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  const { tenantId, provider, providerMessageId } = input;
  const c = client();
  const bkt = bucket();

  await Promise.allSettled([
    c.send(new DeleteObjectCommand({ Bucket: bkt, Key: htmlKey(tenantId, provider, providerMessageId) })),
    c.send(new DeleteObjectCommand({ Bucket: bkt, Key: textKey(tenantId, provider, providerMessageId) })),
  ]);
}
