import { describe, expect, it } from "vitest";
import { loadSaved, verdictToShareText } from "./storage";
import type { Verdict } from "./advisor";

const verdict: Verdict = {
  type: "verdict",
  call: "Skip",
  headline: "The cheaper one does everything you need.",
  why: ["You won't use the extra power.", "The battery is the same."],
  watchOut: ["The sale price is the regular price."],
  alternatives: [{ name: "Base model", note: "Same thing, less money." }],
  independenceNote: "Not sponsored.",
};

describe("verdictToShareText", () => {
  it("includes the topic and the call", () => {
    const out = verdictToShareText("MacBook Air M3", verdict);
    expect(out).toContain("MacBook Air M3");
    expect(out).toContain("I'd skip it");
  });

  it("labels each verdict type distinctly", () => {
    expect(verdictToShareText("x", { ...verdict, call: "Worth it" })).toContain("Worth it");
    expect(verdictToShareText("x", { ...verdict, call: "Maybe" })).toContain("Maybe");
    expect(verdictToShareText("x", { ...verdict, call: "Skip" })).toContain("skip");
  });

  it("includes reasons and caveats", () => {
    const out = verdictToShareText("x", verdict);
    expect(out).toContain("You won't use the extra power.");
    expect(out).toContain("The sale price is the regular price.");
  });

  // Shared text is the growth loop — it has to carry the promise, or sharing it
  // spreads the advice without the thing that makes the advice worth trusting.
  it("carries the independence line so shared advice stays attributable", () => {
    expect(verdictToShareText("x", verdict)).toContain("never sponsored");
  });

  it("handles a verdict with no reasons or caveats without breaking", () => {
    const bare: Verdict = { ...verdict, why: [], watchOut: [], alternatives: [] };
    const out = verdictToShareText("x", bare);
    expect(out).toContain("x");
    expect(out).not.toContain("Why:");
  });
});

describe("loadSaved outside the browser", () => {
  it("returns an empty list rather than throwing when localStorage is absent", () => {
    // This runs during SSR on every page render, so it must be safe in Node.
    expect(loadSaved()).toEqual([]);
  });
});
