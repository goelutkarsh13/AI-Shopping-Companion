import { beforeEach, describe, expect, it } from "vitest";
import { __resetRateLimits, clientKey, rateLimit } from "./ratelimit";

beforeEach(() => __resetRateLimits());

describe("rateLimit", () => {
  it("allows requests up to the limit", () => {
    for (let i = 0; i < 5; i++) {
      expect(rateLimit("ip", 5, 60_000, 1000).ok).toBe(true);
    }
  });

  it("blocks the request that exceeds the limit", () => {
    for (let i = 0; i < 3; i++) rateLimit("ip", 3, 60_000, 1000);
    expect(rateLimit("ip", 3, 60_000, 1000).ok).toBe(false);
  });

  it("counts down remaining allowance", () => {
    expect(rateLimit("ip", 3, 60_000, 1000).remaining).toBe(2);
    expect(rateLimit("ip", 3, 60_000, 1000).remaining).toBe(1);
    expect(rateLimit("ip", 3, 60_000, 1000).remaining).toBe(0);
  });

  it("keeps separate budgets per key", () => {
    rateLimit("a", 1, 60_000, 1000);
    expect(rateLimit("a", 1, 60_000, 1000).ok).toBe(false);
    expect(rateLimit("b", 1, 60_000, 1000).ok).toBe(true);
  });

  it("resets once the window has elapsed", () => {
    rateLimit("ip", 1, 60_000, 1000);
    expect(rateLimit("ip", 1, 60_000, 1000).ok).toBe(false);
    expect(rateLimit("ip", 1, 60_000, 61_001).ok).toBe(true);
  });

  it("reports a retry-after within the window", () => {
    rateLimit("ip", 1, 60_000, 1000);
    const blocked = rateLimit("ip", 1, 60_000, 31_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfter).toBe(30);
  });
});

describe("clientKey", () => {
  it("takes the first entry of x-forwarded-for (the real client, not a proxy hop)", () => {
    const h = new Headers({ "x-forwarded-for": "203.0.113.7, 70.41.3.18, 150.172.238.178" });
    expect(clientKey(h)).toBe("203.0.113.7");
  });

  it("trims whitespace", () => {
    expect(clientKey(new Headers({ "x-forwarded-for": "  203.0.113.7  " }))).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip", () => {
    expect(clientKey(new Headers({ "x-real-ip": "198.51.100.4" }))).toBe("198.51.100.4");
  });

  it("degrades to a shared bucket rather than no limit when no IP header exists", () => {
    expect(clientKey(new Headers())).toBe("unknown");
  });
});
