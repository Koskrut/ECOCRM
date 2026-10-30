import { OrderStage } from "@prisma/client";
import type { OrderStatus } from "@prisma/client";

export const MENU_CATALOG = "🛍 Каталог";
export const MENU_CART = "🛒 Кошик";
export const MENU_ORDERS = "📦 Замовлення";
export const MENU_MANAGER = "💬 Менеджер";

export const CLIENT_MENU_BUTTONS = [MENU_CATALOG, MENU_CART, MENU_ORDERS, MENU_MANAGER];

/** Reply-keyboard label that starts catalog search. Exact match, so it is not sent to a manager. */
export const CATALOG_SEARCH_BUTTON = "🔍 Пошук";

/**
 * Store catalog systems. Ids are SKU prefixes.
 * Keep in sync with apps/store/src/lib/categories.ts and apps/web/src/lib/product-groups.ts.
 */
export const CATALOG_SYSTEMS: { id: string; name: string }[] = [
  { id: "00", name: "Викрутки SUPREX" },
  { id: "01", name: "Straumann RC" },
  { id: "02", name: "Straumann NC" },
  { id: "03", name: "MegaGen AnyRidge" },
  { id: "04", name: "MegaGen AnyOne" },
  { id: "05", name: "MIS Seven" },
  { id: "06", name: "ICX" },
  { id: "07", name: "Straumann BLX" },
  { id: "08", name: "NeoDent" },
  { id: "09", name: "Straumann RN" },
  { id: "10", name: "OSSTEM Regular" },
];

/** Reply keyboard layout: 2×2. */
export const CLIENT_MENU_KEYBOARD: string[][] = [
  [MENU_CATALOG, MENU_CART],
  [MENU_ORDERS, MENU_MANAGER],
];

/** When the public store URL is set, Catalog opens as a Mini App. */
export function buildClientMenuKeyboard(
  storeUrl?: string | null,
): Array<Array<string | { text: string; webAppUrl?: string }>> {
  const catalog =
    storeUrl && /^https:\/\//i.test(storeUrl)
      ? { text: MENU_CATALOG, webAppUrl: storeUrl }
      : MENU_CATALOG;
  return [
    [catalog, MENU_CART],
    [MENU_ORDERS, MENU_MANAGER],
  ];
}

export const TELEGRAM_WELCOME =
  "Вітаємо! Це бот магазину SUPREX.\n\nЩоб відкрити каталог, кошик і кабінет — спочатку поділіться номером телефону кнопкою нижче.";
export const TELEGRAM_HELP =
  "Команди: /menu /catalog /cart /orders /cancel\n\nВільне повідомлення в головному меню потрапляє менеджеру. Під час оформлення текст використовується для кроків (місто, адреса тощо).";
export const TELEGRAM_REQUEST_PHONE =
  "Щоб ідентифікувати вас у CRM і показувати замовлення, поділіться номером телефону кнопкою нижче.";
export const TELEGRAM_EXISTING_CLIENT =
  "Раді бачити вас знову! Оберіть дію в меню або напишіть менеджеру.";
export const TELEGRAM_PROFILE_REQUIRED =
  "Спочатку завершіть короткий профіль — тоді відкриються каталог, кошик і замовлення.";
export const TELEGRAM_ONBOARDING_INTRO =
  "Дякуємо! Номер збережено.\n\nЩоб закріпити менеджера й відкрити кабінет — коротко познайомимось.";
export const TELEGRAM_ONBOARDING_ASK_NAME = "Напишіть ваше ім'я та прізвище одним повідомленням:";
export const TELEGRAM_ONBOARDING_ASK_ROLE = "Ви лікар чи технік?";
export const TELEGRAM_ONBOARDING_ASK_REGION =
  "Оберіть область — за нею закріпимо менеджера:";
export const TELEGRAM_ONBOARDING_DONE =
  "Готово! Профіль збережено в CRM. Можна відкривати каталог або писати менеджеру.";
export const TELEGRAM_ONBOARDING_DONE_NO_MANAGER =
  "Готово! Профіль збережено в CRM.\n\nДля вашої області менеджер ще не закріплений у системі — напишіть нам у чат, і ми допоможемо вручну.";
export const TELEGRAM_ONBOARDING_PAUSED =
  "Профіль ще не завершено. Натисніть /start, щоб продовжити — без цього каталог і оформлення недоступні.";
export const TELEGRAM_CLIENT_TYPE_DOCTOR = "Врач";
export const TELEGRAM_CLIENT_TYPE_TECH = "Техник";
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
  | "onboarding_name"
  | "onboarding_role"
  | "onboarding_region"
  | "checkout_city"
  | "checkout_warehouse_q"
  | "checkout_street"
  | "checkout_building"
  | "checkout_flat"
  | "checkout_comment"
  | "checkout_phone"
  /** Manager: waiting for client phone/name query. */
  | "mgr_search";

export type InlineBtn =
  | { text: string; callback_data: string }
  | { text: string; web_app: { url: string } };
