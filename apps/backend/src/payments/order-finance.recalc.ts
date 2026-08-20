import { PaymentStatus } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import type { SettingsService } from "../settings/settings.service";
import { toUsd } from "../common/currency.util";
import { computeOrderDebtAndCredit } from "./order-finance.utils";
import {
  computeFinancialStatusFromOrder,
  orderStageToDeliveryStatus,
} from "../orders/order-status-sync.mapper";
import { getOrderCompletionBlockers } from "../orders/order-completion-guards";

/** Recompute paid/debt/credit/financialStatus from Payment rows (shared by payments + Bitrix sync). */
export async function recalcOrderFinance(
  prisma: PrismaService,
  settings: SettingsService,
  orderId: string,
): Promise<void> {
  const [payments, rates] = await Promise.all([
    prisma.payment.findMany({
      where: { orderId, status: PaymentStatus.COMPLETED },
      select: { amount: true, currency: true, amountUsd: true },
    }),
    settings.getExchangeRates(),
  ]);
  const paidAmount = payments.reduce((sum, p) => {
    const usd =
      p.amountUsd != null
        ? Number(p.amountUsd)
        : toUsd(Number(p.amount), p.currency || "USD", rates);
    return sum + usd;
  }, 0);
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      totalAmount: true,
      subtotalAmount: true,
      paidAmount: true,
      returnAdjustmentAmount: true,
      fxWriteOffAmount: true,
      paymentType: true,
      paymentDueDate: true,
      orderStage: true,
      debtAmount: true,
    },
  });
  if (!order) return;
  const { effectiveTotal, debtAmount, creditAmount } = computeOrderDebtAndCredit({
    totalAmount: order.totalAmount,
    returnAdjustmentAmount: order.returnAdjustmentAmount,
    paidAmount,
    fxWriteOffAmount: order.fxWriteOffAmount,
    orderStage: order.orderStage,
  });
  const financialStatus = computeFinancialStatusFromOrder({
    paymentType: order.paymentType,
    totalAmount: effectiveTotal,
    paidAmount,
    debtAmount,
    paymentDueDate: order.paymentDueDate ?? undefined,
    orderStage: order.orderStage ?? undefined,
  });

  const stage = order.orderStage ?? null;
  let autoComplete = stage === "RECEIVED" && debtAmount <= 0.00001;
  if (autoComplete) {
    const blockers = await getOrderCompletionBlockers(prisma, orderId, {
      paymentType: order.paymentType,
      paidAmount,
      totalAmount: order.totalAmount,
      subtotalAmount: order.subtotalAmount ?? 0,
      debtAmount,
      returnAdjustmentAmount: order.returnAdjustmentAmount,
      fxWriteOffAmount: order.fxWriteOffAmount,
      paymentDueDate: order.paymentDueDate,
    });
    autoComplete = blockers.length === 0;
  }
  const nextStage = autoComplete ? "COMPLETED" : stage;
  const deliveryStatus = nextStage
    ? orderStageToDeliveryStatus(nextStage as import("@prisma/client").OrderStage)
    : undefined;

  await prisma.order.update({
    where: { id: orderId },
    data: {
      paidAmount,
      debtAmount,
      creditAmount,
      financialStatus,
      ...(autoComplete && {
        orderStage: "COMPLETED",
        deliveryStatus,
      }),
    },
  });
}
