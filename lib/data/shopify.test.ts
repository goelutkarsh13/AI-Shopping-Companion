import { afterEach, describe, expect, it, vi } from "vitest";
import { ShopifyStorefrontProvider } from "./shopify";
import { discountPercent } from "./types";

function mockGraphQL(products: unknown[]) {
  return vi.fn(async () => ({
    ok: true,
    json: async () => ({ data: { products: { edges: products.map((node) => ({ node })) } } }),
  })) as unknown as typeof fetch;
}

const baseProduct = {
  title: "Trail Runner 3",
  handle: "trail-runner-3",
  vendor: "Acme",
  productType: "Shoes",
  availableForSale: true,
  onlineStoreUrl: "https://shop.example.com/products/trail-runner-3",
  featuredImage: { url: "https://cdn/img.png" },
  priceRange: { minVariantPrice: { amount: "120.00", currencyCode: "USD" } },
  compareAtPriceRange: null,
  variants: { edges: [] },
};

afterEach(() => vi.unstubAllGlobals());

describe("ShopifyStorefrontProvider auth", () => {
  it("uses the private-token header when a private token is supplied", async () => {
    const f = mockGraphQL([]);
    vi.stubGlobal("fetch", f);
    await new ShopifyStorefrontProvider("shop.myshopify.com", {
      privateToken: "private-abc",
    }).search("shoes");

    const [, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.headers["Shopify-Storefront-Private-Token"]).toBe("private-abc");
    expect(init.headers["X-Shopify-Storefront-Access-Token"]).toBeUndefined();
  });

  it("falls back to the public-token header when only a public token exists", async () => {
    const f = mockGraphQL([]);
    vi.stubGlobal("fetch", f);
    await new ShopifyStorefrontProvider("shop.myshopify.com", {
      publicToken: "public-xyz",
    }).search("shoes");

    const [, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.headers["X-Shopify-Storefront-Access-Token"]).toBe("public-xyz");
  });

  it("prefers the private token when both are configured", async () => {
    const f = mockGraphQL([]);
    vi.stubGlobal("fetch", f);
    await new ShopifyStorefrontProvider("shop.myshopify.com", {
      privateToken: "private-abc",
      publicToken: "public-xyz",
    }).search("shoes");

    const [, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.headers["Shopify-Storefront-Private-Token"]).toBe("private-abc");
  });

  it("expands a bare store handle to a full myshopify domain", async () => {
    const f = mockGraphQL([]);
    vi.stubGlobal("fetch", f);
    await new ShopifyStorefrontProvider("my-store", { privateToken: "t" }).search("x");

    const [url] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("https://my-store.myshopify.com/api/");
  });
});

