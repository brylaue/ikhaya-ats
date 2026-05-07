/**
 * Job queue singleton for the Ikhaya backend.
 *
 * Prod: BullMQ + Redis. Jobs are picked up by a separate worker process
 * (see `apps/worker` — lands in Stage 10 hardening). In dev / CI we swap
 * the Queue for `JobSchedulerStub`, which runs the handler in-process with
 * a microtask. That keeps `pnpm dev` single-service without spinning up
 * Redis for contributors who are only touching the UI.
 *
 * Switching between modes:
 *   - `REDIS_URL` set + NODE_ENV !== "test"  → real BullMQ
 *   - otherwise                              → in-process stub
 *
 * Stage 6 introduces the `email-sync` queue with two job types:
 *   - `backfill`  — 90-day historical pull, triggered by Google/Microsoft callback
 *   - `delta`     — incremental pull, triggered by pubsub / graph webhook
 */

import type { Queue as BullQueue, JobsOptions } from "bullmq";

// ─── Job definitions ─────────────────────────────────────────────────────────

export type EmailSyncJobName = "backfill" | "delta";

export interface BackfillJobData {
  connectionId: string;
}

export interface DeltaJobData {
  connectionId: string;
  // Opaque, provider-specific. Gmail: historyId; Graph: deltaLink.
  cursor?: string | null;
}

export type EmailSyncJobData = BackfillJobData | DeltaJobData;

// ─── Handler registry ────────────────────────────────────────────────────────

type Handler = (data: EmailSyncJobData) => Promise<void>;
const handlers: Partial<Record<EmailSyncJobName, Handler>> = {};

/**
 * Register a handler for a job name. Called once at module-load time by the
 * worker process (prod) or on first `emailSyncQueue.add` call (dev stub).
 */
export function registerEmailSyncHandler(name: EmailSyncJobName, handler: Handler): void {
  handlers[name] = handler;
}

// ─── Queue abstraction ───────────────────────────────────────────────────────

/** Minimal surface we need — lets us swap Bull for the stub without churn. */
export interface EmailSyncQueue {
  add(name: EmailSyncJobName, data: EmailSyncJobData, opts?: JobsOptions): Promise<void>;
  close(): Promise<void>;
}

// ─── Real BullMQ queue (lazy-loaded) ─────────────────────────────────────────

let _bullQueue: BullQueue | null = null;

async function getBullQueue(): Promise<BullQueue> {
  if (_bullQueue) return _bullQueue;

  const { Queue } = await import("bullmq");
  const IORedis = (await import("ioredis")).default;

  const url = process.env.REDIS_URL;
  if (!url) throw new Error("Missing REDIS_URL for BullMQ queue");

  const connection = new IORedis(url, {
    // BullMQ requirement — otherwise the workers hang on blocking commands.
    maxRetriesPerRequest: null,
  });

  _bullQueue = new Queue("email-sync", {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 10_000 },
      removeOnComplete: { age: 3600, count: 1000 },
      removeOnFail:      { age: 24 * 3600 },
    },
  });
  return _bullQueue;
}

// ─── Dev/test in-process stub ────────────────────────────────────────────────

/**
 * Runs the handler on a microtask. Errors are caught and logged so a
 * failing job doesn't crash the Next.js dev server. This is intentionally
 * fire-and-forget — if the user wants retries, they switch to real BullMQ.
 */
class JobSchedulerStub implements EmailSyncQueue {
  async add(name: EmailSyncJobName, data: EmailSyncJobData): Promise<void> {
    const handler = handlers[name];
    if (!handler) {
      console.warn(`[queue:stub] No handler registered for '${name}' — dropping job`);
      return;
    }
    // Microtask so the caller (e.g., OAuth callback) returns its response first.
    queueMicrotask(() => {
      handler(data).catch((err) => {
        console.error(`[queue:stub] Job '${name}' failed:`, err);
      });
    });
  }
  async close(): Promise<void> {
    // no-op
  }
}

class BullQueueAdapter implements EmailSyncQueue {
  async add(name: EmailSyncJobName, data: EmailSyncJobData, opts?: JobsOptions): Promise<void> {
    const q = await getBullQueue();
    await q.add(name, data, opts);
  }
  async close(): Promise<void> {
    if (_bullQueue) await _bullQueue.close();
    _bullQueue = null;
  }
}

// ─── Public singleton ────────────────────────────────────────────────────────

function makeQueue(): EmailSyncQueue {
  const hasRedis = !!process.env.REDIS_URL && process.env.NODE_ENV !== "test";
  return hasRedis ? new BullQueueAdapter() : new JobSchedulerStub();
}

let _queue: EmailSyncQueue | null = null;
export function emailSyncQueue(): EmailSyncQueue {
  if (!_queue) _queue = makeQueue();
  return _queue;
}

/** Test-only: reset the singleton. */
export function __resetQueueForTests(): void {
  _queue = null;
  _bullQueue = null;
  for (const k of Object.keys(handlers)) delete handlers[k as EmailSyncJobName];
}
