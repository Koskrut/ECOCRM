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