describe("ShopifyStorefrontProvider mapping", () => {
  it("maps core catalog fields", async () => {
    vi.stubGlobal("fetch", mockGraphQL([baseProduct]));
    const [p] = await new ShopifyStorefrontProvider("s.myshopify.com", {
      privateToken: "t",
    }).search("shoes");

    expect(p.title).toBe("Trail Runner 3");
    expect(p.price).toBe("$120.00");
    expect(p.extractedPrice).toBe(120);
    expect(p.vendor).toBe("Acme");
    expect(p.link).toBe("https://shop.example.com/products/trail-runner-3");
  });

  it("builds a product URL when onlineStoreUrl is absent", async () => {
    vi.stubGlobal("fetch", mockGraphQL([{ ...baseProduct, onlineStoreUrl: null }]));
    const [p] = await new ShopifyStorefrontProvider("s.myshopify.com", {
      privateToken: "t",
    }).search("shoes");
    expect(p.link).toBe("https://s.myshopify.com/products/trail-runner-3");
  });

  it("renders non-USD currency with its code rather than guessing a symbol", async () => {
    vi.stubGlobal(
      "fetch",
      mockGraphQL([
        {
          ...baseProduct,
          priceRange: { minVariantPrice: { amount: "99.50", currencyCode: "CAD" } },
        },
      ])
    );
    const [p] = await new ShopifyStorefrontProvider("s.myshopify.com", {
      privateToken: "t",
    }).search("shoes");
    expect(p.price).toBe("99.50 CAD");
  });

  it("surfaces a genuine markdown", async () => {
    vi.stubGlobal(
      "fetch",
      mockGraphQL([
        {
          ...baseProduct,
          compareAtPriceRange: { maxVariantPrice: { amount: "200.00", currencyCode: "USD" } },
        },
      ])
    );
    const [p] = await new ShopifyStorefrontProvider("s.myshopify.com", {
      privateToken: "t",
    }).search("shoes");

    expect(p.compareAtPrice).toBe("$200.00");
    expect(discountPercent(p)).toBe(40);
  });

  // The point of the whole compare-at feature: a "was" price that isn't actually higher
  // is a fake markdown, and we must not repeat it back to the user as a saving.
  it("ignores a compare-at price that is not actually higher", async () => {
    vi.stubGlobal(
      "fetch",
      mockGraphQL([
        {
          ...baseProduct,
          compareAtPriceRange: { maxVariantPrice: { amount: "120.00", currencyCode: "USD" } },
        },
      ])
    );
    const [p] = await new ShopifyStorefrontProvider("s.myshopify.com", {
      privateToken: "t",
    }).search("shoes");

    expect(p.compareAtPrice).toBeUndefined();
    expect(discountPercent(p)).toBeNull();
  });

  // Observed against a real Shopify dev store: products with NO markdown come back with
  // compareAtPriceRange "0.0" rather than null. A `!== null` check would render "was $0.00"
  // as a saving. Regression test derived from live API behaviour, not from the docs.
  it("treats a 0.0 compare-at price as no markdown, not a 100% discount", async () => {
    vi.stubGlobal(
      "fetch",
      mockGraphQL([
        {
          ...baseProduct,
          compareAtPriceRange: { maxVariantPrice: { amount: "0.0", currencyCode: "USD" } },
        },
      ])
    );
    const [p] = await new ShopifyStorefrontProvider("s.myshopify.com", {
      privateToken: "t",
    }).search("shoes");

    expect(p.compareAtPrice).toBeUndefined();
    expect(p.compareAtPriceValue).toBeUndefined();
    expect(discountPercent(p)).toBeNull();
  });

  it("counts only purchasable variants", async () => {
    vi.stubGlobal(
      "fetch",
      mockGraphQL([
        {
          ...baseProduct,
          variants: {
            edges: [
              { node: { availableForSale: true, price: { amount: "120.00", currencyCode: "USD" } } },
              { node: { availableForSale: false, price: { amount: "120.00", currencyCode: "USD" } } },
              { node: { availableForSale: true, price: { amount: "130.00", currencyCode: "USD" } } },
            ],
          },
        },
      ])
    );
    const [p] = await new ShopifyStorefrontProvider("s.myshopify.com", {
      privateToken: "t",
    }).search("shoes");
    expect(p.variantCount).toBe(2);
  });

  it("reports unavailable products so the advisor can warn early", async () => {
    vi.stubGlobal("fetch", mockGraphQL([{ ...baseProduct, availableForSale: false }]));
    const [p] = await new ShopifyStorefrontProvider("s.myshopify.com", {
      privateToken: "t",
    }).search("shoes");
    expect(p.availableForSale).toBe(false);
  });

  it("respects the requested result limit", async () => {
    vi.stubGlobal("fetch", mockGraphQL([baseProduct, baseProduct, baseProduct]));
    const out = await new ShopifyStorefrontProvider("s.myshopify.com", {
      privateToken: "t",
    }).search("shoes", 2);
    expect(out).toHaveLength(2);
  });
});

describe("ShopifyStorefrontProvider errors", () => {
  it("throws on a non-OK HTTP response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 401, text: async () => "Unauthorized" }))
    );
    await expect(
      new ShopifyStorefrontProvider("s.myshopify.com", { privateToken: "bad" }).search("x")
    ).rejects.toThrow(/401/);
  });

  // GraphQL returns HTTP 200 with an `errors` array — a naive client would treat this as success.
  it("throws when GraphQL reports errors despite a 200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ errors: [{ message: "Access denied" }] }),
      }))
    );
    await expect(
      new ShopifyStorefrontProvider("s.myshopify.com", { privateToken: "t" }).search("x")
    ).rejects.toThrow(/Access denied/);
  });

  it("returns an empty list when the store has no matches", async () => {
    vi.stubGlobal("fetch", mockGraphQL([]));
    const out = await new ShopifyStorefrontProvider("s.myshopify.com", {
      privateToken: "t",
    }).search("nothing");
    expect(out).toEqual([]);
  });
});
