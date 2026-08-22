// Shopify Storefront API adapter — the primary, recommended data provider.
// Uses Shopify's official Storefront GraphQL API, the same API real Shopify apps and
// custom storefronts use to read a store's live catalog.
// Docs: https://shopify.dev/docs/api/storefront
//
// Point this at any Shopify store's Headless channel storefront (your own dev store, or a
// merchant's once installed). The Headless channel issues two tokens per storefront:
//   - a PUBLIC token, meant for browser/mobile use, sent as X-Shopify-Storefront-Access-Token
//   - a PRIVATE token, meant to stay secret on a server, sent as Shopify-Storefront-Private-Token
// This provider runs server-side only (inside the Next.js API route, never shipped to the
// browser), so it prefers the private token when both are configured — that's the header
// Shopify's own docs recommend for exactly this kind of trusted backend query.
//
// We deliberately ask for more than title+price. `compareAtPrice` lets the advisor check
// whether a "sale" is a real markdown, and `availableForSale` catches the listed-but-
// unbuyable case. Both are things a seller has no incentive to volunteer.

import type { ProductResult, ShoppingProvider } from "./types";

const API_VERSION = "2024-10";

type StorefrontMoney = { amount: string; currencyCode: string };

type StorefrontVariantNode = {
  availableForSale?: boolean;
  price?: StorefrontMoney | null;
  compareAtPrice?: StorefrontMoney | null;
};

type StorefrontProductNode = {
  title: string;
  handle: string;
  vendor?: string | null;
  productType?: string | null;
  availableForSale?: boolean | null;
  onlineStoreUrl?: string | null;
  featuredImage?: { url: string } | null;
  priceRange: { minVariantPrice: StorefrontMoney };
  compareAtPriceRange?: { maxVariantPrice: StorefrontMoney } | null;
  variants?: { edges: { node: StorefrontVariantNode }[] } | null;
};

type StorefrontSearchResponse = {
  data?: {
    products?: {
      edges: { node: StorefrontProductNode }[];
    };
  };
  errors?: { message: string }[];
};

const SEARCH_QUERY = `
  query ProductSearch($query: String!, $first: Int!) {
    products(query: $query, first: $first, sortKey: RELEVANCE) {
      edges {
        node {
          title
          handle
          vendor
          productType
          availableForSale
          onlineStoreUrl
          featuredImage { url }
          priceRange { minVariantPrice { amount currencyCode } }
          compareAtPriceRange { maxVariantPrice { amount currencyCode } }
          variants(first: 10) {
            edges {
              node {
                availableForSale
                price { amount currencyCode }
                compareAtPrice { amount currencyCode }
              }
            }
          }
        }
      }
    }
  }
`;

export function formatMoney(money: StorefrontMoney): string {
  const amount = Number(money.amount);
  const formatted = Number.isFinite(amount) ? amount.toFixed(2) : money.amount;
  // Storefront API returns ISO currency codes (USD, CAD, ...); render a plain, honest
  // "123.00 CAD" rather than guessing a symbol for currencies we don't recognize.
  return money.currencyCode === "USD" ? `$${formatted}` : `${formatted} ${money.currencyCode}`;
}

function toNumber(money?: StorefrontMoney | null): number | undefined {
  if (!money) return undefined;
  const n = Number(money.amount);
  return Number.isFinite(n) ? n : undefined;
}

export class ShopifyStorefrontProvider implements ShoppingProvider {
  name = "shopify-storefront";
  private domain: string;
  private token: string;
  private headerName: string;

  constructor(domain: string, opts: { privateToken?: string; publicToken?: string }) {
    // Accept either "my-store.myshopify.com" or a bare handle "my-store".
    this.domain = domain.includes(".") ? domain : `${domain}.myshopify.com`;
    if (opts.privateToken) {
      this.token = opts.privateToken;
      this.headerName = "Shopify-Storefront-Private-Token";
    } else {
      this.token = opts.publicToken ?? "";
      this.headerName = "X-Shopify-Storefront-Access-Token";
    }
  }

  async search(query: string, limit = 6): Promise<ProductResult[]> {
    const url = `https://${this.domain}/api/${API_VERSION}/graphql.json`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [this.headerName]: this.token,
      },
      body: JSON.stringify({
        query: SEARCH_QUERY,
        variables: { query, first: Math.max(limit, 1) },
      }),
    });

    if (!res.ok) {
      throw new Error(`Shopify Storefront API ${res.status}: ${await res.text().catch(() => "")}`);
    }

    const json = (await res.json()) as StorefrontSearchResponse;
    if (json.errors?.length) {
      throw new Error(`Shopify Storefront API: ${json.errors.map((e) => e.message).join("; ")}`);
    }

    const edges = json.data?.products?.edges ?? [];
    return edges.slice(0, limit).map(({ node }) => {
      const variants = node.variants?.edges?.map((e) => e.node) ?? [];

      // Prefer a compare-at price that belongs to the same variant we're quoting; fall back
      // to the product-level range. Shopify leaves compareAtPrice null when there's no
      // markdown, so a missing value legitimately means "not on sale".
      const cheapest = variants
        .filter((v) => toNumber(v.price) !== undefined)
        .sort((a, b) => (toNumber(a.price) ?? 0) - (toNumber(b.price) ?? 0))[0];

      const compareMoney =
        cheapest?.compareAtPrice ?? node.compareAtPriceRange?.maxVariantPrice ?? null;
      const compareValue = toNumber(compareMoney);
      const priceValue = toNumber(node.priceRange.minVariantPrice);

      // Only treat it as a compare-at price if it's actually higher than what's charged.
      const hasRealCompare =
        typeof compareValue === "number" &&
        typeof priceValue === "number" &&
        compareValue > priceValue;

      return {
        title: node.title,
        price: formatMoney(node.priceRange.minVariantPrice),
        extractedPrice: priceValue,
        source: this.domain,
        link: node.onlineStoreUrl ?? `https://${this.domain}/products/${node.handle}`,
        thumbnail: node.featuredImage?.url,
        vendor: node.vendor ?? undefined,
        productType: node.productType ?? undefined,
        availableForSale: node.availableForSale ?? undefined,
        variantCount: variants.filter((v) => v.availableForSale !== false).length || undefined,
        compareAtPrice: hasRealCompare && compareMoney ? formatMoney(compareMoney) : undefined,
        compareAtPriceValue: hasRealCompare ? compareValue : undefined,
        // Storefront API doesn't expose ratings/reviews — that lives in review apps, not core Shopify.
      };
    });
  }
}
