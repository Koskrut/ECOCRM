import { Injectable, Logger } from "@nestjs/common";
import { BankTransactionMatchStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PaymentsService } from "../payments/payments.service";
import {
  allocationExceedsTransaction,
  lockBankTransactionForUpdate,
  sumBankTransactionAllocations,
  withBankMatchAdvisoryLock,
} from "./bank-allocation.util";
import {
  amountsMatchWithinTolerance,
  expectedPaymentAmountInCurrency,
  extractOrderNumberFromDescription,
  extractPersonNameFromDescription,
  firstNameVariants,
} from "./match-engine.utils";

export type MatchCandidate = {
  orderId: string;
  score: number;
  matchReason?: string;
};

export type MatchSuggestion = {
  orderId: string;
  orderNumber: string;
  contactLabel: string;
  debtAmount: number;
  currency: string;
  expectedAmountUah: number | null;
  score: number;
};

const AUTO_MATCH_THRESHOLD = 90;
const REVIEW_THRESHOLD = 70;

const ORDER_SELECT = {
  id: true,
  orderNumber: true,
  debtAmount: true,
  currency: true,
  exchangeRate: true,
  createdAt: true,
  contactId: true,
  clientId: true,
  client: { select: { firstName: true, lastName: true, phone: true } },
  contact: { select: { firstName: true, lastName: true, phone: true } },
  company: { select: { name: true } },
} as const;

type OrderForMatch = {
  id: string;
  orderNumber: string;
  debtAmount: number | null;
  currency: string;
  exchangeRate: number | null;
  createdAt: Date;
  contactId: string | null;
  clientId: string | null;
  client: { firstName: string; lastName: string; phone: string } | null;
  contact: { firstName: string; lastName: string; phone: string } | null;
  company: { name: string } | null;
};

@Injectable()
export class PaymentMatchingService {
  private readonly logger = new Logger(PaymentMatchingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentsService: PaymentsService,
  ) {}

  async run(): Promise<{ matched: number; needsReview: number }> {
    return withBankMatchAdvisoryLock(this.prisma, () => this.runMatching());
  }

  private async runMatching(): Promise<{ matched: number; needsReview: number }> {
    const unmatched = await this.prisma.bankTransaction.findMany({
      where: {
        direction: "IN",
        payments: { none: {} },
        matchStatus: {
          in: [BankTransactionMatchStatus.UNMATCHED, BankTransactionMatchStatus.NEEDS_REVIEW],
        },
      },
      include: { bankAccount: true },
    });

    let matched = 0;
    let needsReview = 0;

    for (const tx of unmatched) {
      const candidates = await this.scoreCandidates({
        id: tx.id,
        description: tx.description,
        amount: tx.amount,
        currency: tx.currency,
        bookedAt: tx.bookedAt,
        counterpartyName: tx.counterpartyName,
      });
      if (candidates.length === 0) {
        this.logger.debug(
          `No match candidates for tx ${tx.id}: "${tx.description?.slice(0, 80) ?? ""}"`,
        );
        continue;
      }

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
        this.logger.log(
          `Auto-matched tx ${tx.id} → order ${best.orderId} (score=${best.score}, ${best.matchReason ?? "unknown"})`,
        );
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
        this.logger.debug(
          `Tx ${tx.id} needs review: best score=${best.score}, ambiguous=${ambiguous}`,
        );
        needsReview++;
      } else {
        this.logger.debug(
          `Tx ${tx.id} below review threshold: best score=${best.score} (${best.matchReason ?? ""})`,
        );
      }
    }

