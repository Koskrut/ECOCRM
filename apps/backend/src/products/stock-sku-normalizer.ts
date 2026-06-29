import {
  articleMatchAliases,
  extractPrimaryArticleFromSku,
  findBestProductMatch,
  normalizeArticle,
  type ProductCandidate,
} from "./article-normalizer";

/** SKU lookup for stock Excel uploads (primary article + fuzzy match). */

export type StockSkuProductRef = { id: string; sku: string };

export type StockSkuIndex = {
  /** Exact trimmed SKU from DB. */
  exact: Map<string, StockSkuProductRef>;
  /** Primary article code (10.046) → product with SKU like «10.046 | name». */
  byArticle: Map<string, StockSkuProductRef>;
  /** All products with normalized SKU for fuzzy matching. */
  candidates: ProductCandidate[];
};

function indexProductArticles(
  product: StockSkuProductRef,
  byArticle: Map<string, StockSkuProductRef>,
): void {
  const primary = extractPrimaryArticleFromSku(product.sku);
  if (!primary) return;
  const keys = new Set<string>([primary, ...articleMatchAliases(primary)]);
  for (const key of keys) {
    if (!byArticle.has(key)) byArticle.set(key, product);
  }
}

export function buildStockSkuIndex(products: StockSkuProductRef[]): StockSkuIndex {
  const exact = new Map<string, StockSkuProductRef>();
  const byArticle = new Map<string, StockSkuProductRef>();
  const candidates: ProductCandidate[] = [];
  for (const p of products) {
    const trimmed = p.sku.trim();
    if (!trimmed) continue;
    exact.set(trimmed, p);
    indexProductArticles(p, byArticle);
    candidates.push({
      id: p.id,
      sku: p.sku,
      skuNormalized: normalizeArticle(p.sku),
    });
  }
  return { exact, byArticle, candidates };
}

export function registerProductInStockIndex(
  index: StockSkuIndex,
  product: StockSkuProductRef,
): void {
  const trimmed = product.sku.trim();
  if (!trimmed) return;
  index.exact.set(trimmed, product);
  indexProductArticles(product, index.byArticle);
  index.candidates.push({
    id: product.id,
    sku: product.sku,
    skuNormalized: normalizeArticle(product.sku),
  });
}

/** True when SKU looks like Excel numeric corruption (0.1, 1.011). */
function looksLikeExcelNumericSku(normalized: string): boolean {
  return /^\d+\.\d+$/.test(normalized);
}

function lookupByArticleKeys(
  keys: Iterable<string>,
  byArticle: Map<string, StockSkuProductRef>,
): StockSkuProductRef | null {
  for (const key of keys) {
    if (!key) continue;
    const hit = byArticle.get(key);
    if (hit) return hit;
  }
  return null;
}

function articleLookupKeys(rawSku: string): string[] {
  const normalized = normalizeArticle(rawSku);
  const primary = extractPrimaryArticleFromSku(rawSku);
  const keys = new Set<string>();
  for (const k of [primary, normalized]) {
    if (!k) continue;
    keys.add(k);
    for (const alias of articleMatchAliases(k)) keys.add(alias);
  }
  return [...keys];
}

/**
 * Resolve upload SKU to catalog product:
 * exact → primary article index → normalized exact → findBestProductMatch.
 */
export function resolveStockSkuToProduct(
  uploadSku: string,
  index: StockSkuIndex,
): StockSkuProductRef | null {
  const trimmed = uploadSku.trim();
  if (!trimmed) return null;

  const exactHit = index.exact.get(trimmed);
  if (exactHit) return exactHit;

  const articleHit = lookupByArticleKeys(articleLookupKeys(trimmed), index.byArticle);
  if (articleHit) return articleHit;

  const normalized = normalizeArticle(trimmed);
  if (!normalized) return null;

  for (const c of index.candidates) {
    if (c.skuNormalized === normalized) {
      return { id: c.id, sku: c.sku };
    }
  }

  let best: { productId: string; sku: string } | null = null;
  let bestKindOrder = 0;
  for (const key of articleLookupKeys(trimmed)) {
    const m = findBestProductMatch(key, index.candidates);
    if (!m) continue;
    const kindOrder = m.kind === "exact" ? 3 : m.kind === "prefix" ? 2 : 1;
    if (kindOrder > bestKindOrder) {
      bestKindOrder = kindOrder;
      best = { productId: m.productId, sku: m.sku };
    }
    if (kindOrder === 3) break;
  }

  if (best) return { id: best.productId, sku: best.sku };

  if (looksLikeExcelNumericSku(normalized)) {
    for (const alias of articleMatchAliases(normalized)) {
      const m = findBestProductMatch(alias, index.candidates);
      if (m) return { id: m.productId, sku: m.sku };
    }
  }

  return null;
}
