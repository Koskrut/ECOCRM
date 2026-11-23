const API_URL = process.env.API_URL ?? "http://localhost:3001";

const PAGE_SIZE = 100;

type StoreProductsListResponse = {
  items: Array<{ id: string; updatedAt?: string }>;
  total: number;
};

export type SitemapProduct = {
  id: string;
  /** Present only when the store API returns an update timestamp. */
  updatedAt?: string;
};

/**
 * All active store catalog product ids (same source as витрина: Nest `GET /store/products`).
 * Paginates until a short page or `total` is reached.
 * On network / HTTP errors returns [] so sitemap still serves static URLs.
 */
export async function fetchSitemapProducts(): Promise<SitemapProduct[]> {
  const products: SitemapProduct[] = [];
  const seen = new Set<string>();
  let page = 1;

  try {
    while (true) {
      const url = new URL(`${API_URL}/store/products`);
      url.searchParams.set("page", String(page));
      url.searchParams.set("pageSize", String(PAGE_SIZE));

      const res = await fetch(url.toString(), {
        cache: "no-store",
      });

      if (!res.ok) {
        break;
      }

      const data = (await res.json()) as StoreProductsListResponse;
      const batch = Array.isArray(data.items) ? data.items : [];

      if (batch.length === 0) {
        break;
      }

      for (const row of batch) {
        if (!row?.id || seen.has(row.id)) continue;
        seen.add(row.id);
        products.push({
          id: row.id,
          ...(typeof row.updatedAt === "string" && row.updatedAt ? { updatedAt: row.updatedAt } : {}),
        });
      }

      const total = typeof data.total === "number" ? data.total : products.length;
      if (batch.length < PAGE_SIZE || products.length >= total) {
        break;
      }

      page += 1;
    }
  } catch {
    return [];
  }

  return products;
}
