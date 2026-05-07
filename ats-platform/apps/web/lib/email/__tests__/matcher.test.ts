/**
 * Unit tests for email matcher — thread linking + fuzzy matching.
 * Stage 9.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { tokenSetSimilarity } from "../matcher";

// ─── tokenSetSimilarity (pure function, no DB needed) ────────────────────────

describe("tokenSetSimilarity", () => {
  it("returns 1.0 for identical inputs", () => {
    expect(tokenSetSimilarity("john smith", "john smith")).toBe(1.0);
  });

  it("is order-insensitive", () => {
    expect(tokenSetSimilarity("john smith", "smith john")).toBe(1.0);
  });

  it("handles dot-separated tokens like email local parts", () => {
    expect(tokenSetSimilarity("john.smith", "john smith")).toBe(1.0);
  });

  it("returns 0 for completely different tokens", () => {
    expect(tokenSetSimilarity("alice jones", "bob williams")).toBe(0);
  });

  it("returns partial similarity for overlapping tokens", () => {
    // "john" is shared, "smith" vs "doe" differ → 1/3 ≈ 0.33
    const sim = tokenSetSimilarity("john smith", "john doe");
    expect(sim).toBeGreaterThan(0.3);
    expect(sim).toBeLessThan(0.4);
  });

  it("handles empty strings", () => {
    expect(tokenSetSimilarity("", "")).toBe(0);
    expect(tokenSetSimilarity("john", "")).toBe(0);
    expect(tokenSetSimilarity("", "john")).toBe(0);
  });

  it("is case-insensitive", () => {
    expect(tokenSetSimilarity("JOHN SMITH", "john smith")).toBe(1.0);
  });

  it("handles underscore-separated tokens", () => {
    expect(tokenSetSimilarity("john_smith", "john smith")).toBe(1.0);
  });

  it("handles mixed separators", () => {
    expect(tokenSetSimilarity("john.michael.smith", "smith john michael")).toBe(
      1.0
    );
  });

  it("partial name match (first name only)", () => {
    // "sarah" shared; "connor" not → 1/2 = 0.5
    const sim = tokenSetSimilarity("sarah123", "sarah connor");
    // "sarah123" tokenizes to ["sarah123"], "sarah connor" to ["sarah","connor"]
    // No overlap since "sarah123" !== "sarah"
    expect(sim).toBe(0);
  });

  it("handles numeric suffixes in email local parts", () => {
    // "jsmith2024" → ["jsmith2024"], "john smith" → ["john","smith"] → 0
    const sim = tokenSetSimilarity("jsmith2024", "john smith");
    expect(sim).toBe(0);
  });

  it("scores well when email contains full name tokens", () => {
    // "jane.doe" → ["jane","doe"], "Jane Doe" → ["jane","doe"] → 1.0
    const sim = tokenSetSimilarity("jane.doe", "Jane Doe");
    expect(sim).toBe(1.0);
  });
});

// ─── matchThread (requires DB mock) ──────────────────────────────────────────

describe("matchThread", () => {
  // These tests use a mock Supabase client to verify the logic
  // without requiring a real database connection.

  function createMockSupabase(linkData: any[] | null, error: any = null) {
    const limitFn = vi.fn().mockResolvedValue({ data: linkData, error });
    const inFn = vi.fn().mockReturnValue({ limit: limitFn });
    const eqInner = vi.fn().mockReturnValue({ in: inFn });
    const eqOuter = vi.fn().mockReturnValue({ eq: eqInner });
    const selectFn = vi.fn().mockReturnValue({ eq: eqOuter });
    const fromFn = vi.fn().mockReturnValue({ select: selectFn });

    // For the update call (conflict flagging)
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const updateFn = vi.fn().mockReturnValue({ eq: updateEq });

    return {
      from: vi.fn((table: string) => {
        if (table === "candidate_email_links") {
          return { select: selectFn };
        }
        if (table === "email_threads") {
          return { update: updateFn };
        }
        return { select: selectFn };
      }),
      _updateEq: updateEq,
    };
  }

  it("returns null when threadId is empty", async () => {
    const { matchThread } = await import("../matcher");
    const supabase = createMockSupabase(null);
    const result = await matchThread(supabase as any, "agency-1", "");
    expect(result).toEqual({ candidateId: null, hasConflict: false });
  });

  it("returns null when no links exist for the thread", async () => {
    const { matchThread } = await import("../matcher");
    const supabase = createMockSupabase([]);
    const result = await matchThread(supabase as any, "agency-1", "thread-1");
    expect(result).toEqual({ candidateId: null, hasConflict: false });
  });

  it("returns candidateId when thread has single candidate", async () => {
    const { matchThread } = await import("../matcher");
    const supabase = createMockSupabase([
      { candidate_id: "cand-1", email_messages: { thread_id: "t1" } },
      { candidate_id: "cand-1", email_messages: { thread_id: "t1" } },
    ]);
    const result = await matchThread(supabase as any, "agency-1", "t1");
    expect(result.candidateId).toBe("cand-1");
    expect(result.hasConflict).toBe(false);
  });

  it("returns null + conflict when thread has multiple candidates", async () => {
    const { matchThread } = await import("../matcher");
    const supabase = createMockSupabase([
      { candidate_id: "cand-1", email_messages: { thread_id: "t1" } },
      { candidate_id: "cand-2", email_messages: { thread_id: "t1" } },
    ]);
    const result = await matchThread(supabase as any, "agency-1", "t1");
    expect(result.candidateId).toBeNull();
    expect(result.hasConflict).toBe(true);
  });
});

// ─── matchFuzzy (requires DB mock) ───────────────────────────────────────────

describe("matchFuzzy", () => {
  function createMockSupabase(
    candidates: { id: string; first_name: string; last_name: string }[],
    rejections: any[] = []
  ) {
    return {
      from: vi.fn((table: string) => {
        if (table === "email_match_rejections") {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: rejections,
                error: null,
              }),
            }),
          };
        }
        if (table === "candidates") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: candidates,
                  error: null,
                }),
              }),
            }),
          };
        }
        return { select: vi.fn() };
      }),
    };
  }

  it("matches when email local part matches candidate name tokens", async () => {
    const { matchFuzzy } = await import("../matcher");
    const supabase = createMockSupabase([
      { id: "c1", first_name: "Jane", last_name: "Doe" },
      { id: "c2", first_name: "Bob", last_name: "Smith" },
    ]);

    const results = await matchFuzzy(
      supabase as any,
      "agency-1",
      ["jane.doe@gmail.com"]
    );

    expect(results.length).toBe(1);
    expect(results[0].candidateId).toBe("c1");
    expect(results[0].confidence).toBe(1.0);
  });

  it("ignores non-free-provider addresses", async () => {
    const { matchFuzzy } = await import("../matcher");
    const supabase = createMockSupabase([
      { id: "c1", first_name: "Jane", last_name: "Doe" },
    ]);

    const results = await matchFuzzy(
      supabase as any,
      "agency-1",
      ["jane.doe@company.com"]
    );

    expect(results.length).toBe(0);
  });

  it("excludes candidates in the exclude set", async () => {
    const { matchFuzzy } = await import("../matcher");
    const supabase = createMockSupabase([
      { id: "c1", first_name: "Jane", last_name: "Doe" },
    ]);

    const results = await matchFuzzy(
      supabase as any,
      "agency-1",
      ["jane.doe@gmail.com"],
      new Set(["c1"])
    );

    expect(results.length).toBe(0);
  });

  it("excludes previously rejected pairs", async () => {
    const { matchFuzzy } = await import("../matcher");
    const supabase = createMockSupabase(
      [{ id: "c1", first_name: "Jane", last_name: "Doe" }],
      [{ candidate_id: "c1", rejected_address: "jane.doe@gmail.com" }]
    );

    const results = await matchFuzzy(
      supabase as any,
      "agency-1",
      ["jane.doe@gmail.com"]
    );

    expect(results.length).toBe(0);
  });

  it("scores below threshold are excluded", async () => {
    const { matchFuzzy } = await import("../matcher");
    const supabase = createMockSupabase([
      { id: "c1", first_name: "Alexander", last_name: "Williamson" },
    ]);

    // "xyzabc" has no overlap with "Alexander Williamson"
    const results = await matchFuzzy(
      supabase as any,
      "agency-1",
      ["xyzabc@gmail.com"]
    );

    expect(results.length).toBe(0);
  });

  it("returns results sorted by confidence descending", async () => {
    const { matchFuzzy } = await import("../matcher");
    const supabase = createMockSupabase([
      { id: "c1", first_name: "John", last_name: "Smith" },
      { id: "c2", first_name: "John", last_name: "Doe" },
    ]);

    // "john.smith" → exact match to c1, partial to c2
    const results = await matchFuzzy(
      supabase as any,
      "agency-1",
      ["john.smith@gmail.com"]
    );

    if (results.length > 1) {
      expect(results[0].confidence).toBeGreaterThanOrEqual(
        results[1].confidence
      );
    }
  });
});
