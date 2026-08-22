// Provider-agnostic shopping data contract.
// Any provider (SerpApi now, Serpent/Bright Data/etc. later) implements ShoppingProvider.
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
};

export interface ShoppingProvider {
  name: string;
  search(query: string, limit?: number): Promise<ProductResult[]>;
}
