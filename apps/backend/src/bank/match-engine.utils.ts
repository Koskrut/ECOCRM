/**
 * Bank payment purpose (назначення) parsing + amount helpers.
 *
 * Amount tolerances (documented):
 * - BANK_ALLOCATION_EPSILON (0.01): residual / allocate sum equality in tx currency
 * - BANK_DEBT_ABS_TOLERANCE (1): multi-order debt sum ≈ tx amount (absolute, typically UAH)
 * - amountsMatchWithinTolerance default 1%: FX-aware single-order amount match (relative)
 */

/** Absolute tolerance for multi-order debt/explicit sum vs transaction amount. */
export const BANK_DEBT_ABS_TOLERANCE = 1;

/** Requires an explicit order marker before a 4–8 digit number. */
const ORDER_MARKER =
  "(?:заказ(?:а|у|ом)?|замовлення|замовл\\.?|оплата|сплата|order|payment|рахунок|рахунку|№|#)";

const LABELED_ORDER_PATTERN = new RegExp(
  `${ORDER_MARKER}\\s*#?\\s*(\\d{4,8})\\b`,
  "gi",
);

/** «7001 - 1200», «7001: 1200», «7001=1200» after an order marker or as list item. */
const LABELED_WITH_AMOUNT = new RegExp(
  `${ORDER_MARKER}\\s*#?\\s*(\\d{4,8})\\s*[-–=:]\\s*(\\d+(?:[.,]\\d{1,2})?)`,
  "gi",
);

const AMOUNT_AFTER_ORDER = new RegExp(
  `${ORDER_MARKER}\\s*#?\\s*(\\d{4,8})\\s*(?:сума|сумма|на\\s*суму|amount)\\s*(\\d+(?:[.,]\\d{1,2})?)`,
  "gi",
);

const FALLBACK_DIGITS = /\b(\d{4,8})\b/g;

/** Cyrillic person name: «Прізвище Ім'я [По батькові]». */
const CYRILLIC_NAME_PATTERN =
  /([А-ЯІЇЄҐ][а-яіїєґ'`-]+)\s+([А-ЯІЇЄҐ][а-яіїєґ'`-]+)(?:\s+([А-ЯІЇЄҐ][а-яіїєґ'`-]+))?/u;

/** Common Ukrainian/Russian first-name variants for fuzzy contact lookup. */
const FIRST_NAME_ALIASES: Record<string, string[]> = {
  микола: ["микола", "николай", "mykola", "nikolay"],
  олександр: ["олександр", "александр", "oleksandr", "alexander"],
  дмитро: ["дмитро", "дмитрий", "dmytro", "dmitry"],
  андрій: ["андрій", "андрей", "andriy", "andrey"],
};

const DATE_PATTERN = /\b\d{1,2}[./]\d{1,2}[./]\d{2,4}\b/g;
const PHONE_PATTERN =
  /(?:\+?38)?[\s-]?\(?0\d{2}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}\b/g;
/** Amounts next to currency tokens — strip so digits are not treated as order numbers. */
const CURRENCY_AMOUNT_PATTERN =
  /\b\d+(?:[.,]\d{1,2})?\s*(?:грн|грив(?:ень|ні|ня)?|uah|usd|eur|\$)\b|\b(?:грн|uah|usd|eur)\s*\d+(?:[.,]\d{1,2})?\b/gi;
