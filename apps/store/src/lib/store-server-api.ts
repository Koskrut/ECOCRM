import { cache } from "react";
import type { Product } from "@/lib/api";

const API_URL = process.env.API_URL ?? "http://localhost:3001";

export type StoreProductResponse = {
  uahPerUsd: number;
  product: Product;
};

/**
 * Server-only fetch to the Nest store catalog (same path as `/api/store` proxy).
 * Public GET does not require cookies.
 */
async function fetchStoreProductUncached(id: string): Promise<StoreProductResponse | null> {
  const res = await fetch(`${API_URL}/store/products/${encodeURIComponent(id)}`, {
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    const msg = (err as { message?: string } | null)?.message ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return res.json() as Promise<StoreProductResponse>;
}

/** Dedupe product fetch between `generateMetadata` and the page in one request. */
export const getStoreProductCached = cache(fetchStoreProductUncached);

export type StoreCatalogList = {
  uahPerUsd: number;
  items: Product[];
  total: number;
  page: number;
  pageSize: number;
};

const EMPTY_PAGE_SIZE = 24;

function emptyCatalog(page = 1, pageSize = EMPTY_PAGE_SIZE): StoreCatalogList {
  return { uahPerUsd: 41, items: [], total: 0, page, pageSize };
}

/** First page of the public catalog. Empty list on network errors so the system page still renders. */
export async function fetchStoreCatalog(params: {
  search?: string;
  category?: string;
  subcategory?: string;
  page?: number;
  pageSize?: number;
}): Promise<StoreCatalogList> {
  const page = params.page && params.page > 0 ? params.page : 1;
  const pageSize = params.pageSize && params.pageSize > 0 ? params.pageSize : EMPTY_PAGE_SIZE;
  try {
    const url = new URL(`${API_URL}/store/products`);
    if (params.search) url.searchParams.set("search", params.search);
    if (params.category) url.searchParams.set("category", params.category);
    if (params.subcategory) url.searchParams.set("subcategory", params.subcategory);
    url.searchParams.set("page", String(page));
    url.searchParams.set("pageSize", String(pageSize));
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return emptyCatalog(page, pageSize);
    const data = (await res.json()) as Partial<StoreCatalogList>;
    return {
      uahPerUsd: typeof data.uahPerUsd === "number" ? data.uahPerUsd : 41,
      items: Array.isArray(data.items) ? data.items : [],
      total: typeof data.total === "number" ? data.total : 0,
      page: typeof data.page === "number" ? data.page : page,
      pageSize: typeof data.pageSize === "number" ? data.pageSize : pageSize,
    };
  } catch {
    return emptyCatalog(page, pageSize);
  }
}

export async function fetchStoreFacets(category: string): Promise<string[]> {
  try {
    const url = new URL(`${API_URL}/store/products/facets`);
    url.searchParams.set("category", category);
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const data = (await res.json()) as { items?: unknown };
    if (!Array.isArray(data.items)) return [];
    return data.items.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  } catch {
    return [];
  }
}
