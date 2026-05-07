/**
 * Unit tests for email address normalisation.
 *
 * Spec §6 — matcher rules:
 *   - lowercase + trim
 *   - gmail dot-insensitive on @gmail.com / @googlemail.com
 *   - gmail +suffix stripped
 *   - outlook addresses NOT dot-normalised
 *
 * Stage 6.
 */

import { describe, it, expect } from "vitest";
import {
  normalizeEmail,
  expandAddresses,
  emailsMatch,
  parseAddressList,
  extractAddress,
} from "../normalize";

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  FOO@Bar.com  ")).toBe("foo@bar.com");
  });

  it("strips dots for @gmail.com", () => {
    expect(normalizeEmail("first.last@gmail.com")).toBe("firstlast@gmail.com");
  });

  it("strips +suffix for @gmail.com", () => {
    expect(normalizeEmail("first.last+recruit@gmail.com")).toBe("firstlast@gmail.com");
  });

  it("collapses googlemail.com onto gmail.com", () => {
    expect(normalizeEmail("firstlast@googlemail.com")).toBe("firstlast@gmail.com");
    expect(normalizeEmail("first.last+any@googlemail.com")).toBe("firstlast@gmail.com");
  });

  it("does NOT strip dots for outlook.com", () => {
    expect(normalizeEmail("first.last@outlook.com")).toBe("first.last@outlook.com");
  });

  it("does NOT strip dots for custom domains", () => {
    expect(normalizeEmail("first.last@acme.corp")).toBe("first.last@acme.corp");
  });

  it("unwraps display-name form", () => {
    expect(normalizeEmail("Alice <alice@acme.io>")).toBe("alice@acme.io");
  });

  it("is idempotent", () => {
    const once = normalizeEmail("First.Last+tag@GMAIL.com");
    const twice = normalizeEmail(once);
    expect(twice).toBe(once);
    expect(once).toBe("firstlast@gmail.com");
  });

  it("returns lowercased input when @ missing (does not throw)", () => {
    expect(normalizeEmail("not-an-email")).toBe("not-an-email");
  });
});

describe("emailsMatch", () => {
  it("matches gmail dot variants", () => {
    expect(emailsMatch("first.last@gmail.com", "firstlast@gmail.com")).toBe(true);
  });

  it("matches gmail ↔ googlemail", () => {
    expect(emailsMatch("firstlast@googlemail.com", "firstlast@gmail.com")).toBe(true);
  });

  it("distinguishes different local parts", () => {
    expect(emailsMatch("alice@gmail.com", "bob@gmail.com")).toBe(false);
  });

  it("distinguishes outlook dot variants (NOT matched)", () => {
    expect(emailsMatch("first.last@outlook.com", "firstlast@outlook.com")).toBe(false);
  });
});

describe("expandAddresses", () => {
  it("includes canonical form", () => {
    expect(expandAddresses("First.Last+x@gmail.com")).toContain("firstlast@gmail.com");
  });

  it("also keeps the bare lowercased form when it differs", () => {
    const out = expandAddresses("First.Last@Gmail.com");
    expect(out).toContain("firstlast@gmail.com");
    expect(out).toContain("first.last@gmail.com");
  });

  it("returns a single entry for already-canonical addresses", () => {
    expect(expandAddresses("alice@acme.io")).toEqual(["alice@acme.io"]);
  });
});

describe("parseAddressList", () => {
  it("splits comma-separated addresses", () => {
    expect(parseAddressList("a@x.com, b@y.com")).toEqual(["a@x.com", "b@y.com"]);
  });

  it("normalises each entry", () => {
    expect(parseAddressList("  Foo@Gmail.com, f.oo+x@gmail.com ")).toEqual([
      "foo@gmail.com",
      "foo@gmail.com",
    ]);
  });

  it("handles empty input", () => {
    expect(parseAddressList("")).toEqual([]);
  });
});

describe("extractAddress", () => {
  it("unwraps angle brackets", () => {
    expect(extractAddress('"Alice" <alice@acme.io>')).toBe("alice@acme.io");
  });

  it("passes through bare addresses", () => {
    expect(extractAddress("alice@acme.io")).toBe("alice@acme.io");
  });
});
