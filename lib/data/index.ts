// Provider selection + a safe fetch helper the app uses everywhere.
// If no provider is configured (or a call fails), we return [] and the advisor
// falls back to its own knowledge — the app never breaks on missing data.

import type { ProductResult, ShoppingProvider } from "./types";
import { discountPercent } from "./types";
import { extractSearchTerms } from "./query";
import { SerpApiProvider } from "./serpapi";
import { ShopifyStorefrontProvider } from "./shopify";

export type { ProductResult } from "./types";
export { discountPercent } from "./types";

function getProvider(): ShoppingProvider | null {
  // Shopify Storefront API is preferred when configured: it's the official API, it's free,
  // and it grounds the advisor in a real merchant's actual live catalog rather than a
  // general web-wide search. Point it at your own dev store or a merchant's.
  // Prefer the private token (server-side use) over the public one (browser use) — this
  // provider only ever runs inside the API route, never in the browser.
  const shopDomain = process.env.SHOPIFY_STORE_DOMAIN;
  const privateToken = process.env.SHOPIFY_STOREFRONT_PRIVATE_TOKEN;
  const publicToken = process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN;
  if (shopDomain && (privateToken || publicToken)) {
    return new ShopifyStorefrontProvider(shopDomain, { privateToken, publicToken });
  }

  const serp = process.env.SERPAPI_KEY;
  if (serp) return new SerpApiProvider(serp);
  // Add other providers here (Bright Data, etc.) and select via env.
  return null;
}

export function hasProvider(): boolean {
  return getProvider() !== null;
}

// Human-readable label for whichever provider is active, so the UI can be honest about
// where a verdict's live prices came from (e.g. "Shopify" vs "Google Shopping").
const PROVIDER_LABELS: Record<string, string> = {
  "shopify-storefront": "Shopify",
  serpapi: "Google Shopping",
};

export function activeProviderLabel(): string | null {
  const provider = getProvider();
  if (!provider) return null;
  return PROVIDER_LABELS[provider.name] ?? provider.name;
}

export async function fetchProducts(query: string, limit = 6): Promise<ProductResult[]> {
  const provider = getProvider();
  if (!provider || !query.trim()) return [];

  // People ask questions; catalog APIs want keywords. Without this, "Is the Compare at
  // Price Snowboard worth it?" is sent verbatim to the search index and matches nothing.
  const terms = extractSearchTerms(query);
  if (!terms) return [];

  try {
    return await provider.search(terms, limit);
  } catch (err) {
    console.error("Shopping data fetch failed:", err);
    return [];
  }
}

// Compact, model-friendly rendering of live results for the system prompt.
// Includes the honesty signals (real vs. fake markdowns, availability) so the advisor can
// call them out — that's the part a seller's own product page wouldn't tell you.
export function productsToContext(products: ProductResult[]): string {
  if (products.length === 0) return "";
  const lines = products.map((p, i) => {
    const pct = discountPercent(p);
    const bits = [
      `${i + 1}. ${p.title}`,
      p.vendor ? `by: ${p.vendor}` : null,
      p.price ? `price: ${p.price}` : null,
      pct !== null && p.compareAtPrice
        ? `was: ${p.compareAtPrice} (a real ${pct}% markdown)`
        : null,
      p.source ? `at: ${p.source}` : null,
      p.rating ? `rating: ${p.rating}${p.reviews ? ` (${p.reviews} reviews)` : ""}` : null,
      p.availableForSale === false ? `NOTE: currently out of stock` : null,
      typeof p.variantCount === "number" && p.variantCount > 0
        ? `${p.variantCount} option(s) in stock`
        : null,
      p.delivery ? `delivery: ${p.delivery}` : null,
    ].filter(Boolean);
    return bits.join(" · ");
  });
  return lines.join("\n");
}
