/** Exact SKU lookup for stock Excel uploads (trim only, no homoglyphs or prefix matching). */

export type StockSkuProductRef = { id: string; sku: string };

export type StockSkuIndex = Map<string, StockSkuProductRef>;

export function buildStockSkuIndex(products: StockSkuProductRef[]): StockSkuIndex {
  const byExactSku = new Map<string, StockSkuProductRef>();
  for (const p of products) {
    const exact = p.sku.trim();
    if (!exact) continue;
    byExactSku.set(exact, p);
  }
  return byExactSku;
}

/** Resolve upload SKU to catalog product by exact trimmed SKU match only. */
export function resolveStockSkuToProduct(
  uploadSku: string,
  index: StockSkuIndex,
): StockSkuProductRef | null {
  const trimmed = uploadSku.trim();
  if (!trimmed) return null;
  return index.get(trimmed) ?? null;
}
