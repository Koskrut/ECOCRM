import type { PaymentRequest, PaymentRequestStatus } from "@prisma/client";

export type PaymentRequestPublicDto = {
  status: PaymentRequestStatus;
  /** Обчислений статус: PENDING з простроченим expiresAt → EXPIRED. */
  effectiveStatus: PaymentRequestStatus;
  amount: number;
  currency: string;
  purpose: string;
  expiresAt: string;
  recipientName: string;
  iban: string;
  edrpou: string | null;
  mfo: string | null;
  bankName: string | null;
  nbuDeeplink: string;
  /** PNG QR (data URL), той самий payload що й deeplink. */
  qrPngDataUrl: string;
};

export function effectivePaymentRequestStatus(
  row: Pick<PaymentRequest, "status" | "expiresAt">,
  now: Date = new Date(),
): PaymentRequestStatus {
  if (row.status !== "PENDING") return row.status;
  if (row.expiresAt <= now) return "EXPIRED";
  return "PENDING";
}

export function toPaymentRequestPublicDto(
  row: PaymentRequest,
  qrPngDataUrl: string,
  now: Date = new Date(),
): PaymentRequestPublicDto {
  const effectiveStatus = effectivePaymentRequestStatus(row, now);
  return {
    status: row.status,
    effectiveStatus,
    amount: Number(row.amount),
    currency: row.currency,
    purpose: row.purpose,
    expiresAt: row.expiresAt.toISOString(),
    recipientName: row.recipientName,
    iban: row.iban,
    edrpou: row.edrpou,
    mfo: row.mfo,
    bankName: row.bankName,
    nbuDeeplink: row.nbuDeeplink,
    qrPngDataUrl,
  };
}
