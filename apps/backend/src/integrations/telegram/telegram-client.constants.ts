import { OrderStage } from "@prisma/client";
import type { OrderStatus } from "@prisma/client";

export const MENU_CATALOG = "🛍 Каталог";
export const MENU_CART = "🛒 Кошик";
export const MENU_ORDERS = "📦 Замовлення";
export const MENU_MANAGER = "💬 Менеджер";

export const CLIENT_MENU_BUTTONS = [MENU_CATALOG, MENU_CART, MENU_ORDERS, MENU_MANAGER];

/** Reply keyboard layout: 2×2. */
export const CLIENT_MENU_KEYBOARD: string[][] = [
  [MENU_CATALOG, MENU_CART],
  [MENU_ORDERS, MENU_MANAGER],
];

export const TELEGRAM_WELCOME =
  "Вітаємо! Це бот магазину: каталог, кошик, оформлення та статус замовлень.\n\nЩоб почати — поділіться номером телефону або оберіть дію в меню.";
export const TELEGRAM_HELP =
  "Команди: /menu /catalog /cart /orders /cancel\n\nВільне повідомлення в головному меню потрапляє менеджеру. Під час оформлення текст використовується для кроків (місто, адреса тощо).";
export const TELEGRAM_REQUEST_PHONE =
  "Щоб ідентифікувати вас у CRM і показувати замовлення, поділіться номером телефону кнопкою нижче.";
export const TELEGRAM_EXISTING_CLIENT =
  "Раді бачити вас знову! Оберіть дію в меню або напишіть менеджеру.";
export const TELEGRAM_PHONE_SAVED_NEW =
  "Дякуємо! Номер збережено. Оберіть дію в меню нижче.\n\nОбласть доставки запитаємо під час оформлення замовлення.";
export const TELEGRAM_PHONE_SAVED_NO_CRM =
  "Дякуємо! Номер збережено. Можете обрати каталог у меню або написати менеджеру.\n\nОбласть доставки запитаємо під час оформлення.";
export const TELEGRAM_MANAGER_PROMPT =
  "Напишіть ваше запитання одним повідомленням. Менеджер отримає його в CRM і відповість якнайшвидше.";
export const TELEGRAM_CANCELLED = "Скасовано. Повертаємось у головне меню.";

export const CATALOG_PAGE_SIZE = 5;
export const ORDERS_PAGE_SIZE = 5;
export const CITY_RESULTS_LIMIT = 8;
export const WAREHOUSE_RESULTS_LIMIT = 8;

export function cartSessionId(telegramUserId: string): string {
  return `tg:${telegramUserId}`;
}

export const ORDER_STAGE_LABELS: Partial<Record<OrderStage, string>> = {
  NEW: "🆕 Нове замовлення",
  CONFIRMED: "🟡 Підтверджено",
  AWAITING_PAYMENT: "💳 Очікує оплату",
  AWAITING_STOCK: "⏳ Очікує товар",
  READY_TO_SHIP: "📦 Готове до відправки",
  SHIPPED: "🚚 Відправлено",
  AWAITING_RECEIPT: "📬 Очікує отримання",
  RECEIVED: "✅ Отримано",
  COMPLETED: "✅ Виконано",
  CANCELED: "❌ Скасовано",
  REFUSED: "↩️ Відмова",
  RETURN_IN_PROGRESS: "🔄 Повернення",
  FULLY_RETURNED: "↩️ Повернено",
};

export const ORDER_STATUS_LABELS: Partial<Record<OrderStatus, string>> = {
  NEW: "🆕 Нове замовлення",
  IN_WORK: "🟡 В обробці",
  SUCCESS: "💰 Оплачено",
  SHIPPED: "🚚 Відправлено",
  READY_TO_SHIP: "📦 Готове до відправки",
  CONTROL_PAYMENT: "💳 Контроль оплати",
  RETURNING: "🔄 Повернення",
  CANCELED: "❌ Скасовано",
};

export function humanOrderStage(
  orderStage: OrderStage | null | undefined,
  status: OrderStatus | null | undefined,
): string {
  if (orderStage) return ORDER_STAGE_LABELS[orderStage] ?? orderStage;
  if (status) return ORDER_STATUS_LABELS[status] ?? status;
  return "🆕 Нове замовлення";
}

/** Stages that trigger a proactive client Telegram push. */
export const CLIENT_PUSH_STAGES: ReadonlySet<OrderStage> = new Set([
  OrderStage.CONFIRMED,
  OrderStage.AWAITING_PAYMENT,
  OrderStage.SHIPPED,
  OrderStage.RECEIVED,
  OrderStage.COMPLETED,
  OrderStage.CANCELED,
  OrderStage.REFUSED,
]);

export type BotSessionState =
  | "idle"
  | "catalog_search"
  | "checkout_city"
  | "checkout_warehouse_q"
  | "checkout_street"
  | "checkout_building"
  | "checkout_flat"
  | "checkout_comment";

export type InlineBtn = { text: string; callback_data: string };
