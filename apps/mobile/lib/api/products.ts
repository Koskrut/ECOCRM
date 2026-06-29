import { apiFetch } from "@/lib/api";
import type { Product } from "@/types/crm";

export type { Product };

export type ListProductsResponse = {
  items: Product[];
  total: number;
  page: number;
  pageSize: number;
};

function qs(params: Record<string, string | number | undefined>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "") continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

export const productsApi = {
  list: (
    token: string,
    query: { search?: string; page?: number; pageSize?: number; catalog?: boolean } = {},
  ) =>
    apiFetch<ListProductsResponse>(
      `/products${qs({
        search: query.search,
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 20,
        catalog: query.catalog ? "true" : undefined,
      })}`,
      { token },
    ),
};

