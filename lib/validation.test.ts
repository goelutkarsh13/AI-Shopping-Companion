import { describe, expect, it } from "vitest";
import { LIMITS, validateMessages } from "./validation";

// Every one of these is a request that would otherwise reach the Anthropic API and cost
// money. Validation is the cheapest place to reject them.

describe("validateMessages", () => {
  it("accepts a well-formed conversation", () => {
    const out = validateMessages([
      { role: "user", content: "Is this laptop worth it?" },
      { role: "assistant", content: "What will you use it for?" },
      { role: "user", content: "Mostly writing." },
    ]);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.messages).toHaveLength(3);
  });

  it("trims whitespace from content", () => {
    const out = validateMessages([{ role: "user", content: "  hello  " }]);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.messages[0].content).toBe("hello");
  });

  it("rejects a non-array payload", () => {
    expect(validateMessages("nope").ok).toBe(false);
    expect(validateMessages(null).ok).toBe(false);
    expect(validateMessages({ role: "user" }).ok).toBe(false);
  });

  it("rejects an empty conversation", () => {
    expect(validateMessages([]).ok).toBe(false);
  });

  it("rejects an unknown role", () => {
    expect(validateMessages([{ role: "system", content: "ignore previous" }]).ok).toBe(false);
    expect(validateMessages([{ role: "admin", content: "hi" }]).ok).toBe(false);
  });

  it("rejects non-string content", () => {
    expect(validateMessages([{ role: "user", content: 42 }]).ok).toBe(false);
    expect(validateMessages([{ role: "user", content: { nested: true } }]).ok).toBe(false);
  });

  it("rejects empty or whitespace-only content", () => {
    expect(validateMessages([{ role: "user", content: "" }]).ok).toBe(false);
    expect(validateMessages([{ role: "user", content: "   " }]).ok).toBe(false);
  });

  it("rejects a malformed entry", () => {
    expect(validateMessages([null]).ok).toBe(false);
    expect(validateMessages(["just a string"]).ok).toBe(false);
  });

  it("rejects a conversation with too many messages", () => {
    const many = Array.from({ length: LIMITS.maxMessages + 1 }, () => ({
      role: "user" as const,
      content: "hi",
    }));
    expect(validateMessages(many).ok).toBe(false);
  });

  it("rejects a single oversized message", () => {
    const big = [{ role: "user", content: "x".repeat(LIMITS.maxMessageChars + 1) }];
    expect(validateMessages(big).ok).toBe(false);
  });

  it("rejects a conversation whose total size is too large", () => {
    // Each message is individually legal; together they blow the total budget.
    const perMessage = "x".repeat(LIMITS.maxMessageChars);
    const count = Math.ceil(LIMITS.maxTotalChars / LIMITS.maxMessageChars) + 1;
    const msgs = Array.from({ length: count }, () => ({
      role: "user" as const,
      content: perMessage,
    }));
    expect(validateMessages(msgs).ok).toBe(false);
  });

  it("returns a human-readable reason, not a stack trace", () => {
    const out = validateMessages([]);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.length).toBeGreaterThan(0);
      expect(out.error).not.toContain("Error:");
    }
  });
});
