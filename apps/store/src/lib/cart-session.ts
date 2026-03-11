const CART_SESSION_KEY = "store_cart_session";

export function getCartSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(CART_SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(CART_SESSION_KEY, id);
  }
  return id;
}
