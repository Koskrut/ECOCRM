import {
  normalizeAudienceEmail,
  normalizeAudienceName,
  normalizeAudiencePhone,
  sha256Hex,
} from "../meta-audiences/meta-audience.normalize";
import { metaClickValue, metaFbc, normalizeMetaGeo } from "./meta-conversions.match";

export type MetaUserData = {
  em?: string[];
  ph?: string[];
  fn?: string[];
  ln?: string[];
  external_id?: string[];
  country?: string[];
  ct?: string[];
  st?: string[];
  zp?: string[];
  client_ip_address?: string;
  client_user_agent?: string;
  fbp?: string;
  fbc?: string;
};

export type MetaUserInput = {
  phone?: string | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  externalId?: string | null;
  country?: string | null;
  city?: string | null;
  region?: string | null;
  zip?: string | null;
  clientIpAddress?: string | null;
  clientUserAgent?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  fbclid?: string | null;
};

function hashed(value: string | null): string[] | undefined {
  return value ? [sha256Hex(value)] : undefined;
}

/** Hashed identity plus raw click fields. Empty strings are left out. */
export function metaUserData(input: MetaUserInput): MetaUserData {
  const data: MetaUserData = {};
  const phone = hashed(normalizeAudiencePhone(input.phone));
  if (phone) data.ph = phone;
  const email = hashed(normalizeAudienceEmail(input.email));
  if (email) data.em = email;
  const firstName = hashed(normalizeAudienceName(input.firstName));
  if (firstName) data.fn = firstName;
  const lastName = hashed(normalizeAudienceName(input.lastName));
  if (lastName) data.ln = lastName;
  const externalId = (input.externalId ?? "").trim();
  if (externalId) data.external_id = [sha256Hex(externalId)];
  const country = hashed(normalizeMetaGeo(input.country));
  if (country) data.country = country;
  const city = hashed(normalizeMetaGeo(input.city));
  if (city) data.ct = city;
  const region = hashed(normalizeMetaGeo(input.region));
  if (region) data.st = region;
  const zip = hashed(normalizeMetaGeo(input.zip));
  if (zip) data.zp = zip;
  const ip = (input.clientIpAddress ?? "").trim();
  if (ip) data.client_ip_address = ip;
  const agent = (input.clientUserAgent ?? "").trim();
  if (agent) data.client_user_agent = agent.length > 1000 ? agent.slice(0, 1000) : agent;
  const fbp = metaClickValue(input.fbp);
  if (fbp) data.fbp = fbp;
  const fbc = metaFbc(input);
  if (fbc) data.fbc = fbc;
  return data;
}
