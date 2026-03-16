/**
 * Normalize phone to E.164 (Ukraine +380...). Returns null if empty or invalid.
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

/**
 * Format phone for display: +38 (0XX) XXX-XX-XX for Ukraine, otherwise return as-is.
 */
export function formatPhoneDisplay(phone: string | null | undefined): string {
  const n = normalizePhone(phone);
  if (!n) return phone?.trim() ?? "";
  if (n.startsWith("+380") && n.length === 13) {
    return `+38 (0${n.slice(4, 6)}) ${n.slice(6, 9)}-${n.slice(9, 11)}-${n.slice(11)}`;
  }
  return n;
}
