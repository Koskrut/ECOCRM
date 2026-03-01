import { Injectable } from "@nestjs/common";
import { PaymentSourceType, PaymentStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PaymentsService } from "../payments/payments.service";

const ORDER_NUMBER_DIGITS_REGEX = /\d{4,8}/g;

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

  async findOrderByDescription(description: string | null): Promise<string | null> {
    if (!description || !description.trim()) return null;
    const digits = description.match(ORDER_NUMBER_DIGITS_REGEX);
    if (!digits || digits.length === 0) return null;

    const candidates: { id: string; orderNumber: string }[] = [];
    for (const num of digits) {
      const orders = await this.prisma.order.findMany({
        where: {
          OR: [
            { orderNumber: num },
            { orderNumber: { endsWith: num } },
            { orderNumber: { contains: num } },
          ],
        },
        select: { id: true, orderNumber: true },
      });
      candidates.push(...orders);
    }

    const unique = Array.from(new Map(candidates.map((o) => [o.id, o])).values());
    if (unique.length !== 1) return null;
    return unique[0]!.id;
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
