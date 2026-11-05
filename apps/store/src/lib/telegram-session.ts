const TG_TOKEN_KEY = "store_tg_token";
const TG_CART_KEY = "store_tg_cart_session";
const TG_PROFILE_KEY = "store_tg_profile";
/** Cabinet JWT (aud: store) — backup when httpOnly cookie is blocked in Telegram WebView. */
const TG_CABINET_TOKEN_KEY = "store_cabinet_token";

/** Telegram WebView often drops both cookies and sessionStorage. Keep the live tab's tokens here. */
let memoryTgToken = "";
let memoryCabinetToken = "";
let memoryCartSessionId = "";
let memoryProfile: TelegramStoreProfile | null = null;

export type TelegramStoreProfile = {
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  region?: string | null;
  contactId: string | null;
};

function readStorage(key: string): string {
  if (typeof window === "undefined") return "";
  try {
    return sessionStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

export function getTelegramStoreToken(): string {
  return memoryTgToken || readStorage(TG_TOKEN_KEY);
}

export function getTelegramCabinetToken(): string {
  return memoryCabinetToken || readStorage(TG_CABINET_TOKEN_KEY);
}

export function getTelegramCartSessionId(): string {
  return memoryCartSessionId || readStorage(TG_CART_KEY);
}

export function getTelegramStoreProfile(): TelegramStoreProfile | null {
  if (memoryProfile) return memoryProfile;
  const raw = readStorage(TG_PROFILE_KEY);
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
  region?: string | null;
  contactId: string | null;
  /** Optional cabinet JWT when Mini App exchange issued store_token. */
  storeToken?: string | null;
}): void {
  memoryTgToken = params.token;
  memoryCartSessionId = params.cartSessionId;
  memoryProfile = {
    phone: params.phone,
    firstName: params.firstName,
    lastName: params.lastName,
    region: params.region ?? null,
    contactId: params.contactId,
  };
  if (params.storeToken) memoryCabinetToken = params.storeToken;
  else if (params.storeToken === null) memoryCabinetToken = "";
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(TG_TOKEN_KEY, params.token);
    sessionStorage.setItem(TG_CART_KEY, params.cartSessionId);
    sessionStorage.setItem(
      TG_PROFILE_KEY,
      JSON.stringify({
        phone: params.phone,
        firstName: params.firstName,
        lastName: params.lastName,
        region: params.region ?? null,
        contactId: params.contactId,
      } satisfies TelegramStoreProfile),
    );
    if (params.storeToken) {
      sessionStorage.setItem(TG_CABINET_TOKEN_KEY, params.storeToken);
    } else if (params.storeToken === null) {
      sessionStorage.removeItem(TG_CABINET_TOKEN_KEY);
    }
  } catch {
    /* WebView may block sessionStorage; in-memory tokens still authorize this tab. */
  }
}

export function clearTelegramStoreSession(): void {
  memoryTgToken = "";
  memoryCabinetToken = "";
  memoryCartSessionId = "";
  memoryProfile = null;
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(TG_TOKEN_KEY);
    sessionStorage.removeItem(TG_CART_KEY);
    sessionStorage.removeItem(TG_PROFILE_KEY);
    sessionStorage.removeItem(TG_CABINET_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}
