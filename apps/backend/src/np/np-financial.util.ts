export type NpPayerType = "Recipient" | "Sender" | "ThirdPerson";
export type NpPaymentMethod = "Cash" | "NonCash";

/** Normalize NP API payer type (Recipient / Sender / ThirdPerson). */
export function normalizeNpPayerType(raw?: string | null): NpPayerType | null {
  const v = String(raw ?? "").trim();
  if (v === "Sender") return "Sender";
  if (v === "ThirdPerson") return "ThirdPerson";
  if (v === "Recipient") return "Recipient";
  return null;
}

/** Normalize NP API payment method (Cash / NonCash). */
export function normalizeNpPaymentMethod(raw?: string | null): NpPaymentMethod | null {
  const v = String(raw ?? "").trim();
  if (v === "NonCash") return "NonCash";
  if (v === "Cash") return "Cash";
  return null;
}

/** Map CRM order payment method to NP API payment method. */
export function mapOrderPaymentMethodToNp(orderPm?: string | null): NpPaymentMethod | null {
  const v = String(orderPm ?? "").trim().toUpperCase();
  if (v === "FOP") return "NonCash";
  if (v === "CASH") return "Cash";
  return null;
}

export function resolveNpFinancialFields(input: {
  dtoPayerType?: string | null;
  dtoPaymentMethod?: string | null;
  orderPaymentMethod?: string | null;
  settingsPayerType: string;
  settingsPaymentMethod: string;
}): { payerType: NpPayerType; paymentMethod: NpPaymentMethod } {
  const payerType =
    normalizeNpPayerType(input.dtoPayerType) ??
    normalizeNpPayerType(input.settingsPayerType) ??
    "Recipient";

  const paymentMethod =
    normalizeNpPaymentMethod(input.dtoPaymentMethod) ??
    mapOrderPaymentMethodToNp(input.orderPaymentMethod) ??
    normalizeNpPaymentMethod(input.settingsPaymentMethod) ??
    "Cash";

  return { payerType, paymentMethod };
}
