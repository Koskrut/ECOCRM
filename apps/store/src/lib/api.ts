const API = "/api/store";

async function api<T>(
  path: string,
  opts?: { method?: string; body?: unknown },
): Promise<T> {
  const res = await fetch(API + path, {
    method: opts?.method ?? "GET",
    credentials: "include",
    headers: opts?.body ? { "Content-Type": "application/json" } : undefined,
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error((err as { message?: string }).message ?? "Request failed");
  }
  return res.json() as Promise<T>;
}

export type Product = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  basePrice: number;
  inStock: boolean;
  primaryImageUrl: string | null;
  primaryImageId: string | null;
};

export type CartItem = {
  id: string;
  productId: string;
  sku: string;
  name: string;
  unit: string;
  qty: number;
  price: number;
  lineTotal: number;
};

export type Cart = {
  id: string | null;
  uahPerUsd: number;
  items: CartItem[];
  subtotal: number;
};

export async function getProducts(params?: { search?: string; category?: string; page?: number; pageSize?: number }) {
  const q = new URLSearchParams();
  if (params?.search) q.set("search", params.search);
  if (params?.category) q.set("category", params.category);
  if (params?.page) q.set("page", String(params.page));
  if (params?.pageSize) q.set("pageSize", String(params.pageSize));
  return api<{
    uahPerUsd: number;
    items: Product[];
    total: number;
    page: number;
    pageSize: number;
  }>("/products" + (q.toString() ? "?" + q.toString() : ""));
}

export async function getCart(sessionId?: string): Promise<Cart> {
  const q = sessionId ? "?sessionId=" + encodeURIComponent(sessionId) : "";
  const res = await fetch(API + "/cart" + q, { credentials: "include" });
  if (!res.ok) return { id: null, uahPerUsd: 41, items: [], subtotal: 0 };
  return res.json();
}

export async function addToCart(productId: string, qty: number, sessionId?: string) {
  return api<Cart>("/cart/items", {
    method: "POST",
    body: { productId, qty, sessionId },
  });
}

export async function updateCartItem(itemId: string, qty: number) {
  return api<Cart>(`/cart/items/${itemId}`, { method: "PATCH", body: { qty } });
}

export async function removeCartItem(itemId: string) {
  return api<Cart>(`/cart/items/${itemId}`, { method: "DELETE" });
}

export type CheckoutDeliveryData =
  | { profileId: string }
  | {
      recipientType: "PERSON" | "COMPANY";
      deliveryType: "WAREHOUSE" | "POSTOMAT" | "ADDRESS";
      cityRef: string;
      cityName?: string;
      warehouseRef?: string;
      warehouseName?: string;
      warehouseNumber?: string;
      warehouseType?: string;
      streetRef?: string;
      streetName?: string;
      building?: string;
      flat?: string;
      firstName?: string;
      lastName?: string;
      recipientName?: string;
      recipientPhone?: string;
      phone?: string;
      companyName?: string;
      edrpou?: string;
      contactPersonFirstName?: string;
      contactPersonLastName?: string;
      contactPersonMiddleName?: string;
      contactPersonPhone?: string;
      saveAsProfile?: boolean;
      profileLabel?: string;
    };

export async function checkout(body: {
  phone: string;
  firstName: string;
  lastName?: string;
  email?: string;
  comment?: string;
  deliveryMethod: string;
  deliveryData?: CheckoutDeliveryData | null;
  paymentMethod?: string;
  sessionId?: string;
}) {
  return api<{
    orderId: string;
    orderNumber: string;
    contactId: string;
    setPasswordToken: string | null;
    alreadyHadAccount: boolean;
  }>("/checkout", { method: "POST", body });
}

export type NpCityItem = {
  ref: string;
  description: string;
  areaDescription?: string | null;
  region?: string | null;
};

/**
 * Підпис без дублікатів: description вже може містити "(область)" —
 * додаємо район/область тільки якщо їх ще немає в тексті.
 */
export function npCityDisplayLabel(c: NpCityItem): string {
  const d = (c.description ?? "").trim();
  const lower = d.toLowerCase();
  const parts: string[] = [d];
  const ad = (c.areaDescription ?? "").trim();
  if (ad && !lower.includes(ad.toLowerCase())) parts.push(ad);
  const reg = (c.region ?? "").trim();
  const regNorm = reg.replace(/\s*область\s*$/i, "").replace(/\s*обл\.?\s*$/i, "").trim();
  if (reg && !lower.includes(regNorm.toLowerCase())) parts.push(reg);
  return parts.join(", ");
}

