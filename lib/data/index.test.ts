import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProductResult } from "./types";
import { discountPercent } from "./types";

// Provider selection reads process.env at call time, so each test sets its own environment.
const ENV_KEYS = [
  "SHOPIFY_STORE_DOMAIN",
  "SHOPIFY_STOREFRONT_PRIVATE_TOKEN",
  "SHOPIFY_STOREFRONT_ACCESS_TOKEN",
  "SERPAPI_KEY",
];

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.unstubAllGlobals();
});

describe("provider selection", () => {
  it("reports no provider when nothing is configured", async () => {
    const { hasProvider, activeProviderLabel } = await import("./index");
    expect(hasProvider()).toBe(false);
    expect(activeProviderLabel()).toBeNull();
  });

  it("selects Shopify when a domain and private token are set", async () => {
    process.env.SHOPIFY_STORE_DOMAIN = "s.myshopify.com";
    process.env.SHOPIFY_STOREFRONT_PRIVATE_TOKEN = "t";
    const { activeProviderLabel } = await import("./index");
    expect(activeProviderLabel()).toBe("Shopify");
  });

  it("selects Shopify with only a public token", async () => {
    process.env.SHOPIFY_STORE_DOMAIN = "s.myshopify.com";
    process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN = "pub";
    const { activeProviderLabel } = await import("./index");
    expect(activeProviderLabel()).toBe("Shopify");
  });

  it("falls back to SerpApi when Shopify is not configured", async () => {
    process.env.SERPAPI_KEY = "serp";
    const { activeProviderLabel } = await import("./index");
    expect(activeProviderLabel()).toBe("Google Shopping");
  });

  it("prefers Shopify over SerpApi when both are configured", async () => {
    process.env.SHOPIFY_STORE_DOMAIN = "s.myshopify.com";
    process.env.SHOPIFY_STOREFRONT_PRIVATE_TOKEN = "t";
    process.env.SERPAPI_KEY = "serp";
    const { activeProviderLabel } = await import("./index");
    expect(activeProviderLabel()).toBe("Shopify");
  });

  it("ignores a Shopify domain with no token at all", async () => {
    process.env.SHOPIFY_STORE_DOMAIN = "s.myshopify.com";
    const { hasProvider } = await import("./index");
    expect(hasProvider()).toBe(false);
  });
});

describe("fetchProducts resilience", () => {
  // The charter-adjacent engineering promise: missing or broken data degrades the answer,
  // it never breaks the app.
  it("returns an empty list when no provider is configured", async () => {
    const { fetchProducts } = await import("./index");
    expect(await fetchProducts("laptops")).toEqual([]);
  });

  it("returns an empty list for a blank query", async () => {
    process.env.SERPAPI_KEY = "serp";
    const { fetchProducts } = await import("./index");
    expect(await fetchProducts("   ")).toEqual([]);
  });

  it("swallows provider errors and returns an empty list", async () => {
    process.env.SHOPIFY_STORE_DOMAIN = "s.myshopify.com";
    process.env.SHOPIFY_STOREFRONT_PRIVATE_TOKEN = "t";
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network down");
    }));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { fetchProducts } = await import("./index");
    expect(await fetchProducts("laptops")).toEqual([]);
  });
});

describe("productsToContext", () => {
  const base: ProductResult = { title: "Laptop A", price: "$999.00", extractedPrice: 999 };

  it("returns an empty string with no products", async () => {
    const { productsToContext } = await import("./index");
    expect(productsToContext([])).toBe("");
  });

  it("numbers each product and includes the price", async () => {
    const { productsToContext } = await import("./index");
    const out = productsToContext([base, { ...base, title: "Laptop B" }]);
    expect(out).toContain("1. Laptop A");
    expect(out).toContain("2. Laptop B");
    expect(out).toContain("price: $999.00");
  });

  it("describes a real markdown as such", async () => {
    const { productsToContext } = await import("./index");
    const out = productsToContext([
      { ...base, compareAtPrice: "$1,299.00", compareAtPriceValue: 1299 },
    ]);
    expect(out).toContain("was: $1,299.00");
    expect(out).toMatch(/real 23% markdown/);
  });

  it("says nothing about markdowns when there is no discount", async () => {
    const { productsToContext } = await import("./index");
    expect(productsToContext([base])).not.toContain("was:");
  });

  it("flags out-of-stock items prominently", async () => {
    const { productsToContext } = await import("./index");
    const out = productsToContext([{ ...base, availableForSale: false }]);
    expect(out).toContain("out of stock");
  });

  it("omits fields the provider could not supply", async () => {
    const { productsToContext } = await import("./index");
    const out = productsToContext([{ title: "Bare" }]);
    expect(out).toBe("1. Bare");
  });
});

describe("discountPercent", () => {
  it("computes a percentage for a real markdown", () => {
    expect(discountPercent({ title: "x", extractedPrice: 75, compareAtPriceValue: 100 })).toBe(25);
  });

  it("returns null when the compare-at price is equal", () => {
    expect(discountPercent({ title: "x", extractedPrice: 100, compareAtPriceValue: 100 })).toBeNull();
  });

  it("returns null when the compare-at price is lower (a bogus markdown)", () => {
    expect(discountPercent({ title: "x", extractedPrice: 100, compareAtPriceValue: 80 })).toBeNull();
  });

  it("returns null when either price is missing", () => {
    expect(discountPercent({ title: "x", extractedPrice: 100 })).toBeNull();
    expect(discountPercent({ title: "x", compareAtPriceValue: 100 })).toBeNull();
  });

  it("returns null rather than dividing by zero", () => {
    expect(discountPercent({ title: "x", extractedPrice: 0, compareAtPriceValue: 0 })).toBeNull();
  });
});
