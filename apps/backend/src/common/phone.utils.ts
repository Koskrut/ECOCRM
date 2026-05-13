/**
 * Normalize phone to E.164-like form for Ukraine (+380...).
 * Strips spaces, parentheses, dashes. Returns null if empty or invalid.
 */
export function normalizePhoneToE164(phone: string | null | undefined): string | null {
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

/** Digits-only form for DB uniqueness (e.g. 380501234567). */
export function getPhoneNormalizedDigits(phone: string | null | undefined): string | null {
  const e164 = normalizePhoneToE164(phone);
  if (!e164) return null;
  return e164.replace(/\D/g, "");
}

/** Candidate normalized digit strings for DB lookup (e.g. 099… and 38099…). */
export function getPhoneCandidatesForLookup(phoneNorm: string): string[] {
  const candidates = new Set<string>();
  candidates.add(phoneNorm);
  if (phoneNorm.length === 10 && phoneNorm.startsWith("0")) {
    candidates.add("38" + phoneNorm);
  }
  if (phoneNorm.length === 9 && phoneNorm.startsWith("9")) {
    candidates.add("0" + phoneNorm);
    candidates.add("380" + phoneNorm);
  }
  if (phoneNorm.length === 12 && phoneNorm.startsWith("380")) {
    candidates.add("0" + phoneNorm.slice(3));
  }
  return Array.from(candidates);
}
