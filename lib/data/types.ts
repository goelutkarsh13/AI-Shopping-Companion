// Provider-agnostic shopping data contract.
// Any provider (Shopify Storefront, SerpApi, Bright Data, …) implements ShoppingProvider.
// The rest of the app only depends on these shapes — swapping providers is a one-file change.

export type ProductResult = {
  title: string;
  price?: string; // display price, e.g. "$1,199.00"
  extractedPrice?: number; // numeric price for sorting/compare
  source?: string; // merchant, e.g. "Best Buy"
  rating?: number; // 0–5
  reviews?: number;
  delivery?: string;
  link?: string;
  thumbnail?: string;

  // --- Honesty signals ---
  // These exist because the Independence Charter promises we surface the things a
  // salesperson would skip. A provider fills in whatever it can; the advisor is told
  // to use them, and to stay quiet about the ones that are missing.

  /** Original ("was") price when the item is marked down. Lets us check a claimed deal. */
  compareAtPrice?: string;
  compareAtPriceValue?: number;
  /** False when the store lists it but can't actually sell it right now. */
  availableForSale?: boolean;
  vendor?: string;
  productType?: string;
  /** How many purchasable variants exist — a rough proxy for "does my size/config exist". */
  variantCount?: number;
};

/**
 * Percentage off, but only when the discount is real.
 * Returns null when there's no compare-at price, or when the "sale" price isn't
 * actually lower — which is exactly the fake-markdown case worth calling out.
 */
export function discountPercent(p: ProductResult): number | null {
  const now = p.extractedPrice;
  const was = p.compareAtPriceValue;
  if (typeof now !== "number" || typeof was !== "number") return null;
  if (!(was > now) || was <= 0) return null;
  return Math.round(((was - now) / was) * 100);
}

export interface ShoppingProvider {
  name: string;
  search(query: string, limit?: number): Promise<ProductResult[]>;
}
