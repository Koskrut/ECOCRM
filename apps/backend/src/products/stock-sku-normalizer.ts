/**
 * SKU normalization for stock Excel uploads.
 * Maps Cyrillic look-alike letters to Latin but keeps suffix letters (M, L, A, …).
 * Do not use {@link normalizeArticle} here — it strips non-ASCII suffixes (04.043М → 04.043).
 */

/** Cyrillic / Ukrainian letters that look like Latin in spreadsheets. */
const CYRILLIC_TO_LATIN: Readonly<Record<string, string>> = {
  А: "A",
  В: "B",
  С: "C",
  Е: "E",
  Н: "H",
  К: "K",
  М: "M",
  О: "O",
  Р: "R",
  Т: "T",
  У: "Y",
  Х: "X",
  І: "I",
  Ї: "I",
  Є: "E",
  Ґ: "G",
};

export function normalizeStockSku(value: string): string {
  if (!value || typeof value !== "string") return "";
  let s = value
    .normalize("NFKC")
    .trim()
    .replace(/\u00A0/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "");
  s = s
    .split("")
    .map((ch) => {
      const upper = ch.toUpperCase();
      const mapped = CYRILLIC_TO_LATIN[upper];
      if (mapped) return mapped;
      return ch.toUpperCase();
    })
    .join("");
  return s;
}

export type StockSkuProductRef = { id: string; sku: string };

export type StockSkuIndex = {
  byExactSku: Map<string, StockSkuProductRef>;
  byNormalizedSku: Map<string, StockSkuProductRef[]>;
};

export function buildStockSkuIndex(products: StockSkuProductRef[]): StockSkuIndex {
  const byExactSku = new Map<string, StockSkuProductRef>();
  const byNormalizedSku = new Map<string, StockSkuProductRef[]>();

  for (const p of products) {
    const exact = p.sku.trim();
    if (!exact) continue;
    byExactSku.set(exact, p);

    const norm = normalizeStockSku(exact);
    if (!norm) continue;
    const list = byNormalizedSku.get(norm) ?? [];
    if (!list.some((x) => x.id === p.id)) list.push(p);
    byNormalizedSku.set(norm, list);
  }

  return { byExactSku, byNormalizedSku };
}

/**
 * Resolve upload SKU to a catalog product: exact match first, then homoglyph-normalized exact match.
 * Never uses prefix/contains matching (04.043 must not match 04.043M).
 */
export function resolveStockSkuToProduct(
  uploadSku: string,
  index: StockSkuIndex,
): StockSkuProductRef | null {
  const trimmed = uploadSku.trim();
  if (!trimmed) return null;

  const exact = index.byExactSku.get(trimmed);
  if (exact) return exact;

  const norm = normalizeStockSku(trimmed);
  if (!norm) return null;

  const candidates = index.byNormalizedSku.get(norm) ?? [];
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) {
    const normExact = candidates.find((p) => normalizeStockSku(p.sku) === norm && p.sku.trim() === trimmed);
    if (normExact) return normExact;
    return null;
  }
  return null;
}
