export function money(amount: number | null | undefined, currency: string): string {
  if (amount == null || !Number.isFinite(amount)) return "—";
  return `${new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 }).format(amount)} ${currency}`;
}

export function spendLabel(
  amount: number | null,
  byCurrency: Array<{ currency: string; amount: number }> | undefined,
  base: string,
): string {
  if (amount != null) return money(amount, base);
  if (!byCurrency?.length) return "—";
  return byCurrency.map((row) => money(row.amount, row.currency)).join(" · ");
}

export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
}
