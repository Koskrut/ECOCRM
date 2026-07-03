/** Requires an explicit order marker ("заказ 9336", "#9336") before a 4–8 digit number. */
const LABELED_ORDER_PATTERN =
  /(?:заказ|замовлення|оплата|сплата|order|payment|#)\s*#?\s*(\d{4,8})\b/i;
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

export type ExtractedPersonName = {
  lastName: string;
  firstName: string;
  middleName?: string;
};

/**
 * Extract a single order number from payment description.
 * Returns normalized digits (4–8 chars) or null if none or ambiguous.
 */
export function extractOrderNumberFromDescription(description: string | null): string | null {
  if (!description || !description.trim()) return null;
  // A labeled number ("заказ 9336", "#9336") wins even amid other bank digits (IBAN, MFO, doc №).
  const labeled = description.match(LABELED_ORDER_PATTERN);
  if (labeled) return labeled[1]!;
  // Otherwise accept a single standalone 4–8 digit group; bail out when ambiguous.
  const digits = description.match(FALLBACK_DIGITS);
  if (digits && digits.length === 1) return digits[0]!;
  return null;
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
