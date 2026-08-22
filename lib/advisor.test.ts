import { describe, expect, it } from "vitest";
import { parseAdvisorResponse, SYSTEM_PROMPT, LAUNCH_CATEGORIES } from "./advisor";

// The model returns JSON as free text, so parsing is the single most failure-prone seam in
// the app. The contract that matters: it must NEVER throw and NEVER return something the
// UI can't render — a bad parse should degrade to a readable reply, not a blank screen.

describe("parseAdvisorResponse", () => {
  it("parses a clean verdict object", () => {
    const raw = JSON.stringify({
      type: "verdict",
      call: "Skip",
      headline: "Not for you.",
      why: ["a"],
      watchOut: ["b"],
      alternatives: [],
      independenceNote: "n",
    });
    const out = parseAdvisorResponse(raw);
    expect(out.type).toBe("verdict");
    if (out.type === "verdict") {
      expect(out.call).toBe("Skip");
      expect(out.why).toEqual(["a"]);
    }
  });

  it("parses a question", () => {
    const out = parseAdvisorResponse('{"type":"question","message":"What for?"}');
    expect(out).toEqual({ type: "question", message: "What for?" });
  });

  it("strips ```json code fences", () => {
    const out = parseAdvisorResponse('```json\n{"type":"reply","message":"hi"}\n```');
    expect(out).toEqual({ type: "reply", message: "hi" });
  });

  it("strips bare ``` fences", () => {
    const out = parseAdvisorResponse('```\n{"type":"reply","message":"hi"}\n```');
    expect(out).toEqual({ type: "reply", message: "hi" });
  });

  it("recovers JSON wrapped in chatty prose", () => {
    const raw = 'Sure! Here you go:\n{"type":"reply","message":"ok"}\nHope that helps.';
    const out = parseAdvisorResponse(raw);
    expect(out).toEqual({ type: "reply", message: "ok" });
  });

  it("falls back to a reply when the payload is not JSON at all", () => {
    const out = parseAdvisorResponse("I think you should probably skip it.");
    expect(out.type).toBe("reply");
    if (out.type === "reply") {
      expect(out.message).toBe("I think you should probably skip it.");
    }
  });

  it("falls back rather than throwing on malformed JSON", () => {
    const out = parseAdvisorResponse('{"type":"verdict", "call": ');
    expect(out.type).toBe("reply");
  });

  it("never returns an empty message for empty input", () => {
    const out = parseAdvisorResponse("   ");
    expect(out.type).toBe("reply");
    if (out.type === "reply") expect(out.message.length).toBeGreaterThan(0);
  });

  it("rejects JSON without a type field, degrading to a reply", () => {
    const out = parseAdvisorResponse('{"call":"Skip"}');
    expect(out.type).toBe("reply");
  });
});

describe("system prompt", () => {
  it("names every launch category so the model knows its remit", () => {
    for (const category of LAUNCH_CATEGORIES) {
      expect(SYSTEM_PROMPT).toContain(category);
    }
  });

  it("carries the independence promises that define the product", () => {
    expect(SYSTEM_PROMPT).toContain("INDEPENDENCE CHARTER");
    expect(SYSTEM_PROMPT.toLowerCase()).toContain("no sponsored placements");
  });

  it("instructs the model not to invent prices or discounts", () => {
    expect(SYSTEM_PROMPT).toContain("Never invent a price");
  });
});
