/** Human labels for CRM enums shown in history and activity. */

export const ENUM_LABELS: Record<string, string> = {
  NEW: "Новий",
  AWAITING_PAYMENT: "Очікує оплату",
  AWAITING_STOCK: "Очікує склад",
  CONFIRMED: "Підтверджено",
  READY_TO_SHIP: "Готово до відправки",
  SHIPPED: "Відправлено",
  AWAITING_RECEIPT: "Очікує отримання",
  RECEIVED: "Отримано",
  COMPLETED: "Завершено",
  CANCELED: "Скасовано",
  REFUSED: "Відмова",
  RETURN_IN_PROGRESS: "Повернення",
  FULLY_RETURNED: "Повернений",
  IN_WORK: "В роботі",
  CONTROL_PAYMENT: "Контроль оплати",
  SUCCESS: "Успішно",
  RETURNING: "Повернення",
  NOT_SHIPPED: "Не відправлено",
  IN_TRANSIT: "В дорозі",
  RETURN_TO_WAREHOUSE: "Повернення на склад",
  PICKUP: "Самовивіз",
  NOVA_POSHTA: "Нова Пошта",
  PREPAYMENT: "Передоплата",
  DEFERRED: "Відстрочка",
  FOP: "ФОП",
  CASH: "Готівка",
  INVOICE_PENDING: "Потрібно виставити рахунок",
  DUE_SOON: "Термін скоро",
  OVERDUE: "Прострочено",
  PAID: "Оплачено",
  CLOSED: "Закрито",
  CRM: "CRM",
  STORE: "Сайт",
  IN_PROGRESS: "В роботі",
  WON: "Успішно",
  NOT_TARGET: "Не цільовий",
  LOST: "Програно",
  SPAM: "Спам",
  FACEBOOK: "Facebook",
  TELEGRAM: "Telegram",
  INSTAGRAM: "Instagram",
  WEBSITE: "Сайт",
  RINGOSTAT: "Ringostat",
  KYIVSTAR: "Київстар",
  OTHER: "Інше",
  META: "Meta",
  FB_LEAD_ADS: "Facebook Lead Ads",
  IG_LEAD_ADS: "Instagram Lead Ads",
  FB_DM: "Facebook",
  IG_DM: "Instagram",
  DRAFT: "Чернетка",
  DELIVERED: "Доставлено",
};

const ENUM_FIELDS = new Set([
  "orderStage",
  "status",
  "deliveryMethod",
  "paymentMethod",
  "paymentType",
  "deliveryStatus",
  "financialStatus",
  "orderSource",
  "source",
  "channel",
  "clientStage",
]);

export function labelEnum(value: string | null | undefined): string | null {
  if (value == null) return null;
  const key = value.trim();
  if (!key) return null;
  return ENUM_LABELS[key] ?? null;
}

export function labelEnumValue(field: string, value: string): string | null {
  const leaf = field.split(".").pop() ?? field;
  if (!ENUM_FIELDS.has(leaf)) return null;
  return labelEnum(value);
}
