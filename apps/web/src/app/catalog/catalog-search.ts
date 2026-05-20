import type { ProductCatalogItem } from "@/lib/api";

/** Client-side catalog filter (sku, name, normalized sku without dots/spaces). */
export function filterCatalogItems(
  items: ProductCatalogItem[],
  search: string,
): ProductCatalogItem[] {
  const q = search.trim();
  if (!q) return items;

  const lower = q.toLowerCase();
  const normQ = q.replace(/[.\s]/g, "").toLowerCase();

  return items.filter((p) => {
    const sku = p.sku.toLowerCase();
    const name = p.name.toLowerCase();
    const normSku = p.sku.replace(/[.\s]/g, "").toLowerCase();
    return sku.includes(lower) || name.includes(lower) || normSku.includes(normQ);
  });
}
