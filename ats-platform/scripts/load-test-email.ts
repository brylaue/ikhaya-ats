#!/usr/bin/env npx tsx
/**
 * Stage 10 — Email Sync Load Test
 *
 * Simulates 50 concurrent backfill workers hitting the backfill endpoint.
 * This is an ad-hoc test, NOT a unit test. Run manually and observe:
 *   - No 429 avalanche (check server logs)
 *   - Worker doesn't OOM (check process memory)
 *   - Total wall-time under 5 minutes
 *
 * Usage:
 *   APP_URL=http://localhost:3000 TEST_TOKEN=<jwt> npx tsx scripts/load-test-email.ts
 *
 * The TEST_TOKEN must be a valid JWT for an authenticated user with
 * an active email connection. In a dev environment, get one from the
 * browser's Supabase session.
 *
 * This script does NOT modify production data. It calls the backfill
 * endpoint which is idempotent (upserts).
 */

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const TOKEN = process.env.TEST_TOKEN;
const CONCURRENCY = 50;
const TIMEOUT_MS = 300_000; // 5 min

if (!TOKEN) {
  console.error("ERROR: Set TEST_TOKEN env var to a valid JWT.");
  process.exit(1);
}

interface Result {
  index: number;
  status: number;
  durationMs: number;
  error?: string;
}

async function runBackfill(index: number): Promise<Result> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(`${APP_URL}/api/email/backfill`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const durationMs = Date.now() - start;

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { index, status: res.status, durationMs, error: body.slice(0, 200) };
    }

    return { index, status: res.status, durationMs };
  } catch (err) {
    return {
      index,
      status: 0,
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main() {
  console.log(`\n=== Email Sync Load Test ===`);
  console.log(`Target: ${APP_URL}/api/email/backfill`);
  console.log(`Concurrency: ${CONCURRENCY}`);
  console.log(`Timeout: ${TIMEOUT_MS / 1000}s\n`);

  const overallStart = Date.now();

  // Launch all concurrent backfills
  const promises = Array.from({ length: CONCURRENCY }, (_, i) =>
    runBackfill(i)
  );

  const results = await Promise.all(promises);
  const overallDuration = Date.now() - overallStart;

  // Report
  const successes = results.filter((r) => r.status >= 200 && r.status < 300);
  const rate429 = results.filter((r) => r.status === 429);
  const errors = results.filter(
    (r) => r.status === 0 || r.status >= 500
  );
  const durations = results.map((r) => r.durationMs).sort((a, b) => a - b);
  const p50 = durations[Math.floor(durations.length * 0.5)];
  const p95 = durations[Math.floor(durations.length * 0.95)];
  const p99 = durations[Math.floor(durations.length * 0.99)];

  console.log("--- Results ---");
  console.log(`Total requests:   ${CONCURRENCY}`);
  console.log(`Successes (2xx):  ${successes.length}`);
  console.log(`Rate limited:     ${rate429.length}`);
  console.log(`Errors (5xx/net): ${errors.length}`);
  console.log(`Wall time:        ${(overallDuration / 1000).toFixed(1)}s`);
  console.log(`Latency P50:      ${(p50 / 1000).toFixed(2)}s`);
  console.log(`Latency P95:      ${(p95 / 1000).toFixed(2)}s`);
  console.log(`Latency P99:      ${(p99 / 1000).toFixed(2)}s`);

  if (errors.length > 0) {
    console.log("\n--- Error details ---");
    for (const e of errors.slice(0, 5)) {
      console.log(`  [${e.index}] status=${e.status} error=${e.error}`);
    }
  }

  if (rate429.length > 0) {
    console.log(
      `\nWARNING: ${rate429.length} of ${CONCURRENCY} requests were rate-limited (429).`
    );
    if (rate429.length > CONCURRENCY * 0.5) {
      console.log("FAIL: More than 50% of requests were rate-limited — likely a 429 avalanche.");
      process.exit(1);
    }
  }

  if (overallDuration > TIMEOUT_MS) {
    console.log(
      `\nFAIL: Total wall time (${(overallDuration / 1000).toFixed(1)}s) exceeds ${TIMEOUT_MS / 1000}s threshold.`
    );
    process.exit(1);
  }

  if (errors.length > CONCURRENCY * 0.1) {
    console.log(`\nFAIL: Error rate (${errors.length}/${CONCURRENCY}) exceeds 10% threshold.`);
    process.exit(1);
  }

  console.log("\nPASS: Load test completed within thresholds.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
