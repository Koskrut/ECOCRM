import {
  findBestProductMatch,
  normalizeArticle,
  type ProductCandidate,
} from "./article-normalizer";

/** SKU lookup for stock Excel uploads (normalized article + fuzzy match). */

export type StockSkuProductRef = { id: string; sku: string };

export type StockSkuIndex = {
  /** Exact trimmed SKU from DB. */
  exact: Map<string, StockSkuProductRef>;
  /** All products with normalized SKU for fuzzy matching. */
  candidates: ProductCandidate[];
};

export function buildStockSkuIndex(products: StockSkuProductRef[]): StockSkuIndex {
  const exact = new Map<string, StockSkuProductRef>();
  const candidates: ProductCandidate[] = [];
  for (const p of products) {
    const trimmed = p.sku.trim();
    if (!trimmed) continue;
    exact.set(trimmed, p);
    candidates.push({
      id: p.id,
      sku: p.sku,
      skuNormalized: normalizeArticle(p.sku),
    });
  }
  return { exact, candidates };
}

/** True when SKU looks like Excel numeric corruption (0.1, 1.011) rather than text codes. */
function looksLikeExcelNumericSku(normalized: string): boolean {
  return /^\d+\.\d+$/.test(normalized);
}

/**
 * Resolve upload SKU to catalog product: exact trimmed match first,
 * then normalized exact, then fuzzy match for Excel numeric SKUs only.
 */
export function resolveStockSkuToProduct(
  uploadSku: string,
  index: StockSkuIndex,
): StockSkuProductRef | null {
  const trimmed = uploadSku.trim();
  if (!trimmed) return null;

  const exactHit = index.exact.get(trimmed);
  if (exactHit) return exactHit;

  const normalized = normalizeArticle(trimmed);
  if (!normalized) return null;

  for (const c of index.candidates) {
    if (c.skuNormalized === normalized) {
      return { id: c.id, sku: c.sku };
    }
  }

  if (!looksLikeExcelNumericSku(normalized)) return null;

  const match = findBestProductMatch(normalized, index.candidates);
  if (!match) return null;
  return { id: match.productId, sku: match.sku };
}
