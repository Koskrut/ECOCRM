import { createHash } from "node:crypto";
import { normalizePhoneToE164 } from "../common/phone.utils";

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** DB stores digits 380… Ads receive the hash of +380… */
export function hashPhoneForAds(phone: string | null | undefined): string | null {
  const e164 = normalizePhoneToE164(phone);
  if (!e164) return null;
  return sha256Hex(e164);
}

export function hashEmailForAds(email: string | null | undefined): string | null {
  const value = email?.trim().toLowerCase();
  if (!value || !value.includes("@")) return null;
  return sha256Hex(value);
}

export function hashOptionalName(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  return sha256Hex(normalized);
}
