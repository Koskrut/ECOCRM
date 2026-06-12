import { BadRequestException } from "@nestjs/common";
import type { PaymentType } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import {
  findUnsettledClosedReturns,
  type ClosedReturnForSettlement,
} from "../order-returns/return-settlement.utils";
import { computeFinancialStatusFromOrder } from "./order-status-sync.mapper";
import {
  assertPaymentClosedForCompletion,
  computeEffectiveDebt,
  computeEffectiveTotal,
  type OrderPaymentContext,
} from "./order-payment-guards";

export type OrderCompletionContext = OrderPaymentContext & {
  paymentType?: PaymentType | null;
  paymentDueDate?: Date | null;
};

export function projectedFinancialStatusAtCompleted(ctx: OrderCompletionContext) {
  const effectiveTotal = computeEffectiveTotal(ctx);
  const debt = computeEffectiveDebt(ctx);
  return computeFinancialStatusFromOrder({
    paymentType: ctx.paymentType,
    paidAmount: Number(ctx.paidAmount ?? 0),
    totalAmount: effectiveTotal,
    debtAmount: debt,
    paymentDueDate: ctx.paymentDueDate ?? undefined,
    orderStage: "COMPLETED",
  });
}

export function assertFinanciallyClosedForCompletion(ctx: OrderCompletionContext): void {
  assertPaymentClosedForCompletion(ctx);
  const projected = projectedFinancialStatusAtCompleted(ctx);
  if (projected !== "CLOSED") {
    throw new BadRequestException(
      `Cannot complete order: financial status is ${projected}, expected CLOSED. Resolve payment and return settlement first.`,
    );
  }
}

export function getSyncCompletionBlockers(ctx: OrderCompletionContext): string[] {
  const blockers: string[] = [];
  const debt = computeEffectiveDebt(ctx);
  if (debt > 0.00001) {
    blockers.push(`open_debt:${debt.toFixed(2)}`);
  }
  const projected = projectedFinancialStatusAtCompleted(ctx);
  if (projected !== "CLOSED") {
    blockers.push(`financial_status:${projected}`);
  }
  return blockers;
}

export async function getUnsettledReturnBlockers(
  prisma: Pick<PrismaClient, "orderReturn">,
  orderId: string,
  order: { subtotalAmount: number; totalAmount: number; paidAmount: number },
): Promise<string[]> {
  const closedReturns = await prisma.orderReturn.findMany({
    where: { orderId, status: "CLOSED" },
    select: {
      id: true,
      settledAt: true,
      items: { select: { qtyReturned: true, orderItem: { select: { qty: true, lineTotal: true } } } },
    },
  });
  const unsettled = findUnsettledClosedReturns(
    closedReturns as ClosedReturnForSettlement[],
    order,
  );
  return unsettled.map((r) => `unsettled_return:${r.id}`);
}

export async function assertOrderReadyForCompletion(
  prisma: Pick<PrismaClient, "orderReturn">,
  orderId: string,
  ctx: OrderCompletionContext & {
    subtotalAmount: number;
    totalAmount: number;
    paidAmount: number;
  },
): Promise<void> {
  assertFinanciallyClosedForCompletion(ctx);

  const unsettled = await getUnsettledReturnBlockers(prisma, orderId, {
    subtotalAmount: ctx.subtotalAmount,
    totalAmount: ctx.totalAmount,
    paidAmount: ctx.paidAmount,
  });
  if (unsettled.length > 0) {
    throw new BadRequestException(
      "Cannot complete order: closed return has unsettled overpayment. Complete return settlement (credit or refund) first.",
    );
  }
}

export async function getOrderCompletionBlockers(
  prisma: Pick<PrismaClient, "orderReturn">,
  orderId: string,
  ctx: OrderCompletionContext & {
    subtotalAmount: number;
    totalAmount: number;
    paidAmount: number;
  },
): Promise<string[]> {
  const sync = getSyncCompletionBlockers(ctx);
  const unsettled = await getUnsettledReturnBlockers(prisma, orderId, {
    subtotalAmount: ctx.subtotalAmount,
    totalAmount: ctx.totalAmount,
    paidAmount: ctx.paidAmount,
  });
  return [...sync, ...unsettled];
}
