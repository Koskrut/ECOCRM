/** Whether NP tracking indicates inbound return parcel arrived at our warehouse. */
export function isInboundReturnReceivedByNpStatus(
  statusCode?: string | null,
  statusText?: string | null,
): boolean {
  const code = String(statusCode ?? "").trim();
  const text = String(statusText ?? "").toLowerCase();

  if (["9", "10", "11"].includes(code)) return true;
  if (text.includes("отрим") || text.includes("получен") || text.includes("вручен")) return true;
  if (text.includes("прибул") && (text.includes("відділен") || text.includes("склад"))) return true;

  return false;
}

export function normalizeTtnNumber(raw: string): string {
  return raw.replace(/\s+/g, "").trim();
}
