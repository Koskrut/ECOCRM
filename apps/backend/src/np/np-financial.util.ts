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

/**
 * Resolve NP payer / payment for a TTN.
 * Priority: explicit DTO (TTN modal) → Nova Poshta settings → fallback.
 * Order.paymentMethod is intentionally ignored.
 */
export function resolveNpFinancialFields(input: {
  dtoPayerType?: string | null;
  dtoPaymentMethod?: string | null;
  settingsPayerType: string;
  settingsPaymentMethod: string;
}): { payerType: NpPayerType; paymentMethod: NpPaymentMethod } {
  const payerType =
    normalizeNpPayerType(input.dtoPayerType) ??
    normalizeNpPayerType(input.settingsPayerType) ??
    "Recipient";

  const paymentMethod =
    normalizeNpPaymentMethod(input.dtoPaymentMethod) ??
    normalizeNpPaymentMethod(input.settingsPaymentMethod) ??
    "Cash";

  return { payerType, paymentMethod };
}
