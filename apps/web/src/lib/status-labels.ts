/**
 * Centralized UA display labels for API status enums.
 * Do not change API contracts — only UI labels. Unknown codes return as-is.
 */

function pick(map: Record<string, string>, code: string | null | undefined): string {
  if (!code) return "";
  return map[code] ?? code;
}

/** Visit.status */
export const VISIT_STATUS_UA: Record<string, string> = {
  SCHEDULED: "Запланований",
  IN_PROGRESS: "В процесі",
  DONE: "Завершено",
  CANCELED: "Скасовано",
  PLANNED_UNASSIGNED: "Без виконавця",
};

export function visitStatusLabel(status: string | null | undefined): string {
  return pick(VISIT_STATUS_UA, status);
}

/** Visit.outcome */
export const VISIT_OUTCOME_UA: Record<string, string> = {
  SUCCESS: "Успіх",
  FOLLOW_UP: "Дозвон / повтор",
  NO_DECISION: "Без рішення",
  NOT_RELEVANT: "Не релевантно",
  FAILED: "Невдача",
};

export function visitOutcomeLabel(outcome: string | null | undefined): string {
  if (!outcome) return "Без результату";
  return pick(VISIT_OUTCOME_UA, outcome);
}

/** FieldShift.status */
export const SHIFT_STATUS_UA: Record<string, string> = {
  ACTIVE: "Активна",
  ENDED: "Завершена",
};

export function shiftStatusLabel(status: string | null | undefined): string {
  return pick(SHIFT_STATUS_UA, status);
}

/** FuelCompensation.status */
export const FUEL_STATUS_UA: Record<string, string> = {
  DRAFT: "Чернетка",
  SUBMITTED: "Надіслано",
  APPROVED: "Затверджено",
  REJECTED: "Відхилено",
  PAID: "Виплачено",
};

export function fuelStatusLabel(status: string | null | undefined): string {
  return pick(FUEL_STATUS_UA, status);
}

/** Inbox conversation status (Meta / Telegram) */
export const INBOX_STATUS_UA: Record<string, string> = {
  OPEN: "Відкрито",
  PENDING: "Очікує",
  CLOSED: "Закрито",
};

export function inboxStatusLabel(status: string | null | undefined): string {
  return pick(INBOX_STATUS_UA, status);
}

/** OutboundAttempt.status */
export const OUTBOUND_STATUS_UA: Record<string, string> = {
  PENDING: "Очікує",
  QUEUED: "У черзі",
  DIALING: "Дзвінок",
  COMPLETED: "Завершено",
  FAILED: "Помилка",
  NO_ANSWER: "Немає відповіді",
  CANCELED: "Скасовано",
};

export function outboundStatusLabel(status: string | null | undefined): string {
  return pick(OUTBOUND_STATUS_UA, status);
}

/** Task.status — mirrors strings.tasks.status for non-locale call sites */
export const TASK_STATUS_UA: Record<string, string> = {
  OPEN: "Відкрито",
  IN_PROGRESS: "В роботі",
  DONE: "Виконано",
  CANCELED: "Скасовано",
};

export function taskStatusUaLabel(status: string | null | undefined): string {
  return pick(TASK_STATUS_UA, status);
}

/** Lead.status (StatusBadge / pipeline defaults parity) */
export const LEAD_STATUS_UA: Record<string, string> = {
  NEW: "Не оброблений",
  IN_PROGRESS: "В роботі",
  WON: "Успішний",
  NOT_TARGET: "Нецільовий",
  LOST: "Провалений",
  SPAM: "Спам",
};

export function leadStatusLabel(status: string | null | undefined): string {
  return pick(LEAD_STATUS_UA, status);
}

/** Order.orderStage (primary) */
export const ORDER_STAGE_UA: Record<string, string> = {
  NEW: "Новий",
  CONFIRMED: "Підтверджено",
  AWAITING_PAYMENT: "Очікує оплату",
  AWAITING_STOCK: "Очікує на склад",
  READY_TO_SHIP: "Готово до відправки",
  SHIPPED: "Відправлено",
  AWAITING_RECEIPT: "Очікує отримання",
  RECEIVED: "Отримано",
  COMPLETED: "Завершено",
  CANCELED: "Скасовано",
  REFUSED: "Відмова від отримання",
  RETURN_IN_PROGRESS: "Повернення",
  FULLY_RETURNED: "Повернений",
};

export function orderStageLabel(stage: string | null | undefined): string {
  return pick(ORDER_STAGE_UA, stage);
}

/** Legacy Order.status (fallback when orderStage missing) */
export const ORDER_STATUS_UA: Record<string, string> = {
  NEW: "Нове",
  IN_WORK: "В роботі",
  READY_TO_SHIP: "Готово до відправки",
  SHIPPED: "Відправлено",
  CONTROL_PAYMENT: "Контроль оплати",
  SUCCESS: "Успішне",
  RETURNING: "Повернення",
  CANCELED: "Скасовано",
};

export function orderStatusLabel(status: string | null | undefined): string {
  return pick(ORDER_STATUS_UA, status);
}

/** Prefer orderStage; fall back to legacy status. */
export function orderDisplayStatusLabel(
  orderStage: string | null | undefined,
  status: string | null | undefined,
): string {
  if (orderStage) {
    const stage = orderStageLabel(orderStage);
    if (stage !== orderStage || ORDER_STAGE_UA[orderStage]) return stage;
  }
  return orderStatusLabel(status);
}

/** PaymentType */
export const PAYMENT_TYPE_UA: Record<string, string> = {
  PREPAYMENT: "Передоплата",
  DEFERRED: "Відтермінування",
};

export function paymentTypeLabel(type: string | null | undefined): string {
  return pick(PAYMENT_TYPE_UA, type);
}

/** Order paymentStatus */
export const PAYMENT_STATUS_UA: Record<string, string> = {
  UNPAID: "Не оплачено",
  PARTIALLY_PAID: "Частково оплачено",
  PAID: "Оплачено",
  OVERPAID: "Переплата",
};

export function paymentStatusLabel(status: string | null | undefined): string {
  return pick(PAYMENT_STATUS_UA, status);
}

/** Payment request / link status */
export const PAY_REQUEST_STATUS_UA: Record<string, string> = {
  PENDING: "Очікує оплату",
  PAID: "Оплачено",
  EXPIRED: "Прострочено",
  CANCELED: "Скасовано",
};

export function payRequestStatusLabel(status: string | null | undefined): string {
  return pick(PAY_REQUEST_STATUS_UA, status);
}