/** Bank service codes (MFO 6 digits, EDRPOU 8 digits often appear with labels). */
const MFO_PATTERN = /\b(?:мфо|mfo)\s*#?\s*\d{5,6}\b/gi;
const EDRPOU_LABELED = /\b(?:єдрпоу|едрпоу|edrpou|код)\s*[:\s#]*\d{8}\b/gi;
const IBAN_PATTERN = /\bUA\d{2}\s?\d{4,}|\b\d{16,29}\b/gi;

export type ExtractedPersonName = {
  lastName: string;
  firstName: string;
  middleName?: string;
};

export type ParsedOrderCandidate = {
  orderNumber: string;
  /** Explicit amount next to the order number in the purpose text, if parsed. */
  explicitAmount?: number;
};

/**
 * Strip noise (dates, phones, currency amounts, MFO/EDRPOU labels, IBAN-like digits)
 * so leftover 4–8 digit groups are likelier to be order numbers.
 */
export function stripDescriptionNoise(description: string): string {
  return description
    .replace(DATE_PATTERN, " ")
    .replace(PHONE_PATTERN, " ")
    .replace(CURRENCY_AMOUNT_PATTERN, " ")
    .replace(MFO_PATTERN, " ")
    .replace(EDRPOU_LABELED, " ")
    .replace(IBAN_PATTERN, " ");
}

function parseAmountToken(raw: string): number | undefined {
  const n = Number(raw.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}

function pushCandidate(
  map: Map<string, ParsedOrderCandidate>,
  orderNumber: string,
  explicitAmount?: number,
): void {
  const prev = map.get(orderNumber);
  if (!prev) {
    map.set(orderNumber, { orderNumber, explicitAmount });
    return;
  }
  if (prev.explicitAmount == null && explicitAmount != null) {
    map.set(orderNumber, { orderNumber, explicitAmount });
  }
}

/**
 * Extract all potential order numbers (4–8 digits) from payment purpose.
 * Supports UA/RU/EN markers, comma/semicolon/slash/newline lists, optional explicit amounts.
 * Filters dates, phones, currency amounts, and common bank service patterns.
 */
export function extractOrderCandidatesFromDescription(
  description: string | null,
): ParsedOrderCandidate[] {
  if (!description?.trim()) return [];

  const map = new Map<string, ParsedOrderCandidate>();
  const cleaned = stripDescriptionNoise(description);

  for (const re of [LABELED_WITH_AMOUNT, AMOUNT_AFTER_ORDER]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(cleaned)) !== null) {
      pushCandidate(map, m[1]!, parseAmountToken(m[2]!));
    }
  }

  LABELED_ORDER_PATTERN.lastIndex = 0;
  let labeled: RegExpExecArray | null;
  while ((labeled = LABELED_ORDER_PATTERN.exec(cleaned)) !== null) {
    pushCandidate(map, labeled[1]!);
  }

  // List after a marker: «Оплата замовлення 7001, 7002» / «замовлення: 7001; 7002 / 7003»
  const listAfterMarker = new RegExp(
    `${ORDER_MARKER}\\s*[:#]?\\s*((?:\\d{4,8}\\s*(?:[-–=:]\\s*\\d+(?:[.,]\\d{1,2})?)?[\\s,;\\/]+)+\\d{4,8}(?:\\s*(?:[-–=:]\\s*\\d+(?:[.,]\\d{1,2})?))?)`,
    "gi",
  );
  let listMatch: RegExpExecArray | null;
  while ((listMatch = listAfterMarker.exec(cleaned)) !== null) {
    const chunk = listMatch[1]!;
    const pairRe = /(\d{4,8})(?:\s*[-–=:]\s*(\d+(?:[.,]\d{1,2})?))?/g;
    let p: RegExpExecArray | null;
    while ((p = pairRe.exec(chunk)) !== null) {
      pushCandidate(map, p[1]!, p[2] != null ? parseAmountToken(p[2]) : undefined);
    }
  }

  if (map.size === 0) {
    // Fallback: standalone 4–8 digit groups in cleaned text (no markers).
    FALLBACK_DIGITS.lastIndex = 0;
    let d: RegExpExecArray | null;
    while ((d = FALLBACK_DIGITS.exec(cleaned)) !== null) {
      pushCandidate(map, d[1]!);
    }
  }

  return [...map.values()];
}

/**
 * Extract a single order number from payment description.
 * Returns normalized digits (4–8 chars) or null if none or ambiguous.
 *
 * Backward-compatible with v1: a single *strong* label (заказ/замовлення/order/#/оплата)
 * wins even if weaker markers (e.g. «рахунок») also contain digits. Otherwise delegates
 * to extractOrderCandidatesFromDescription and requires exactly one candidate.
 */
