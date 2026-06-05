import { Injectable } from "@nestjs/common";
import { BankTransactionMatchStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PaymentsService } from "../payments/payments.service";
import { extractOrderNumberFromDescription } from "./match-engine.utils";

export type MatchCandidate = {
  orderId: string;
  score: number;
};

const AUTO_MATCH_THRESHOLD = 90;
const REVIEW_THRESHOLD = 70;

@Injectable()
export class PaymentMatchingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentsService: PaymentsService,
  ) {}

  async run(): Promise<{ matched: number; needsReview: number }> {
    const unmatched = await this.prisma.bankTransaction.findMany({
      where: {
        direction: "IN",
        payments: { none: {} },
        matchStatus: { in: [BankTransactionMatchStatus.UNMATCHED, BankTransactionMatchStatus.NEEDS_REVIEW] },
      },
      include: { bankAccount: true },
    });

    let matched = 0;
    let needsReview = 0;

    for (const tx of unmatched) {
      const candidates = await this.scoreCandidates(tx);
      if (candidates.length === 0) continue;

      const best = candidates[0]!;
      const second = candidates[1];
      const ambiguous =
        second != null && Math.abs(best.score - second.score) < 10 && best.score >= REVIEW_THRESHOLD;

      if (best.score >= AUTO_MATCH_THRESHOLD && !ambiguous) {
        await this.createPaymentFromTransaction(tx.id, best.orderId);
        await this.prisma.bankTransaction.update({
          where: { id: tx.id },
          data: {
            matchStatus: BankTransactionMatchStatus.AUTO_MATCHED,
            matchScore: best.score,
            suggestedOrderId: best.orderId,
          },
        });
        matched++;
      } else if (best.score >= REVIEW_THRESHOLD || ambiguous) {
        await this.prisma.bankTransaction.update({
          where: { id: tx.id },
          data: {
            matchStatus: BankTransactionMatchStatus.NEEDS_REVIEW,
            matchScore: best.score,
            suggestedOrderId: best.orderId,
          },
        });
        needsReview++;
      }
    }

    return { matched, needsReview };
  }

  async scoreCandidates(tx: {
    id: string;
    description: string | null;
    amount: { toString(): string } | number;
    bookedAt: Date;
    counterpartyName: string | null;
  }): Promise<MatchCandidate[]> {
    const amount = Number(tx.amount);
    const orderNumber = extractOrderNumberFromDescription(tx.description);
    const orders = orderNumber
      ? await this.prisma.order.findMany({
          where: { orderNumber },
          select: {
            id: true,
            orderNumber: true,
            debtAmount: true,
            createdAt: true,
            client: { select: { phone: true } },
            company: { select: { name: true } },
          },
        })
      : await this.prisma.order.findMany({
          where: {
            debtAmount: { gte: amount * 0.99, lte: amount * 1.01 },
            createdAt: {
              gte: new Date(tx.bookedAt.getTime() - 14 * 24 * 60 * 60 * 1000),
              lte: new Date(tx.bookedAt.getTime() + 14 * 24 * 60 * 60 * 1000),
            },
          },
          take: 20,
          select: {
            id: true,
            orderNumber: true,
            debtAmount: true,
            createdAt: true,
            client: { select: { phone: true } },
            company: { select: { name: true } },
          },
        });

    const scored: MatchCandidate[] = [];
    for (const order of orders) {
      let score = 0;
      if (orderNumber && order.orderNumber === orderNumber) score += 80;
      const debt = Number(order.debtAmount ?? 0);
      if (debt > 0 && Math.abs(debt - amount) < 0.01) score += 30;
      const daysDiff = Math.abs(order.createdAt.getTime() - tx.bookedAt.getTime()) / (24 * 60 * 60 * 1000);
      if (daysDiff <= 14) score += 10;
      if (tx.counterpartyName && order.company?.name) {
        const a = tx.counterpartyName.toLowerCase();
        const b = order.company.name.toLowerCase();
        if (a.includes(b) || b.includes(a)) score += 15;
      }
      if (score > 0) scored.push({ orderId: order.id, score });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored;
  }

  async createPaymentFromTransaction(bankTransactionId: string, orderId: string): Promise<void> {
    const tx = await this.prisma.bankTransaction.findUnique({
      where: { id: bankTransactionId },
      include: { payments: true },
    });
    if (!tx || tx.payments.length > 0) return;

    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return;

    await this.prisma.payment.create({
      data: {
        orderId,
        sourceType: "BANK",
        amount: Number(tx.amount),
        currency: tx.currency,
        paidAt: tx.bookedAt,
        status: "COMPLETED",
        bankTransactionId: tx.id,
      },
    });
    await this.paymentsService.recalcOrder(orderId);
  }
}
