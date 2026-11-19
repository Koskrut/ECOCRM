import { createHash } from "node:crypto";
import { BadRequestException } from "@nestjs/common";
import { getPhoneNormalizedDigits } from "../../common/phone.utils";

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Meta Customer List phone: digits with country code, no plus. Ukraine stays 380… */
export function normalizeAudiencePhone(
  phone: string | null | undefined,
  phoneNormalized?: string | null,
): string | null {
  return getPhoneNormalizedDigits(phoneNormalized) ?? getPhoneNormalizedDigits(phone);
}

/** Meta Customer List email: trim and lowercase. */
export function normalizeAudienceEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const value = email.trim().toLowerCase();
  if (!value || !value.includes("@") || value.startsWith("@") || value.endsWith("@") || /\s/.test(value)) {
    return null;
  }
  return value;
}

/** Meta Customer List name: lowercase, punctuation removed, letters kept. */
export function normalizeAudienceName(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value
    .trim()
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || null;
}

export function metaGraphApiVersion(): string {
  const raw = process.env.META_GRAPH_API_VERSION?.trim() || "v21.0";
  return /^v\d+\.\d+$/.test(raw) ? raw : "v21.0";
}

/** Stored and shown as digits only. Graph calls add the act_ prefix. */
export function normalizeAdAccountId(raw: string): string {
  const digits = raw.trim().replace(/^act_/i, "").replace(/\s+/g, "");
  if (!/^\d{5,20}$/.test(digits)) {
    throw new BadRequestException("Вкажіть номер рекламного акаунта цифрами, без act_");
  }
  return digits;
}

export function maskSecret(value: string | null | undefined): string {
  if (!value) return "";
  if (value.length < 8) return "••••";
  return `••••${value.slice(-4)}`;
}

/** Drop tokens, phones, emails and hashes before an error is stored or shown. */
export function sanitizeMetaError(message: string, secret?: string | null): string {
  let text = message.replace(/\s+/g, " ").trim();
  if (secret) {
    text = text.split(secret).join("[token]");
  }
  text = text.replace(/access_token=[^&\s"']+/gi, "access_token=[token]");
  text = text.replace(/bearer\s+[a-z0-9._~+/-]+=*/gi, "Bearer [token]");
  text = text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]");
  text = text.replace(/\b[a-f0-9]{64}\b/gi, "[hash]");
  text = text.replace(/(?<!\d)\d{10,13}(?!\d)/g, "[phone]");
  if (!text) return "Помилка Meta";
  return text.length > 400 ? text.slice(0, 400) : text;
}
