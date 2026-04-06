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

/** Приоритет типа маски: числовой артикул важнее PM и буквенно-дефисного (чтобы в «S-WF_03.041» брался 03.041). */
function articleCandidateRank(normalized: string): [number, number] {
  let type = 0;
  if (/^\d{1,2}\.\d/.test(normalized)) type = 3;
  else if (/^PM\./i.test(normalized)) type = 2;
  else type = 1;
  return [type, normalized.length];
}

function compareArticleCandidatesDesc(a: string, b: string): number {
  const [ta, la] = articleCandidateRank(a);
  const [tb, lb] = articleCandidateRank(b);
  if (tb !== ta) return tb - ta;
  if (lb !== la) return lb - la;
  return a < b ? -1 : a > b ? 1 : 0;
}

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
 * Все вхождения артикула по маске в basename (g+exec по всей строке).
 * Сортировка: числовой NN.NNN… → PM… → буквенно-дефисный; внутри типа — длиннее первым.
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
  return [...found].sort(compareArticleCandidatesDesc);
}

/** Первый (главный) артикул по той же маске и приоритетам, что и {@link extractArticleCandidatesFromFileName}. */
export function extractArticleFromFileName(fileName: string): string {
  const list = extractArticleCandidatesFromFileName(fileName);
  return list[0] ?? "";
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
  // Compact numeric form (helps when filename/SKU uses 10011 vs 10.011).
  const a = productSkuNormalized.replace(/\./g, "");
  const b = fileArticleNormalized.replace(/\./g, "");
  if (a && b) {
    if (a === b) return "exact";
    if (a.startsWith(b) || b.startsWith(a)) return "prefix";
    if (a.includes(b) || b.includes(a)) return "contains";
  }
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

function compareMatchResults(a: MatchResult, b: MatchResult): number {
  const order = (k: MatchKind) => (k === "exact" ? 3 : k === "prefix" ? 2 : 1);
  const oa = order(a.kind);
  const ob = order(b.kind);
  if (oa !== ob) return oa - ob;
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
  // Priority: extracted article tokens first. The full stem is used only as a fallback
  // (and we only accept EXACT on stem) to avoid cross-matching on descriptive suffixes.
  for (const c of extractArticleCandidatesFromFileName(fileName)) push(c);
  // Dotless numeric fallback (e.g. IMG_10011_some.png -> 10011).
  // This does NOT affect extraction stats; it's only for match resilience.
  const rawBase = fileName.replace(/\.[^.]+$/, "");
  const digitGroups = rawBase.match(/\d{4,}/g) ?? [];
  for (const g of digitGroups) push(g);
  if (stem) push(stem);

  let best: MatchResult | null = null;
  for (const cand of candidates) {
    const m = findBestProductMatch(cand, products);
    if (!m) continue;
    // If candidate is full stem, allow only exact match.
    if (cand === stem && m.kind !== "exact") continue;
    if (!best || compareMatchResults(m, best) > 0) {
      best = m;
    }
    if (best.kind === "exact") return best;
  }
  return best;
}
