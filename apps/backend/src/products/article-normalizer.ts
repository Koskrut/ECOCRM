/**
 * Normalizes article/SKU and file name for matching.
 * - uppercase, trim
 * - collapse multiple spaces to one
 * - unify dashes and underscores (to single space or remove for consistent comparison)
 */

export function normalizeArticle(value: string): string {
  if (!value || typeof value !== "string") return "";
  return value
    .toUpperCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[-_]+/g, ".")
    .replace(/\s+/g, ".");
}

/**
 * Паттерн артикула: ХХ.ХХХ + опционально буквы или -число.
 * Примеры: 01.021, 01.06312A, 03.041M, 03.060-1745, 04.049NH.
 */
const ARTICLE_PATTERN = /(\d{1,2}\.\d{2,}(?:[A-Za-z]+|-\d+)*)/i;

/**
 * Извлекает артикул из имени файла (формат ХХ.ХХХ, возможно с суффиксом A/L/M/NH или -1745).
 * Примеры: "01.021 ST-TOT-MU.png" → "01.021", "01.06312A_st-rc-asra.png" → "01.06312A".
 */
export function extractArticleFromFileName(fileName: string): string {
  if (!fileName || typeof fileName !== "string") return "";
  const base = fileName.replace(/\.[^.]+$/, "").trim();
  const match = base.match(ARTICLE_PATTERN);
  const raw = match ? match[1] : "";
  return normalizeArticle(raw);
}

export type MatchKind = "exact" | "prefix" | "contains";

/**
 * Match priority: exact > prefix > contains.
 * Returns match kind or null if no match.
 */
export function matchArticle(
  productSkuNormalized: string,
  fileArticleNormalized: string,
): MatchKind | null {
  if (!fileArticleNormalized || !productSkuNormalized) return null;
  if (productSkuNormalized === fileArticleNormalized) return "exact";
  if (productSkuNormalized.startsWith(fileArticleNormalized) || fileArticleNormalized.startsWith(productSkuNormalized))
    return "prefix";
  if (productSkuNormalized.includes(fileArticleNormalized) || fileArticleNormalized.includes(productSkuNormalized))
    return "contains";
  return null;
}

export type ProductCandidate = { id: string; sku: string; skuNormalized: string };

/**
 * Find best matching product for a file article (normalized).
 * Priority: exact > prefix > contains. Among same kind, prefer longer match.
 */
export function findBestProductMatch(
  fileArticleNormalized: string,
  products: ProductCandidate[],
): { productId: string; sku: string; kind: MatchKind } | null {
  let best: { productId: string; sku: string; kind: MatchKind } | null = null;
  let bestKindOrder = 0; // exact=3, prefix=2, contains=1
  let bestLen = 0;

  for (const p of products) {
    const kind = matchArticle(p.skuNormalized, fileArticleNormalized);
    if (!kind) continue;
    const kindOrder = kind === "exact" ? 3 : kind === "prefix" ? 2 : 1;
    const matchLen = Math.min(p.skuNormalized.length, fileArticleNormalized.length);
    if (
      kindOrder > bestKindOrder ||
      (kindOrder === bestKindOrder && matchLen > bestLen)
    ) {
      bestKindOrder = kindOrder;
      bestLen = matchLen;
      best = { productId: p.id, sku: p.sku, kind };
    }
  }
  return best;
}
