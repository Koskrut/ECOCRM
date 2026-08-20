import type { Payment } from "@prisma/client";
import type { AuditService } from "../audit/audit.service";

export type PaymentAuditSnapshot = {
  id: string;
  orderId: string;
  orderNumber?: string | null;
  amount: number;
  currency: string;
  amountUsd: number | null;
  sourceType: string;
};

export function paymentAuditSnapshot(
  payment: Pick<Payment, "id" | "orderId" | "amount" | "currency" | "amountUsd" | "sourceType">,
  orderNumber?: string | null,
): PaymentAuditSnapshot {
  return {
    id: payment.id,
    orderId: payment.orderId,
    orderNumber: orderNumber ?? null,
    amount: Number(payment.amount),
    currency: payment.currency,
    amountUsd: payment.amountUsd != null ? Number(payment.amountUsd) : null,
    sourceType: payment.sourceType,
  };
}

export async function writePaymentChangeAudit(
  audit: AuditService,
  input: {
    action: "UPDATE" | "DELETE";
    changedBy: string;
    changedByRole?: string | null;
    before: PaymentAuditSnapshot;
    after?: PaymentAuditSnapshot | null;
  },
): Promise<void> {
  await audit.write(
    audit.buildUpdatePayload({
      entityType: "Payment",
      entityId: input.before.id,
      action: input.action,
      changedBy: input.changedBy,
      changedByRole: input.changedByRole ?? null,
      before: input.before,
      after: input.after ?? null,
      context: {
        orderId: input.before.orderId,
        orderNumber: input.before.orderNumber,
      },
    }),
  );
}
