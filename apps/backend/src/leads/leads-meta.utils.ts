import { normalizePhoneToE164 } from "../common/phone.utils";

export { normalizePhoneToE164 as normalizePhone };

/** Simple validity: at least 10 digits. */
export function isPhoneValid(phone: string | null | undefined): boolean {
  const n = normalizePhoneToE164(phone);
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
