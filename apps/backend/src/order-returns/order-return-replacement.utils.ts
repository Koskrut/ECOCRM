import { InternalServerErrorException } from "@nestjs/common";
import type { OrderSource, OrderStage, Prisma } from "@prisma/client";
import { ActivityType } from "@prisma/client";
import { computeFinancialStatusFromOrder } from "../orders/order-status-sync.mapper";
import { computeLineTotal } from "../orders/order-line-total.utils";

type ReplacementLine = {
  orderItemId: string;
  productId: string;
  productNameSnapshot: string | null;
  qty: number;
  price: number;
  discountPercent: number;
};

type ParentOrderForReplacement = {
  id: string;
  orderNumber: string;
  ownerId: string;
  companyId: string | null;
  clientId: string | null;
  contactId: string | null;
  orderSource: OrderSource;
  currency: string;
  deliveryMethod: string | null;
  paymentMethod: string | null;
  bankAccountId: string | null;
  warehouseId: string | null;
  documentsRequested: boolean | null;
  paymentType: string | null;
  paymentDueDate: Date | null;
  exchangeRate: number | null;
  discountAmount: number;
  items: Array<{
    id: string;
    productId: string | null;
    productNameSnapshot: string | null;
    qty: number;
    price: number;
    discountPercent: number;
  }>;
};

export async function createReplacementOrder(
  tx: Prisma.TransactionClient,
  parent: ParentOrderForReplacement,
  lines: ReplacementLine[],
  changedBy: string,
): Promise<string> {
  if (lines.length === 0) {
    throw new InternalServerErrorException("Replacement order requires at least one line");
  }

  const rows = await tx.$queryRaw<[{ assigned: number }]>`
    UPDATE "OrderNumberSeq" SET "nextValue" = "nextValue" + 1
    RETURNING "nextValue" - 1 AS assigned
  `;
  const row = rows[0];
  if (!row) throw new InternalServerErrorException("OrderNumberSeq not initialized");
  const orderNumber = String(row.assigned);

  const childStage: OrderStage = "CONFIRMED";
  const subtotal = 0;
  const discountAmount = 0;
  const total = 0;
  const paidAmount = 0;
  const debtAmount = 0;
  const financialStatus = computeFinancialStatusFromOrder({
    totalAmount: total,
    paidAmount,
    debtAmount,
    paymentType: parent.paymentType as "PREPAYMENT" | "DEFERRED" | null,
    orderStage: childStage,
  });

  const child = await tx.order.create({
    data: {
      orderNumber,
      parentOrderId: parent.id,
      companyId: parent.companyId,
      clientId: parent.clientId,
      contactId: parent.contactId,
      ownerId: parent.ownerId,
      orderSource: parent.orderSource,
      currency: parent.currency,
      subtotalAmount: subtotal,
      discountAmount,
      totalAmount: total,
      paidAmount,
      debtAmount,
      comment: `Заміна (пересорт) з №${parent.orderNumber}`,
      deliveryMethod: parent.deliveryMethod as "PICKUP" | "NOVA_POSHTA" | null,
      paymentMethod: parent.paymentMethod as "FOP" | "CASH" | null,
      bankAccountId: parent.bankAccountId,
      warehouseId: parent.warehouseId,
      documentsRequested: parent.documentsRequested,
      paymentType: parent.paymentType as "PREPAYMENT" | "DEFERRED" | null,
      paymentDueDate: parent.paymentDueDate,
      exchangeRate: parent.exchangeRate,
      orderStage: childStage,
      deliveryStatus: "NOT_SHIPPED",
      financialStatus,
      returnAdjustmentAmount: 0,
    },
  });

  for (const line of lines) {
    await tx.orderItem.create({
      data: {
        orderId: child.id,
        productId: line.productId,
        productNameSnapshot: line.productNameSnapshot,
        qty: line.qty,
        price: line.price,
        discountPercent: line.discountPercent,
        lineTotal: computeLineTotal(line.qty, line.price, line.discountPercent),
      },
    });
  }

  await tx.activity.create({
    data: {
      type: ActivityType.COMMENT,
      title: "Заміна (пересорт)",
      body: `Створено замовлення-заміну №${orderNumber} через пересорт у батьківському №${parent.orderNumber}.`,
      createdBy: changedBy,
      orderId: parent.id,
    },
  });
  await tx.activity.create({
    data: {
      type: ActivityType.COMMENT,
      title: "Заміна (пересорт)",
      body: `Замовлення-заміна для №${parent.orderNumber}.`,
      createdBy: changedBy,
      orderId: child.id,
    },
  });

  return child.id;
}

export function buildReplacementLinesFromReturnItems(
  parent: ParentOrderForReplacement,
  returnItems: Array<{ orderItemId: string; qtyReturned: number }>,
): ReplacementLine[] {
  const orderItemById = new Map(parent.items.map((i) => [i.id, i]));
  const lines: ReplacementLine[] = [];

  for (const ri of returnItems) {
    const oi = orderItemById.get(ri.orderItemId);
    if (!oi?.productId) {
      throw new InternalServerErrorException(
        `Order item ${ri.orderItemId} has no product for replacement`,
      );
    }
    lines.push({
      orderItemId: ri.orderItemId,
      productId: oi.productId,
      productNameSnapshot: oi.productNameSnapshot,
      qty: ri.qtyReturned,
      price: 0,
      discountPercent: 0,
    });
  }

  return lines;
}

export async function syncMisPickOutboundForReplacementOrder(
  tx: Prisma.TransactionClient,
  replacementOrderId: string,
  replacementStage: OrderStage | null | undefined,
): Promise<void> {
  const shipped =
    replacementStage === "SHIPPED" ||
    replacementStage === "AWAITING_RECEIPT" ||
    replacementStage === "RECEIVED" ||
    replacementStage === "COMPLETED";
  if (!shipped) return;

  await tx.orderReturn.updateMany({
    where: {
      replacementOrderId,
      outboundDoneAt: null,
      outboundWaivedAt: null,
    },
    data: { outboundDoneAt: new Date() },
  });
}
