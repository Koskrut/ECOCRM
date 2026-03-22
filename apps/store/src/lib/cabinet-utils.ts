const ORDER_STATUS_LABELS: Record<string, string> = {
  NEW: "Новий",
  IN_WORK: "В роботі",
  READY_TO_SHIP: "Готовий до відправки",
  SHIPPED: "Відправлено",
  CONTROL_PAYMENT: "Контроль оплати",
  SUCCESS: "Виконано",
  RETURNING: "Повернення",
  CANCELED: "Скасовано",
  DONE: "Виконано",
};

const DELIVERY_METHOD_LABELS: Record<string, string> = {
  PICKUP: "Самовивіз",
  NOVA_POSHTA: "Нова Пошта",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  FOP: "Безготівково",
  CASH: "Готівка",
};

function formatUahInt(n: number): string {
  return Math.round(n).toLocaleString("uk-UA");
}

/** Сума для клієнта в гривнях (для USD множиться на exchangeRate, якщо він заданий). */
export function amountInUah(
  amount: number,
  currency: string,
  exchangeRate?: number | null,
): number | null {
  const x = Number(amount);
  if (currency === "UAH") return Math.round(x);
  if (currency === "USD" && exchangeRate != null && exchangeRate > 0) {
    return Math.round(x * exchangeRate);
  }
  return null;
}

/**
 * Відображення суми: пріоритет гривня; для USD з курсом — грн і дужках долари.
 */
export function formatCabinetMoney(
  amount: number,
  currency: string,
  exchangeRate?: number | null,
): string {
  const uah = amountInUah(amount, currency, exchangeRate);
  if (uah != null) {
    if (currency === "USD" && exchangeRate != null && exchangeRate > 0) {
      return `${uah.toLocaleString("uk-UA")} грн (${Number(amount).toFixed(2)} $)`;
    }
    return `${uah.toLocaleString("uk-UA")} грн`;
  }
  if (currency === "USD") {
    return `${Number(amount).toFixed(2)} $`;
  }
  return `${Number(amount).toFixed(2)} ${currency}`;
}

export function formatCabinetLineMoney(
  amount: number,
  currency: string,
  exchangeRate?: number | null,
): string {
  const uah = amountInUah(amount, currency, exchangeRate);
  if (uah != null) {
    return `${formatUahInt(uah)} грн`;
  }
  if (currency === "USD") {
    return `${Number(amount).toFixed(2)} $`;
  }
  return `${Number(amount).toFixed(2)} ${currency}`;
}

export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status] ?? status;
}

export function deliveryMethodLabel(method: string | null | undefined): string | null {
  if (!method) return null;
  return DELIVERY_METHOD_LABELS[method] ?? method;
}

export function paymentMethodLabel(method: string | null | undefined): string | null {
  if (!method) return null;
  return PAYMENT_METHOD_LABELS[method] ?? method;
}

const dateFormatter = new Intl.DateTimeFormat("uk-UA", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatCabinetDate(isoDate: string): string {
  return dateFormatter.format(new Date(isoDate));
}

export function formatCabinetDateShort(isoDate: string): string {
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(isoDate));
}
