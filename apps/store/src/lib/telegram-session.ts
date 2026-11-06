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
    const session = sessionStorage.getItem(key) ?? "";
    if (session) return session;
  } catch {
    /* WebView may block sessionStorage */
  }
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writeStorage(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function removeStorage(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
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
  writeStorage(TG_TOKEN_KEY, params.token);
  writeStorage(TG_CART_KEY, params.cartSessionId);
  writeStorage(
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
    writeStorage(TG_CABINET_TOKEN_KEY, params.storeToken);
  } else if (params.storeToken === null) {
    removeStorage(TG_CABINET_TOKEN_KEY);
  }
}

export function clearTelegramStoreSession(): void {
  memoryTgToken = "";
  memoryCabinetToken = "";
  memoryCartSessionId = "";
  memoryProfile = null;
  if (typeof window === "undefined") return;
  removeStorage(TG_TOKEN_KEY);
  removeStorage(TG_CART_KEY);
  removeStorage(TG_PROFILE_KEY);
  removeStorage(TG_CABINET_TOKEN_KEY);
}