    return { matched, needsReview };
  }

  async scoreCandidates(tx: {
    id: string;
    description: string | null;
    amount: { toString(): string } | number;
    currency?: string;
    bookedAt: Date;
    counterpartyName: string | null;
  }): Promise<MatchCandidate[]> {
    const amount = Number(tx.amount);
    const txCurrency = tx.currency ?? "UAH";
    const orderNumber = extractOrderNumberFromDescription(tx.description);

    const orderMap = new Map<string, OrderForMatch>();

    if (orderNumber) {
      const byNumber = await this.prisma.order.findMany({
        where: { orderNumber },
        select: ORDER_SELECT,
      });
      for (const o of byNumber) orderMap.set(o.id, o);
    } else {
      // FX-aware amount discovery: a USD order paid in UAH has debtAmount in USD,
      // so compare against the expected converted amount rather than raw debtAmount.
      const windowOrders = await this.prisma.order.findMany({
        where: {
          debtAmount: { gt: 0 },
          createdAt: {
            gte: new Date(tx.bookedAt.getTime() - 14 * 24 * 60 * 60 * 1000),
            lte: new Date(tx.bookedAt.getTime() + 14 * 24 * 60 * 60 * 1000),
          },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: ORDER_SELECT,
      });
      for (const o of windowOrders) {
        const expected = expectedPaymentAmountInCurrency(
          Number(o.debtAmount ?? 0),
          o.currency,
          txCurrency,
          o.exchangeRate,
        );
        if (expected != null && amountsMatchWithinTolerance(expected, amount)) {
          orderMap.set(o.id, o);
        }
      }
    }

    const nameOrders = await this.findOrdersByNameInDescription({
      description: tx.description,
      counterpartyName: tx.counterpartyName,
      bookedAt: tx.bookedAt,
      amount,
      txCurrency,
    });
    for (const o of nameOrders) orderMap.set(o.id, o);

    const scored: MatchCandidate[] = [];
    const nameMatchedOrderIds = new Set(nameOrders.map((o) => o.id));

    for (const order of orderMap.values()) {
      const { score, reason } = this.scoreOrder(order, {
        amount,
        txCurrency,
        orderNumber,
        bookedAt: tx.bookedAt,
        counterpartyName: tx.counterpartyName,
        nameMatched: nameMatchedOrderIds.has(order.id),
      });
      if (score > 0) scored.push({ orderId: order.id, score, matchReason: reason });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored;
  }

  async getSuggestion(tx: {
    id: string;
    description: string | null;
    amount: { toString(): string } | number;
    currency?: string;
    bookedAt: Date;
    counterpartyName: string | null;
  }): Promise<MatchSuggestion | null> {
    const candidates = await this.scoreCandidates(tx);
    const best = candidates[0];
    if (!best || best.score < REVIEW_THRESHOLD) return null;

    const order = await this.prisma.order.findUnique({
      where: { id: best.orderId },
      select: ORDER_SELECT,
    });
    if (!order) return null;

    const debt = Number(order.debtAmount ?? 0);
    const contact = order.contact ?? order.client;
    const contactLabel = contact
      ? [contact.lastName, contact.firstName].filter(Boolean).join(" ")
      : "";

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      contactLabel,
      debtAmount: debt,
      currency: order.currency,
      expectedAmountUah: expectedPaymentAmountInCurrency(
        debt,
        order.currency,
        "UAH",
        order.exchangeRate,
      ),
      score: best.score,
    };
  }

  private scoreOrder(
    order: OrderForMatch,
    ctx: {
      amount: number;
      txCurrency: string;
      orderNumber: string | null;
      bookedAt: Date;
      counterpartyName: string | null;
      nameMatched: boolean;
    },
  ): { score: number; reason: string } {
    let score = 0;
    const reasons: string[] = [];

    if (ctx.orderNumber && order.orderNumber === ctx.orderNumber) {
      score += 80;
      reasons.push("orderNumber");
    }

    if (ctx.nameMatched) {
      score += 70;
      reasons.push("contactName");
    }

    const debt = Number(order.debtAmount ?? 0);
    const expected = expectedPaymentAmountInCurrency(
      debt,
      order.currency,
      ctx.txCurrency,
      order.exchangeRate,
    );
    if (
      expected != null &&
      amountsMatchWithinTolerance(expected, ctx.amount)
    ) {
      score += 30;
      reasons.push("amount");
    } else if (debt > 0 && Math.abs(debt - ctx.amount) < 0.01) {
      score += 30;
      reasons.push("amountDirect");
    }

    if (order.createdAt <= ctx.bookedAt) {
      const daysDiff =
        Math.abs(order.createdAt.getTime() - ctx.bookedAt.getTime()) / (24 * 60 * 60 * 1000);
      if (daysDiff <= 14) {
        score += 10;
        reasons.push("date");
      }
    }

    if (ctx.counterpartyName && order.company?.name) {
      const a = ctx.counterpartyName.toLowerCase();
      const b = order.company.name.toLowerCase();
      if (a.includes(b) || b.includes(a)) {
        score += 15;
        reasons.push("company");
      }
    }

    return { score, reason: reasons.join("+") || "none" };
  }

  /**
   * Find a single unpaid order from a contact name in the description or counterparty.
   * When one contact has several open orders, narrow by the (FX-aware) payment amount.
   */
  private async findOrdersByNameInDescription(ctx: {
    description: string | null;
    counterpartyName: string | null;
    bookedAt: Date;
    amount: number;
    txCurrency: string;
  }): Promise<OrderForMatch[]> {
    const person =
      extractPersonNameFromDescription(ctx.description) ??
      extractPersonNameFromDescription(ctx.counterpartyName);
    if (!person) return [];

    const variants = firstNameVariants(person.firstName);
    let contacts = await this.prisma.contact.findMany({
      where: {
        lastName: { equals: person.lastName, mode: "insensitive" },
        OR: variants.map((fn) => ({
          firstName: { equals: fn, mode: "insensitive" as const },
        })),
      },
      select: { id: true, middleName: true },
    });

    // Disambiguate homonyms by patronymic when the description carries one.
    if (contacts.length > 1 && person.middleName) {
      const mid = person.middleName.toLowerCase();
      const narrowed = contacts.filter((c) => c.middleName?.toLowerCase() === mid);
      if (narrowed.length > 0) contacts = narrowed;
    }

    if (contacts.length !== 1) {
      this.logger.debug(
        `Name "${person.lastName} ${person.firstName}${person.middleName ? ` ${person.middleName}` : ""}": ${contacts.length} contacts (need exactly 1)`,
      );
      return [];
    }

    const contactId = contacts[0]!.id;
    const orders = await this.prisma.order.findMany({
      where: {
        OR: [{ contactId }, { clientId: contactId }],
        debtAmount: { gt: 0 },
        createdAt: { lte: ctx.bookedAt },
      },
      select: ORDER_SELECT,
    });

    if (orders.length === 0) return [];
    if (orders.length === 1) return orders;

    // Several open orders for the same contact: keep only the one matching the amount.
    const byAmount = orders.filter((o) => {
      const expected = expectedPaymentAmountInCurrency(
        Number(o.debtAmount ?? 0),
        o.currency,
        ctx.txCurrency,
        o.exchangeRate,
      );
      return expected != null && amountsMatchWithinTolerance(expected, ctx.amount);
    });
    if (byAmount.length === 1) return byAmount;

    this.logger.debug(
      `Contact ${contactId}: ${orders.length} open orders, ${byAmount.length} match amount ${ctx.amount} (need exactly 1 for auto-match by name)`,
    );
    return [];
  }

  async createPaymentFromTransaction(bankTransactionId: string, orderId: string): Promise<void> {
    const created = await this.prisma.$transaction(async (tx) => {
      await lockBankTransactionForUpdate(tx, bankTransactionId);

      const bankTx = await tx.bankTransaction.findUnique({
        where: { id: bankTransactionId },
        include: { payments: true },
      });
      if (!bankTx) return false;

      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) return false;

      const txAmount = Number(bankTx.amount);
      const amount = txAmount;
      const allocated = sumBankTransactionAllocations(bankTx.payments);
      if (allocationExceedsTransaction(allocated, amount, txAmount)) return false;

      await tx.payment.create({
        data: {
          orderId,
          sourceType: "BANK",
          amount,
          currency: bankTx.currency,
          paidAt: bankTx.bookedAt,
          status: "COMPLETED",
          bankTransactionId: bankTx.id,
        },
      });
      return true;
    });

    if (created) {
      await this.paymentsService.recalcOrder(orderId);
    }
  }
}
