/**
 * Normalizes article/SKU and file name for matching.
 * - uppercase, trim
 * - collapse multiple spaces to one
 * - unify dashes and underscores (to single space or remove for consistent comparison)
 */

export function normalizeArticle(value: string): string {
  if (!value || typeof value !== "string") return "";
  let s = value
    .toUpperCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[-_]+/g, ".")
    .replace(/\s+/g, ".");
  /** Trailing punctuation from exports (e.g. U+201A „) must not break Drive ↔ DB match. */
  s = s.replace(/[^A-Z0-9.]+$/g, "").replace(/\.+$/g, "").replace(/^\.+/g, "");
  return s;
}

/**
 * Паттерн артикула:
 * - ХХ.ХХХ + опционально буквы или -число (в т.ч. 10.020-1, 08.070-4545-1)
 * - PM.… (префиксные артикулы)
 * - Буква + сегменты через дефис (S-WF-AS-SA-MU). Идёт после цифровых вариантов,
 *   чтобы "00.107 WF-OS-MU.png" по-прежнему давал 00.107.
 */
const ARTICLE_PATTERN =
  /((?:\d{1,2}\.\d{2,}(?:[A-Za-z]+|-\d+)*)|(?:PM\.\d+(?:\.\d+)*(?:[A-Za-z]+|-\d+)*)|(?:[A-Za-z](?:-[A-Za-z0-9]+)+))/i;

/** Normalize odd Unicode punctuation / invisible chars before regex (Drive / macOS names). */
function sanitizeFileNameForArticle(fileName: string): string {
  return fileName
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\uFF0E/g, ".")
    .replace(/[\u00B7\u2219\u22C5\u2027\u30FB]/g, ".");
}

/**
 * Извлекает артикул из имени файла (формат ХХ.ХХХ, возможно с суффиксом A/L/M/NH или -1745).
 * Примеры: "01.021 ST-TOT-MU.png" → "01.021", "S-WF-AS-SA-MU.png" → "S.WF.AS.SA.MU".
 */
export function extractArticleFromFileName(fileName: string): string {
  if (!fileName || typeof fileName !== "string") return "";
  const safe = sanitizeFileNameForArticle(fileName);
  const base = safe.replace(/\.[^.]+$/, "").trim();
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
  let bestCommonLen = 0;
  let bestLenDelta = Number.POSITIVE_INFINITY;
  let bestSkuNorm = "";

  const commonPrefixLen = (a: string, b: string) => {
    const n = Math.min(a.length, b.length);
    let i = 0;
    for (; i < n; i++) if (a[i] !== b[i]) break;
    return i;
  };

  const commonContainedLen = (a: string, b: string) => {
    if (a.includes(b)) return b.length;
    if (b.includes(a)) return a.length;
    return 0;
  };

  for (const p of products) {
    const kind = matchArticle(p.skuNormalized, fileArticleNormalized);
    if (!kind) continue;
    const kindOrder = kind === "exact" ? 3 : kind === "prefix" ? 2 : 1;
    const commonLen =
      kind === "exact"
        ? fileArticleNormalized.length
        : kind === "prefix"
          ? commonPrefixLen(p.skuNormalized, fileArticleNormalized)
          : commonContainedLen(p.skuNormalized, fileArticleNormalized);
    const lenDelta = Math.abs(p.skuNormalized.length - fileArticleNormalized.length);
    if (
      kindOrder > bestKindOrder ||
      (kindOrder === bestKindOrder &&
        (commonLen > bestCommonLen ||
          (commonLen === bestCommonLen && lenDelta < bestLenDelta) ||
          (commonLen === bestCommonLen &&
            lenDelta === bestLenDelta &&
            p.skuNormalized < bestSkuNorm)))
    ) {
      bestKindOrder = kindOrder;
      bestCommonLen = commonLen;
      bestLenDelta = lenDelta;
      bestSkuNorm = p.skuNormalized;
      best = { productId: p.id, sku: p.sku, kind };
    }
  }
  return best;
}
