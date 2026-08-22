import { describe, expect, it } from "vitest";
import { extractSearchTerms } from "./query";

// This module exists because of a real bug: raw conversational questions were being sent
// to Shopify's catalog search, matching nothing, and degrading silently to "no live data".

describe("extractSearchTerms", () => {
  it("reduces the question that exposed the bug to real search terms", () => {
    const out = extractSearchTerms("Is the Compare at Price Snowboard worth it?");
    expect(out).toContain("snowboard");
    expect(out).toContain("compare");
    expect(out).not.toContain("worth");
    expect(out).not.toContain("?");
  });

  it("keeps product nouns and drops question framing", () => {
    expect(extractSearchTerms("Should I buy the MacBook Air?")).toBe("macbook air");
  });

  it("strips shopping filler while keeping the product name", () => {
    expect(extractSearchTerms("is this vitamin c serum a good deal for me")).toBe(
      "vitamin c serum"
    );
  });

  it("drops punctuation entirely", () => {
    expect(extractSearchTerms("snowboard!!! ??? ...")).toBe("snowboard");
  });

  it("keeps hyphenated product names intact", () => {
    expect(extractSearchTerms("are the all-weather boots worth it")).toContain("all-weather");
  });

  it("drops bare numbers, which are budgets rather than product names", () => {
    const out = extractSearchTerms("a laptop for 1200");
    expect(out).toBe("laptop");
  });

  it("keeps alphanumeric model names", () => {
    expect(extractSearchTerms("is the m3 chip worth it")).toContain("m3");
  });

  it("returns empty string for pure filler, so we skip the search entirely", () => {
    expect(extractSearchTerms("should I buy this?")).toBe("");
    expect(extractSearchTerms("hi hello thanks")).toBe("");
  });

  it("handles empty and whitespace input", () => {
    expect(extractSearchTerms("")).toBe("");
    expect(extractSearchTerms("   ")).toBe("");
  });

  it("caps the number of terms so a rambling message stays a usable query", () => {
    const rambling =
      "snowboard bindings boots helmet goggles gloves jacket trousers socks backpack wax straps";
    expect(extractSearchTerms(rambling).split(" ").length).toBeLessThanOrEqual(8);
  });

  it("lowercases for consistent matching", () => {
    expect(extractSearchTerms("MacBook AIR")).toBe("macbook air");
  });
});
