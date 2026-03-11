import { Injectable } from "@nestjs/common";
import { PaymentSourceType, PaymentStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PaymentsService } from "../payments/payments.service";
import { extractOrderNumberFromDescription } from "./match-engine.utils";

@Injectable()
export class MatchEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentsService: PaymentsService,
  ) {}

  async run(): Promise<{ matched: number }> {
    const unmatched = await this.prisma.bankTransaction.findMany({
      where: {
        direction: "IN",
        payments: { none: {} },
      },
      include: { bankAccount: true },
    });
    let matched = 0;
    for (const tx of unmatched) {
      const orderId = await this.findOrderByDescription(tx.description);
      if (orderId) {
        await this.createPaymentFromTransaction(tx.id, orderId);
        matched++;
      }
    }
    return { matched };
  }

  /**
   * Extract order number from description; returns orderId only when exactly one order has orderNumber === normalized.
   */
  async findOrderByDescription(description: string | null): Promise<string | null> {
    const normalized = extractOrderNumberFromDescription(description);
    if (!normalized) return null;

    const orders = await this.prisma.order.findMany({
      where: { orderNumber: normalized },
      select: { id: true, orderNumber: true },
    });
    if (orders.length !== 1) return null;
    return orders[0]!.id;
  }

  async createPaymentFromTransaction(bankTransactionId: string, orderId: string): Promise<void> {
    const tx = await this.prisma.bankTransaction.findUnique({
      where: { id: bankTransactionId },
      include: { bankAccount: true, payments: true },
    });
    if (!tx || tx.payments.length > 0) return;

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) return;

    await this.prisma.payment.create({
      data: {
        orderId,
        sourceType: PaymentSourceType.BANK,
        amount: Number(tx.amount),
        currency: tx.currency,
        paidAt: tx.bookedAt,
        status: PaymentStatus.COMPLETED,
        bankTransactionId: tx.id,
      },
    });

    await this.paymentsService.recalcOrder(orderId);
  }
}