export function extractOrderNumberFromDescription(description: string | null): string | null {
  if (!description?.trim()) return null;

  const strongRe =
    /(?:заказ(?:а|у|ом)?|замовлення|замовл\.?|оплата|сплата|order|payment|#)\s*#?\s*(\d{4,8})\b/gi;
  const strong = [...description.matchAll(strongRe)].map((m) => m[1]!);
  const strongUnique = [...new Set(strong)];
  if (strongUnique.length === 1) return strongUnique[0]!;
  if (strongUnique.length > 1) return null;

  const candidates = extractOrderCandidatesFromDescription(description);
  if (candidates.length === 1) return candidates[0]!.orderNumber;
  return null;
}

/** Deduplicate candidate numbers preserving first-seen order. */
export function dedupeOrderNumbers(numbers: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of numbers) {
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

/**
 * Pure resolve step: given candidates + lookup map of orderNumber → order,
 * return found (deduped) and notFound lists.
 */
export function resolveOrderCandidates<T extends { orderNumber: string }>(
  candidates: ParsedOrderCandidate[],
  ordersByNumber: Map<string, T>,
): { found: Array<T & { explicitAmount?: number }>; notFound: string[] } {
  const foundMap = new Map<string, T & { explicitAmount?: number }>();
  const notFound: string[] = [];
  const seenMissing = new Set<string>();

  for (const c of candidates) {
    const order = ordersByNumber.get(c.orderNumber);
    if (!order) {
      if (!seenMissing.has(c.orderNumber)) {
        seenMissing.add(c.orderNumber);
        notFound.push(c.orderNumber);
      }
      continue;
    }
    const prev = foundMap.get(c.orderNumber);
    if (!prev) {
      foundMap.set(c.orderNumber, { ...order, explicitAmount: c.explicitAmount });
    } else if (prev.explicitAmount == null && c.explicitAmount != null) {
      foundMap.set(c.orderNumber, { ...prev, explicitAmount: c.explicitAmount });
    }
  }
  return { found: [...foundMap.values()], notFound };
}

/** Normalize counterparty / company name for alias + fuzzy match. */
export function normalizeCounterpartyName(name: string | null | undefined): string {
  if (!name?.trim()) return "";
  // Avoid \b — it does not treat Cyrillic letters as word chars in JS.
  return name
    .toLowerCase()
    .replace(/[«»""''`']/g, "")
    .replace(/(^|[\s.,])(тов|тзов|фоп|пп|тдв|ат|пат|зао|ooo|llc|ltd)\.?($|[\s.,])/gi, "$1$3")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract 8-digit EDRPOU / tax id from description if present. */
export function extractEdrpouFromDescription(description: string | null): string | null {
  if (!description) return null;
  const labeled = description.match(
    /(?:єдрпоу|едрпоу|edrpou|код\s*(?:єдрпоу|едрпоу)?)\s*[:\s#]*(\d{8})\b/i,
  );
  if (labeled) return labeled[1]!;
  return null;
}

/** Absolute amount equality within tolerance (default 1 currency unit). */
export function amountsMatchAbsolute(
  a: number,
  b: number,
  tolerance: number = BANK_DEBT_ABS_TOLERANCE,
): boolean {
  return Math.abs(a - b) <= tolerance;
}

/** Return first-name spelling variants (e.g. Микола ↔ Николай). */
export function firstNameVariants(firstName: string): string[] {
  const lower = firstName.toLowerCase();
  for (const variants of Object.values(FIRST_NAME_ALIASES)) {
    if (variants.some((v) => v === lower)) return variants;
  }
  return [lower];
}

/**
 * Extract person name from bank payment description.
 * Prefers text after the last comma (typical «…, Сидоренко Микола Васильович»).
 */
export function extractPersonNameFromDescription(
  description: string | null,
): ExtractedPersonName | null {
  if (!description?.trim()) return null;

  const candidates: string[] = [];
  const parts = description.split(",");
  if (parts.length > 1) candidates.push(parts[parts.length - 1]!.trim());
  candidates.push(description.trim());

  for (const text of candidates) {
    const matches = [...text.matchAll(new RegExp(CYRILLIC_NAME_PATTERN.source, "gu"))];
    if (matches.length === 0) continue;
    const best = matches.sort((a, b) => (b[0]?.length ?? 0) - (a[0]?.length ?? 0))[0]!;
    return {
      lastName: best[1]!,
      firstName: best[2]!,
      middleName: best[3],
    };
  }
  return null;
}

/** Expected payment amount in transaction currency from order debt + exchange rate. */
export function expectedPaymentAmountInCurrency(
  debtAmount: number,
  orderCurrency: string,
  txCurrency: string,
  exchangeRate: number | null | undefined,
): number | null {
  if (debtAmount <= 0) return null;
  const orderCur = (orderCurrency || "USD").toUpperCase();
  const txCur = (txCurrency || "UAH").toUpperCase();
  const rate = Number(exchangeRate ?? 0);

  if (txCur === orderCur) return debtAmount;
  if (txCur === "UAH" && orderCur === "USD" && rate > 0) return debtAmount * rate;
  if (txCur === "UAH" && orderCur === "EUR" && rate > 0) return debtAmount * rate;
  if (txCur === "USD" && orderCur === "UAH" && rate > 0) return debtAmount / rate;
  return null;
}

export function amountsMatchWithinTolerance(
  expected: number,
  actual: number,
  toleranceFraction = 0.01,
): boolean {
  if (expected <= 0) return false;
  return Math.abs(expected - actual) / expected <= toleranceFraction;
}

/** Simple token overlap score 0..1 for normalized names. */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeCounterpartyName(a);
  const nb = normalizeCounterpartyName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;
  const ta = new Set(na.split(" ").filter((t) => t.length > 1));
  const tb = new Set(nb.split(" ").filter((t) => t.length > 1));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.max(ta.size, tb.size);
}
