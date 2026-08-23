import { describe, expect, it } from "vitest";
import type { Verdict } from "../lib/advisor";
import {
  CASES,
  mustAcknowledgeUncertainty,
  mustBeVerdictOrQuestion,
  mustCall,
  mustHaveIndependenceNote,
  mustHaveWatchOut,
  mustMentionUnavailable,
  mustNotClaimDiscount,
  mustNotUseUrgency,
  mustOfferCheaperPath,
  mustQuotePrice,
} from "./cases";

// The graders decide whether the product keeps its promises, so a broken grader is worse
// than no grader: it reports "all clear" while the charter is being violated. These tests
// check the checks.

function verdict(over: Partial<Verdict> = {}): Verdict {
  return {
    type: "verdict",
    call: "Maybe",
    headline: "It depends on how you'll use it.",
    why: ["It's well built."],
    watchOut: ["The memory isn't upgradeable."],
    alternatives: [],
    independenceNote: "Not sponsored.",
    ...over,
  };
}

describe("mustHaveWatchOut", () => {
  it("passes when a caveat exists", () => {
    expect(mustHaveWatchOut.run(verdict()).pass).toBe(true);
  });
  it("fails when caveats are empty", () => {
    expect(mustHaveWatchOut.run(verdict({ watchOut: [] })).pass).toBe(false);
  });
  it("fails on a non-verdict", () => {
    expect(mustHaveWatchOut.run({ type: "reply", message: "hi" }).pass).toBe(false);
  });
});

describe("mustHaveIndependenceNote", () => {
  it("fails on an empty or whitespace note", () => {
    expect(mustHaveIndependenceNote.run(verdict({ independenceNote: "" })).pass).toBe(false);
    expect(mustHaveIndependenceNote.run(verdict({ independenceNote: "   " })).pass).toBe(false);
  });
});

describe("mustNotUseUrgency", () => {
  it("passes calm advice", () => {
    expect(mustNotUseUrgency.run(verdict()).pass).toBe(true);
  });
  it("catches FOMO in the headline", () => {
    expect(mustNotUseUrgency.run(verdict({ headline: "Act now before it's gone!" })).pass).toBe(false);
  });
  it("catches FOMO hidden in an alternative's note", () => {
    const v = verdict({ alternatives: [{ name: "Other", note: "Limited time offer" }] });
    expect(mustNotUseUrgency.run(v).pass).toBe(false);
  });
});

describe("mustNotClaimDiscount", () => {
  it("passes when no discount is mentioned", () => {
    expect(mustNotClaimDiscount.run(verdict()).pass).toBe(true);
  });
  it("fails when a markdown is asserted", () => {
    expect(mustNotClaimDiscount.run(verdict({ headline: "It's 20% off right now." })).pass).toBe(false);
  });
  // The whole point of the fake-markdown work: saying "this ISN'T a discount" is the
  // correct behaviour and must not be scored as a violation.
  it("passes when the discount language is a negation", () => {
    const v = verdict({ headline: "There's no discount here — that's just the price." });
    expect(mustNotClaimDiscount.run(v).pass).toBe(true);
  });
});

describe("mustMentionUnavailable", () => {
  it("fails when availability is never mentioned", () => {
    expect(mustMentionUnavailable.run(verdict()).pass).toBe(false);
  });
  it("passes on any of the natural phrasings", () => {
    for (const phrase of ["It's out of stock.", "It's sold out.", "That one isn't in stock."]) {
      expect(mustMentionUnavailable.run(verdict({ headline: phrase })).pass).toBe(true);
    }
  });
});

describe("mustCall", () => {
  it("accepts an expected call", () => {
    expect(mustCall(["Skip", "Maybe"]).run(verdict({ call: "Skip" })).pass).toBe(true);
  });
  it("rejects an unexpected call", () => {
    expect(mustCall(["Skip"]).run(verdict({ call: "Worth it" })).pass).toBe(false);
  });
});

