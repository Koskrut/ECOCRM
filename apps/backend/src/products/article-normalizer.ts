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
    .replace(/\u00A0/g, " ")
    /** Bitrix / Excel: «10.051 | name» */
    .replace(/\|/g, " ")
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
function basenameWithoutExtension(fileName: string): string {
  const safe = sanitizeFileNameForArticle(fileName);
  return safe.replace(/\.[^.]+$/, "").trim();
}

/**
 * Все распознанные в строке артикулы (длинные первыми), чтобы не застрять на одном regex-матче.
 */
export function extractArticleCandidatesFromFileName(fileName: string): string[] {
  const base = basenameWithoutExtension(fileName);
  if (!base) return [];
  const re = new RegExp(ARTICLE_PATTERN.source, "gi");
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(base)) !== null) {
    const n = normalizeArticle(m[1]);
    if (n) found.add(n);
  }
  const list = [...found].sort((a, b) => b.length - a.length);
  const primaryMatch = base.match(ARTICLE_PATTERN);
  const primary = primaryMatch ? normalizeArticle(primaryMatch[1]) : "";
  if (primary) {
    const without = list.filter((x) => x !== primary);
    return [primary, ...without.sort((a, b) => b.length - a.length)];
  }
  return list;
}

export function extractArticleFromFileName(fileName: string): string {
  const base = basenameWithoutExtension(fileName);
  const match = base.match(ARTICLE_PATTERN);
  const raw = match ? match[1] : "";
  return normalizeArticle(raw);
}

/** Нормализованное имя файла без расширения (для полного совпадения с SKU). */
export function normalizeImageBasename(fileName: string): string {
  return normalizeArticle(basenameWithoutExtension(fileName));
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
 * Варианты числового префикса `NN.NNN…` для матча с каталогом (`00.107` ↔ `0.107`).
 * Не трогает PM.* и буквенно-дефисные артикулы.
 */
export function articleMatchAliases(article: string): string[] {
  const out = new Set<string>();
  out.add(article);
  const dot = article.indexOf(".");
  if (dot <= 0) return [...out];
  const head = article.slice(0, dot);
  const tail = article.slice(dot);
  if (!/^\d+$/.test(head)) return [...out];
  let h = head;
  while (h.length > 1 && h.startsWith("0")) {
    h = h.slice(1);
    out.add(h + tail);
  }
  if (h.length === 1) out.add("0" + h + tail);
  return [...out];
}

/**
 * Find best matching product for a file article (normalized).
 * Priority: exact > prefix > contains. Among same kind, prefer longer match.
 */
export function findBestProductMatch(
  fileArticleNormalized: string,
  products: ProductCandidate[],
): { productId: string; sku: string; kind: MatchKind } | null {
  const aliases = articleMatchAliases(fileArticleNormalized);
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
    for (const alias of aliases) {
      const kind = matchArticle(p.skuNormalized, alias);
      if (!kind) continue;
      const kindOrder = kind === "exact" ? 3 : kind === "prefix" ? 2 : 1;
      const commonLen =
        kind === "exact"
          ? alias.length
          : kind === "prefix"
            ? commonPrefixLen(p.skuNormalized, alias)
            : commonContainedLen(p.skuNormalized, alias);
      const lenDelta = Math.abs(p.skuNormalized.length - alias.length);
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
  }
  return best;
}

type MatchResult = { productId: string; sku: string; kind: MatchKind };

function compareMatchResults(a: MatchResult, b: MatchResult, candLenA: number, candLenB: number): number {
  const order = (k: MatchKind) => (k === "exact" ? 3 : k === "prefix" ? 2 : 1);
  const oa = order(a.kind);
  const ob = order(b.kind);
  if (oa !== ob) return oa - ob;
  if (candLenA !== candLenB) return candLenA - candLenB;
  if (a.sku !== b.sku) return a.sku < b.sku ? -1 : 1;
  return 0;
}

/**
 * Сопоставление файла с товаром: полный stem (как нормализованный SKU), затем лучший матч по всем кандидатам-артикулам из имени.
 * Покрывает SKU вида «10.051 | OS-TB» в БД и позиции без числового префикса, если они совпадают с суффиксом имени файла.
 */
export function resolveProductMatchForImageFile(
  fileName: string,
  products: ProductCandidate[],
): MatchResult | null {
  const stem = normalizeImageBasename(fileName);
  const candidates: string[] = [];
  const seen = new Set<string>();
  const push = (s: string) => {
    const t = s.trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    candidates.push(t);
  };
  push(stem);
  for (const c of extractArticleCandidatesFromFileName(fileName)) push(c);

  let best: MatchResult | null = null;
  let bestCandLen = 0;
  for (const cand of candidates) {
    const m = findBestProductMatch(cand, products);
    if (!m) continue;
    if (!best || compareMatchResults(m, best, cand.length, bestCandLen) > 0) {
      best = m;
      bestCandLen = cand.length;
    }
  }
  return best;
}
