const ORDER_STATUS_LABELS: Record<string, string> = {
  NEW: "Новий",
  IN_WORK: "В роботі",
  CANCELED: "Скасовано",
  DONE: "Виконано",
  SHIPPED: "Відправлено",
};

export function orderStatusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status] ?? status;
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
