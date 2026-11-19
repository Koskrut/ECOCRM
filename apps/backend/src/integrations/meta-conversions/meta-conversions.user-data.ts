import {
  normalizeAudienceEmail,
  normalizeAudienceName,
  normalizeAudiencePhone,
  sha256Hex,
} from "../meta-audiences/meta-audience.normalize";

export type MetaUserInput = {
  phone?: string | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  externalId?: string | null;
  country?: string | null;
};

/** Hashed Meta user_data. Country is included only when the caller has one. */
export function metaUserData(input: MetaUserInput): Record<string, string[]> {
  const data: Record<string, string[]> = {};
  const phone = normalizeAudiencePhone(input.phone);
  if (phone) data.ph = [sha256Hex(phone)];
  const email = normalizeAudienceEmail(input.email);
  if (email) data.em = [sha256Hex(email)];
  const firstName = normalizeAudienceName(input.firstName);
  if (firstName) data.fn = [sha256Hex(firstName)];
  const lastName = normalizeAudienceName(input.lastName);
  if (lastName) data.ln = [sha256Hex(lastName)];
  const externalId = (input.externalId ?? "").trim();
  if (externalId) data.external_id = [sha256Hex(externalId)];
  const country = (input.country ?? "").trim().toLowerCase();
  if (country) data.country = [sha256Hex(country)];
  return data;
}
