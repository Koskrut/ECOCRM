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

/** Max 12 digits: `380` + 9 national digits (UA mobile). */
function uaMobileDigits12(digits: string): string {
  let d = digits.replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("380")) return d.slice(0, 12);
  if (d.startsWith("0")) return ("380" + d.slice(1, 10)).slice(0, 12);
  if (d.startsWith("38") && !d.startsWith("380")) return ("380" + d.slice(2, 11)).slice(0, 12);
  if (d.length <= 9 && !d.startsWith("38")) return ("380" + d).slice(0, 12);
  return d.slice(0, 15);
}

/**
 * UA mobile mask while typing — same visual pattern as {@link formatPhoneDisplay}: `+38 (0XX) XXX-XX-XX`.
 * Non‑UA / unparsed input is returned with a leading `+` when the raw value had `+`.
 */
export function formatPhoneInputMask(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";

  const d = uaMobileDigits12(digits);
  if (!d.startsWith("380")) {
    return raw.trim().startsWith("+") ? `+${digits}` : digits;
  }

  const sub = d.slice(3);
  if (sub.length === 0) return "+38 (0";

  const op = sub.slice(0, 2);
  const mid = sub.slice(2, 5);
  const p1 = sub.slice(5, 7);
  const p2 = sub.slice(7, 9);

  if (sub.length === 1) {
    return `+38 (0${sub}`;
  }
  if (sub.length === 2) {
    return `+38 (0${op}) `;
  }
  let out = `+38 (0${op}) ${mid}`;
  if (sub.length <= 5) {
    return out;
  }
  out += `-${p1}`;
  if (sub.length <= 7) {
    return out;
  }
  out += `-${p2}`;
  return out;
}
