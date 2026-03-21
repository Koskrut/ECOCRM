const API_URL = process.env.API_URL ?? "http://localhost:3001";

const PAGE_SIZE = 100;

type StoreProductsListResponse = {
  items: Array<{ id: string }>;
  total: number;
};

/**
 * All active store catalog product ids (same source as витрина: Nest `GET /store/products`).
 * Paginates until a short page or `total` is reached.
 * On network / HTTP errors returns [] so sitemap still serves static URLs.
 */
export async function fetchAllActiveStoreProductIds(): Promise<string[]> {
  const ids: string[] = [];
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
        if (row?.id) {
          ids.push(row.id);
        }
      }

      const total = typeof data.total === "number" ? data.total : ids.length;
      if (batch.length < PAGE_SIZE || ids.length >= total) {
        break;
      }

      page += 1;
    }
  } catch {
    return [];
  }

  return [...new Set(ids)];
}