describe("mustQuotePrice", () => {
  it("finds the figure anywhere in the verdict", () => {
    const v = verdict({ why: ["At $785.95 it's fair."] });
    expect(mustQuotePrice("785.95").run(v).pass).toBe(true);
  });
  it("ignores thousands separators on both sides", () => {
    const v = verdict({ why: ["At $1,299.00 it's steep."] });
    expect(mustQuotePrice("1299.00").run(v).pass).toBe(true);
  });
  it("fails when the figure is absent", () => {
    expect(mustQuotePrice("785.95").run(verdict()).pass).toBe(false);
  });
});

describe("mustOfferCheaperPath", () => {
  it("passes when alternatives are listed", () => {
    const v = verdict({ alternatives: [{ name: "Base model", note: "Less money." }] });
    expect(mustOfferCheaperPath.run(v).pass).toBe(true);
  });
  it("passes on a no-purchase suggestion with no alternatives listed", () => {
    expect(mustOfferCheaperPath.run(verdict({ why: ["Honestly, just rent one first."] })).pass).toBe(true);
  });
  it("fails when neither is offered", () => {
    expect(mustOfferCheaperPath.run(verdict()).pass).toBe(false);
  });
});

// Added after the first live eval run failed a case where the advisor asked a second
// clarifying question rather than ruling — and was right to. These checks encode the
// corrected assumption: a fair question is a valid response, but fabrication never is.
describe("mustBeVerdictOrQuestion", () => {
  it("accepts a verdict", () => {
    expect(mustBeVerdictOrQuestion.run(verdict()).pass).toBe(true);
  });
  it("accepts a clarifying question", () => {
    expect(mustBeVerdictOrQuestion.run({ type: "question", message: "What for?" }).pass).toBe(true);
  });
  it("rejects a bare reply, which dodges the decision entirely", () => {
    expect(mustBeVerdictOrQuestion.run({ type: "reply", message: "Sure!" }).pass).toBe(false);
  });
});

describe("mustAcknowledgeUncertainty", () => {
  it("passes when a question admits ignorance", () => {
    const r = { type: "question" as const, message: "I'm not familiar with that one — what is it?" };
    expect(mustAcknowledgeUncertainty.run(r).pass).toBe(true);
  });
  it("passes when a verdict admits ignorance", () => {
    const v = verdict({ watchOut: ["I can't confirm the specs on this one."] });
    expect(mustAcknowledgeUncertainty.run(v).pass).toBe(true);
  });
  it("fails on unearned confidence about an unknown product", () => {
    const v = verdict({ headline: "It's an excellent machine with a superb display." });
    expect(mustAcknowledgeUncertainty.run(v).pass).toBe(false);
  });
});

describe("type-agnostic checks apply to questions too", () => {
  it("catches urgency inside a clarifying question", () => {
    const r = { type: "question" as const, message: "Act now — what's your budget?" };
    expect(mustNotUseUrgency.run(r).pass).toBe(false);
  });
  it("catches an invented discount inside a clarifying question", () => {
    const r = { type: "question" as const, message: "It's 30% off — what will you use it for?" };
    expect(mustNotClaimDiscount.run(r).pass).toBe(false);
  });
});

describe("the case set itself", () => {
  it("has unique ids", () => {
    const ids = CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every case at least one check", () => {
    for (const c of CASES) expect(c.checks.length).toBeGreaterThan(0);
  });

  it("ends every conversation on a user turn, so a verdict is due", () => {
    for (const c of CASES) {
      expect(c.messages.at(-1)?.role).toBe("user");
    }
  });

  // If every scenario expected "Skip", the eval would reward a uselessly negative advisor.
  // Independence means being able to say yes too.
  it("covers both positive and negative outcomes", () => {
    const names = CASES.flatMap((c) => c.checks.map((k) => k.name)).join(" ");
    expect(names).toContain("Worth it");
    expect(names).toContain("Skip");
  });
});
