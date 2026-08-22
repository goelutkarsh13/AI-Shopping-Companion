import { describe, expect, it } from "vitest";
import { DEMO_NOTE, demoRespond } from "./demo";

const user = (content: string) => ({ role: "user", content });
const assistant = (content: string) => ({ role: "assistant", content });

describe("demo mode", () => {
  it("asks a clarifying question on the first turn", () => {
    const out = demoRespond([user("Is the MacBook Air worth it?")]);
    expect(out.type).toBe("question");
  });

  it("delivers a verdict once the user has answered", () => {
    const out = demoRespond([
      user("Is the MacBook Air worth it?"),
      assistant("What will you use it for?"),
      user("Mostly writing, about $1200."),
    ]);
    expect(out.type).toBe("verdict");
  });

  it("matches the laptop script", () => {
    const out = demoRespond([user("thinking about a macbook"), user("writing")]);
    expect(out.type).toBe("verdict");
    if (out.type === "verdict") expect(out.call).toBe("Maybe");
  });

  it("matches the sneaker script", () => {
    const out = demoRespond([user("are these running shoes worth it"), user("yes, weekly")]);
    expect(out.type).toBe("verdict");
    if (out.type === "verdict") expect(out.call).toBe("Worth it");
  });

  it("matches the skincare script and is willing to say skip", () => {
    const out = demoRespond([user("is this vitamin c serum good"), user("for brightening")]);
    expect(out.type).toBe("verdict");
    if (out.type === "verdict") expect(out.call).toBe("Skip");
  });

  it("matches the snowboard script", () => {
    const out = demoRespond([user("is the complete snowboard worth it"), user("a few times a year")]);
    expect(out.type).toBe("verdict");
    if (out.type === "verdict") expect(out.call).toBe("Maybe");
  });

  it("falls back gracefully for an unmatched category", () => {
    const out = demoRespond([user("should I buy a kayak"), user("for weekends")]);
    expect(out.type).toBe("verdict");
    if (out.type === "verdict") expect(out.headline.length).toBeGreaterThan(0);
  });

  it("is case-insensitive when matching", () => {
    const out = demoRespond([user("MACBOOK PRO"), user("writing")]);
    expect(out.type).toBe("verdict");
    if (out.type === "verdict") expect(out.call).toBe("Maybe");
  });

  // The product's premise is that it doesn't quietly mislead you. That has to apply to
  // the demo too — a canned answer must never pass itself off as real analysis.
  it("always discloses that it is scripted", () => {
    const question = demoRespond([user("laptop?")]);
    expect(question.type).toBe("question");
    if (question.type === "question") expect(question.message).toContain(DEMO_NOTE);

    const verdict = demoRespond([user("laptop?"), user("writing")]);
    expect(verdict.type).toBe("verdict");
    if (verdict.type === "verdict") expect(verdict.independenceNote).toContain(DEMO_NOTE);
  });

  it("always produces a renderable verdict shape", () => {
    const out = demoRespond([user("anything"), user("more")]);
    expect(out.type).toBe("verdict");
    if (out.type === "verdict") {
      expect(Array.isArray(out.why)).toBe(true);
      expect(Array.isArray(out.watchOut)).toBe(true);
      expect(Array.isArray(out.alternatives)).toBe(true);
      expect(out.watchOut.length).toBeGreaterThan(0);
      expect(["Worth it", "Maybe", "Skip"]).toContain(out.call);
    }
  });

  it("handles an empty conversation without throwing", () => {
    expect(() => demoRespond([])).not.toThrow();
  });
});
