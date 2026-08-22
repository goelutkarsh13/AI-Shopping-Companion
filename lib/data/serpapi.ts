// SerpApi Google Shopping adapter.
// Docs: https://serpapi.com/google-shopping-api  ·  Free tier: 250 searches/mo.
// Identical repeat queries are served from SerpApi's cache and don't count against quota.

import type { ProductResult, ShoppingProvider } from "./types";

type SerpShoppingItem = {
  title?: string;
  price?: string;
  extracted_price?: number;
  source?: string;
  rating?: number;
  reviews?: number;
  delivery?: string;
  product_link?: string;
  link?: string;
  thumbnail?: string;
};

export class SerpApiProvider implements ShoppingProvider {
  name = "serpapi";
  private key: string;

  constructor(key: string) {
    this.key = key;
  }

  async search(query: string, limit = 6): Promise<ProductResult[]> {
    const params = new URLSearchParams({
      engine: "google_shopping",
      q: query,
      api_key: this.key,
      num: String(Math.max(limit, 10)),
    });
    const url = `https://serpapi.com/search.json?${params.toString()}`;

    const res = await fetch(url, { method: "GET" });
    if (!res.ok) {
      throw new Error(`SerpApi ${res.status}: ${await res.text().catch(() => "")}`);
    }
    const data = (await res.json()) as { shopping_results?: SerpShoppingItem[] };
    const items = data.shopping_results ?? [];

    return items.slice(0, limit).map((it) => ({
      title: it.title ?? "Unknown product",
      price: it.price,
      extractedPrice: it.extracted_price,
      source: it.source,
      rating: it.rating,
      reviews: it.reviews,
      delivery: it.delivery,
      link: it.product_link ?? it.link,
      thumbnail: it.thumbnail,
    }));
  }
}
