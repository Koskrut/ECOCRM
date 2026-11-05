import { getTelegramCartSessionId } from "@/lib/telegram-session";

export const GUEST_CART_SESSION_KEY = "store_cart_session";

export function peekGuestCartSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(GUEST_CART_SESSION_KEY) ?? "";
  } catch {
    return "";
  }
}

export function clearGuestCartSessionId(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(GUEST_CART_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function getCartSessionId(): string {
  if (typeof window === "undefined") return "";
  const telegramSession = getTelegramCartSessionId();
  if (telegramSession) return telegramSession;

  let id = peekGuestCartSessionId();
  if (!id) {
    id = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
    try {
      localStorage.setItem(GUEST_CART_SESSION_KEY, id);
    } catch {
      /* ignore */
    }
  }
  return id;
}
