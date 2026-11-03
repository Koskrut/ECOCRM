const TG_TOKEN_KEY = "store_tg_token";
const TG_CART_KEY = "store_tg_cart_session";
const TG_PROFILE_KEY = "store_tg_profile";
/** Cabinet JWT (aud: store) — backup when httpOnly cookie is blocked in Telegram WebView. */
const TG_CABINET_TOKEN_KEY = "store_cabinet_token";

export type TelegramStoreProfile = {
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  contactId: string | null;
};

export function getTelegramStoreToken(): string {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem(TG_TOKEN_KEY) ?? "";
}

export function getTelegramCabinetToken(): string {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem(TG_CABINET_TOKEN_KEY) ?? "";
}

export function getTelegramCartSessionId(): string {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem(TG_CART_KEY) ?? "";
}

export function getTelegramStoreProfile(): TelegramStoreProfile | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(TG_PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TelegramStoreProfile;
  } catch {
    return null;
  }
}

export function setTelegramStoreSession(params: {
  token: string;
  cartSessionId: string;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  contactId: string | null;
  /** Optional cabinet JWT when Mini App exchange issued store_token. */
  storeToken?: string | null;
}): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(TG_TOKEN_KEY, params.token);
  sessionStorage.setItem(TG_CART_KEY, params.cartSessionId);
  sessionStorage.setItem(
    TG_PROFILE_KEY,
    JSON.stringify({
      phone: params.phone,
      firstName: params.firstName,
      lastName: params.lastName,
      contactId: params.contactId,
    } satisfies TelegramStoreProfile),
  );
  if (params.storeToken) {
    sessionStorage.setItem(TG_CABINET_TOKEN_KEY, params.storeToken);
  } else if (params.storeToken === null) {
    sessionStorage.removeItem(TG_CABINET_TOKEN_KEY);
  }
}

export function clearTelegramStoreSession(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(TG_TOKEN_KEY);
  sessionStorage.removeItem(TG_CART_KEY);
  sessionStorage.removeItem(TG_PROFILE_KEY);
  sessionStorage.removeItem(TG_CABINET_TOKEN_KEY);
}
