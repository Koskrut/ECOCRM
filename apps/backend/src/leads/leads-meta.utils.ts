/**
 * Normalize phone to E.164-like form. Default Ukraine +380 if 10 digits.
 * Strips spaces, parentheses, dashes. Returns null if empty or invalid.
 */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (phone == null || typeof phone !== "string") return null;
  const digits = phone.replace(/\s+|\(|\)|-/g, "").replace(/\D/g, "");
  if (digits.length === 0) return null;
  if (digits.length === 10 && digits.startsWith("0")) {
    return "+380" + digits.slice(1);
  }
  if (digits.length === 9 && !digits.startsWith("38")) {
    return "+380" + digits;
  }
  if (digits.length >= 10) {
    const normalized = digits.startsWith("38") ? "+" + digits : "+380" + digits.slice(-9);
    return normalized.length >= 12 ? normalized : null;
  }
  return null;
}

/** Simple validity: at least 10 digits. */
export function isPhoneValid(phone: string | null | undefined): boolean {
  const n = normalizePhone(phone);
  return n != null && n.replace(/\D/g, "").length >= 10;
}

const DEADLINE_HOT = /сегодня|завтра|1-2\s*дня|срочно/i;
const PREMIUM_NEED_KEYS = ["need", "категория", "category", "product"];
const PREMIUM_VALUES = ["премиум", "premium", "vip", "люкс", "luxury"];
const QTY_THRESHOLD = 10;

/**
 * Score lead from form answers (key/value). Returns delta to add to base 0.
 * +3 deadline hot, +2 qty/volume high, +2 premium need, -2 no/invalid phone.
 */
export function scoreLeadFromAnswers(
  answers: Array<{ key: string; value: string }>,
  phone: string | null | undefined,
): number {
  let score = 0;
  const keyVal = new Map(answers.map((a) => [a.key.toLowerCase(), a.value]));

  for (const [, value] of keyVal) {
    if (DEADLINE_HOT.test(value)) {
      score += 3;
      break;
    }
  }

  for (const k of PREMIUM_NEED_KEYS) {
    const v = keyVal.get(k)?.toLowerCase();
    if (v && PREMIUM_VALUES.some((p) => v.includes(p))) {
      score += 2;
      break;
    }
  }

  const qtyRaw = keyVal.get("qty") ?? keyVal.get("volume") ?? keyVal.get("quantity");
  const qty = parseInt(String(qtyRaw), 10);
  if (Number.isFinite(qty) && qty >= QTY_THRESHOLD) score += 2;

  if (!isPhoneValid(phone)) score -= 2;

  return score;
}