export async function getNpCities(q: string, limit = 20) {
  const params = new URLSearchParams({ q: q.trim() });
  if (limit) params.set("limit", String(limit));
  return api<{ status: string; items: NpCityItem[]; message?: string }>(
    "/np/cities?" + params.toString(),
  );
}

export async function getNpWarehouses(cityRef: string, q: string, type?: "WAREHOUSE" | "POSTOMAT", limit = 30) {
  const params = new URLSearchParams({ cityRef: cityRef.trim(), q: q.trim() });
  if (type) params.set("type", type);
  if (limit) params.set("limit", String(limit));
  return api<{
    status: string;
    items: Array<{ ref: string; description: string; number?: string }>;
    message?: string;
  }>("/np/warehouses?" + params.toString());
}

export async function getNpStreets(
  cityRef: string,
  q: string,
  limit = 20,
  browse?: boolean,
) {
  const params = new URLSearchParams({ cityRef: cityRef.trim(), q: q.trim() });
  if (limit) params.set("limit", String(limit));
  if (browse) params.set("browse", "1");
  return api<{
    status: string;
    items: Array<{ ref: string; street: string }>;
    message?: string;
  }>("/np/streets?" + params.toString());
}

export type ShippingProfile = {
  id: string;
  label: string;
  isDefault: boolean;
  cityRef: string | null;
  cityName: string | null;
  warehouseRef: string | null;
  warehouseNumber: string | null;
  warehouseType: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
};

export async function getMyShippingProfiles() {
  return api<{ items: ShippingProfile[] }>("/me/shipping-profiles");
}

export async function login(phone: string, password: string) {
  const res = await fetch("/api/auth/store-login", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, password }),
  });
  const data = (await res.json()) as { message?: string; __debug?: unknown; customer?: unknown };
  if (!res.ok) {
    const e = new Error(data.message ?? "Login failed");
    (e as Error & { __debug?: unknown }).__debug = data.__debug;
    throw e;
  }
  return data as { customer: { customerId: string; contactId: string } };
}

export async function register(body: {
  phone: string;
  password: string;
  firstName?: string;
  lastName?: string;
  email?: string;
}) {
  const res = await fetch("/api/auth/store-register", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data as { message?: string }).message ?? "Registration failed");
  return data as { customer: { customerId: string; contactId: string } };
}

export async function getMe() {
  return api<{
    contactId: string;
    firstName: string;
    lastName: string;
    phone: string;
    email: string | null;
    telegramLinked: boolean;
    telegramUsername: string | null;
  }>("/me");
}

export async function patchMe(body: {
  firstName?: string;
  lastName?: string;
  email?: string | null;
}) {
  return api<Awaited<ReturnType<typeof getMe>>>("/me", {
    method: "PATCH",
    body,
  });
}

export async function getOrders(page = 1, pageSize = 20) {
  const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  return api<{
    items: Array<{
      id: string;
      orderNumber: string;
      status: string;
      totalAmount: number;
      paidAmount: number;
      debtAmount: number;
      deliveryMethod: string | null;
      paymentMethod: string | null;
      createdAt: string;
    }>;
    total: number;
    page: number;
    pageSize: number;
  }>("/orders?" + q.toString());
}

export async function getOrder(id: string) {
  return api<{
    id: string;
    orderNumber: string;
    status: string;
    totalAmount: number;
    paidAmount: number;
    debtAmount: number;
    deliveryMethod: string | null;
    paymentMethod: string | null;
    deliveryData: unknown;
    comment: string | null;
    createdAt: string;
    items: Array<{
      id: string;
      productId: string;
      sku: string;
      name: string;
      unit: string;
      qty: number;
      price: number;
      lineTotal: number;
    }>;
  }>("/orders/" + id);
}

export async function getPayments(page = 1, pageSize = 20) {
  const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  return api<{
    items: Array<{
      id: string;
      orderId: string;
      orderNumber: string | null;
      amount: number;
      currency: string;
      paidAt: string;
      status: string;
    }>;
    total: number;
    page: number;
    pageSize: number;
  }>("/payments?" + q.toString());
}

export async function getTelegramLink() {
  return api<{ link: string; code: string; expiresAt: string }>(
    "/me/telegram/link",
    { method: "POST" },
  );
}

export type StoreConfig = {
  theme?: { primary?: string; primaryHover?: string; surface?: string; border?: string };
  banners?: Array<{
    id: string;
    title: string;
    subtitle?: string;
    ctaText?: string;
    ctaHref?: string;
    imageUrl?: string;
    order: number;
  }>;
  contact?: { companyName?: string; address?: string; phone?: string; email?: string };
};

export async function getStoreConfig(): Promise<StoreConfig> {
  try {
    return await api<StoreConfig>("/config");
  } catch {
    return {};
  }
}
