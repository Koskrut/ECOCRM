/** Matches "12345", "#12345", "заказ 12345", "оплата 12345" etc. — one group of 4–8 digits. */
const ORDER_NUMBER_PATTERN = /(?:^|[#\s])?(?:заказ|оплата|order|payment)?\s*#?\s*(\d{4,8})(?:\s|$|[^\d])/i;
const FALLBACK_DIGITS = /\b(\d{4,8})\b/g;

/**
 * Extract a single order number from payment description.
 * Returns normalized digits (4–8 chars) or null if none or ambiguous.
 */
export function extractOrderNumberFromDescription(description: string | null): string | null {
  if (!description || !description.trim()) return null;
  const digits = description.match(FALLBACK_DIGITS);
  if (digits && digits.length > 1) return null; // ambiguous
  let normalized: string | null = null;
  const patternMatch = description.match(ORDER_NUMBER_PATTERN);
  if (patternMatch) {
    normalized = patternMatch[1]!;
  } else if (digits && digits.length === 1) {
    normalized = digits[0]!;
  }
  return normalized;
}
