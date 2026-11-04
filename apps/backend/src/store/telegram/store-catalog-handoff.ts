import { signJwt, verifyJwt } from "../../auth/jwt";

/** Query param on the catalog Mini App URL. Telegram keeps it; initData arrives in the hash. */
export const CATALOG_HANDOFF_PARAM = "tgAuth";

const CATALOG_HANDOFF_AUD = "store_catalog_handoff";
const CATALOG_HANDOFF_TTL_SECONDS = 60 * 60 * 24 * 30;

export type CatalogHandoff = {
  aud: typeof CATALOG_HANDOFF_AUD;
  /** Telegram user id. Must match initData before the store trusts the phone. */
  sub: string;
  phone: string;
  contactId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

/**
 * Catalog web_app URL that carries the CRM phone. The token is useless without
 * a matching Telegram initData user, so a forwarded link does not log someone else in.
 */
export function appendCatalogHandoff(
  storeUrl: string,
  claims: {
    telegramUserId: string;
    phone: string;
    contactId?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  },
): string {
  const secret = process.env.JWT_SECRET;
  const phone = claims.phone.trim();
  if (!secret || !claims.telegramUserId || !phone) return storeUrl;
  const token = signJwt(
    {
      aud: CATALOG_HANDOFF_AUD,
      sub: claims.telegramUserId,
      phone,
      contactId: claims.contactId ?? null,
      firstName: claims.firstName ?? null,
      lastName: claims.lastName ?? null,
    },
    secret,
    { expiresInSeconds: CATALOG_HANDOFF_TTL_SECONDS },
  );
  try {
    const url = new URL(storeUrl);
    url.searchParams.set(CATALOG_HANDOFF_PARAM, token);
    return url.toString();
  } catch {
    return storeUrl;
  }
}

export function readCatalogHandoff(token: string | null | undefined): CatalogHandoff | null {
  const raw = (token ?? "").trim();
  const secret = process.env.JWT_SECRET;
  if (!raw || !secret) return null;
  try {
    const payload = verifyJwt<CatalogHandoff>(raw, secret);
    if (payload.aud !== CATALOG_HANDOFF_AUD || !payload.sub || !payload.phone?.trim()) return null;
    return { ...payload, phone: payload.phone.trim() };
  } catch {
    return null;
  }
}
