import { Injectable, Logger } from "@nestjs/common";
import { BankTransactionMatchStatus, PaymentMatchDecision } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PaymentsService } from "../payments/payments.service";
import {
  allocationExceedsTransaction,
  BANK_ALLOCATION_EPSILON,
  lockBankTransactionForUpdate,
  sumBankTransactionAllocations,
  withBankMatchAdvisoryLock,
} from "./bank-allocation.util";
import {
  amountsMatchWithinTolerance,
  contactMatchesPerson,
  expectedPaymentAmountInCurrency,
  extractDocumentRefsFromDescription,
  extractOrderCandidatesFromDescription,
  extractOrderNumberFromDescription,
  extractPersonNameFromDescription,
  firstNameVariants,
  normalizePersonNameToken,
  personNameQueryVariants,
} from "./match-engine.utils";
import {
  documentConflictsWithOrderNumber,
  resolveUniqueDocumentOrder,
} from "./document-match.utils";
import { MatchSuggestionService } from "./match-suggestion.service";
import { PayerAliasService } from "./payer-alias.service";

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
  invoiceNumber?: string | null;
  waybillNumber?: string | null;
  documentMatchType?: "invoice" | "waybill" | null;
};

const AUTO_MATCH_THRESHOLD = 90;
const REVIEW_THRESHOLD = 70;

const ORDER_SELECT = {
  id: true,
  orderNumber: true,
  invoiceNumber: true,
  waybillNumber: true,
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
  invoiceNumber?: string | null;
  waybillNumber?: string | null;
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

function envFlag(name: string, defaultValue: boolean): boolean {
  const v = process.env[name];
  if (v == null || v === "") return defaultValue;
  return v === "true" || v === "1";
}

@Injectable()
export class PaymentMatchingService {
  private readonly logger = new Logger(PaymentMatchingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentsService: PaymentsService,
    private readonly suggestions: MatchSuggestionService,
    private readonly payerAliases: PayerAliasService,
  ) {}

  async run(): Promise<{ matched: number; needsReview: number; multiMatched: number }> {
    return withBankMatchAdvisoryLock(this.prisma, () => this.runMatching());
  }

  private async runMatching(): Promise<{
    matched: number;
    needsReview: number;
    multiMatched: number;
  }> {
    const unmatched = await this.prisma.bankTransaction.findMany({
      where: {
        direction: "IN",
        payments: { none: {} },
        matchStatus: {
          in: [BankTransactionMatchStatus.UNMATCHED, BankTransactionMatchStatus.NEEDS_REVIEW],
        },
      },
      include: { bankAccount: true, payments: true },
    });

    let matched = 0;
    let needsReview = 0;
    let multiMatched = 0;
    const multiAuto = envFlag("BANK_MATCH_MULTI_ORDER_AUTO", true);

    for (const tx of unmatched) {
      if (multiAuto) {
        const didMulti = await this.tryMultiOrderAutoMatch(tx);
        if (didMulti) {
          multiMatched++;
          matched++;
          continue;
        }
      }

      // If purpose lists ≥2 order numbers that exist in DB, never silent-single-auto
      // the full TX onto one order (would skip the required split / review).
      const multiResolved = await this.countResolvedPurposeOrders(tx.description);
      if (multiResolved >= 2) {
        await this.prisma.bankTransaction.update({
          where: { id: tx.id },
          data: {
            matchStatus: BankTransactionMatchStatus.NEEDS_REVIEW,
            matchScore: null,
            suggestedOrderId: null,
          },
        });
        this.logger.debug(
          `Tx ${tx.id}: ${multiResolved} purpose orders resolved — skip single auto, needs review`,
        );
        needsReview++;
        continue;
      }

      const didDoc = await this.tryDocumentAutoMatch(tx);
      if (didDoc.matched) {
        matched++;
        continue;
      }
      if (didDoc.needsReview) {
        needsReview++;
        continue;
      }

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

    return { matched, needsReview, multiMatched };
  }

  private async countResolvedPurposeOrders(description: string | null): Promise<number> {
    const candidates = extractOrderCandidatesFromDescription(description);
    if (candidates.length < 2) return candidates.length;
    const numbers = [...new Set(candidates.map((c) => c.orderNumber))];
    if (numbers.length < 2) return numbers.length;
    const found = await this.prisma.order.count({
      where: { orderNumber: { in: numbers } },
    });
    return found;
  }

  /**
   * Auto-match by unique 1C invoice or waybill when orderNumber is absent or unresolved.
   * Priority: explicit orderNumber (handled elsewhere) > invoice > waybill > unlabeled.
   */
  private async tryDocumentAutoMatch(tx: {
    id: string;
    description: string | null;
    counterpartyName: string | null;
    counterpartyIban?: string | null;
  }): Promise<{ matched: boolean; needsReview: boolean }> {
    const orderNum = extractOrderNumberFromDescription(tx.description);
    let orderNumberOrderId: string | null = null;
    if (orderNum) {
      const byNum = await this.prisma.order.findFirst({
        where: { orderNumber: orderNum },
        select: { id: true },
      });
      orderNumberOrderId = byNum?.id ?? null;
      if (orderNumberOrderId) {
        return { matched: false, needsReview: false };
      }
    }

    const refs = extractDocumentRefsFromDescription(tx.description);
    if (
      refs.invoices.length === 0 &&
      refs.waybills.length === 0 &&
      refs.unlabeled.length === 0
    ) {
      return { matched: false, needsReview: false };
    }

    const doc = await resolveUniqueDocumentOrder(this.prisma, refs);
    if (doc.ambiguous) {
      await this.prisma.bankTransaction.update({
        where: { id: tx.id },
        data: {
          matchStatus: BankTransactionMatchStatus.NEEDS_REVIEW,
          matchScore: null,
          suggestedOrderId: null,
        },
      });
      return { matched: false, needsReview: true };
    }

    if (
      !doc.orderId ||
      documentConflictsWithOrderNumber(orderNumberOrderId, doc.orderId)
    ) {
      if (doc.orderId && documentConflictsWithOrderNumber(orderNumberOrderId, doc.orderId)) {
        await this.prisma.bankTransaction.update({
          where: { id: tx.id },
          data: {
            matchStatus: BankTransactionMatchStatus.NEEDS_REVIEW,
            matchScore: null,
            suggestedOrderId: doc.orderId,
          },
        });
        return { matched: false, needsReview: true };
      }
      return { matched: false, needsReview: false };
    }

    const matchReason = doc.matchType === "invoice" ? "invoice-number" : "waybill-number";
    await this.createPaymentFromTransaction(tx.id, doc.orderId, matchReason);
    await this.prisma.bankTransaction.update({
      where: { id: tx.id },
      data: {
        matchStatus: BankTransactionMatchStatus.AUTO_MATCHED,
        matchScore: 88,
        suggestedOrderId: doc.orderId,
      },
    });
    this.logger.log(
      `Auto-matched tx ${tx.id} → order ${doc.orderId} (${matchReason}, ref=${doc.matchedRef})`,
    );
    return { matched: true, needsReview: false };
  }

  private async tryMultiOrderAutoMatch(tx: {
    id: string;
    description: string | null;
    amount: { toString(): string } | number;
    currency: string;
    bookedAt: Date;
    counterpartyName: string | null;
    counterpartyIban: string | null;
    payments: Array<{ amount: { toString(): string } | number; status?: string }>;
  }): Promise<boolean> {
    const result = await this.suggestions.getSuggestions(tx);
    if (!result.autoMatchEligible || !result.autoMatchPlan) return false;

    const plan = result.autoMatchPlan;
    try {
      const paymentIds = await this.paymentsService.allocateSplitInternal({
        transactionId: tx.id,
        allocations: plan.allocations.map((a) => ({
          orderId: a.orderId,
          amount: a.amount,
        })),
        actorUserId: null,
        matchMeta: {
          decision: PaymentMatchDecision.AUTO,
          matchReason: plan.reason,
          reasons: {
            parsedOrders: result.parsedOrders,
            allocations: plan.allocations,
            actor: "system",
          },
          score: 95,
        },
      });

      await this.prisma.bankTransaction.update({
        where: { id: tx.id },
        data: {
          matchStatus: BankTransactionMatchStatus.AUTO_MATCHED,
          matchScore: 95,
          suggestedOrderId: plan.allocations[0]?.orderId ?? null,
        },
      });

      // Learn alias from first order's client (no silent name-only auto; multi-order is purpose-based)
      const firstOrder = await this.prisma.order.findUnique({
        where: { id: plan.allocations[0]!.orderId },
        select: { contactId: true, clientId: true, companyId: true },
      });
      if (firstOrder) {
        await this.payerAliases.learnFromAllocation({
          contactId: firstOrder.contactId ?? firstOrder.clientId,
          companyId: firstOrder.companyId,
          counterpartyIban: tx.counterpartyIban,
          counterpartyName: tx.counterpartyName,
        });
      }

      this.logger.log(
        `Multi-order auto-matched tx ${tx.id} → ${plan.allocations.length} orders (${plan.reason}); payments=${paymentIds.length}`,
      );
      return true;
    } catch (e) {
      this.logger.warn(
        `Multi-order auto-match failed for tx ${tx.id}: ${e instanceof Error ? e.message : e}`,
      );
      return false;
    }
  }

  async applyAutoMatchPlan(transactionId: string, actorUserId?: string | null): Promise<{
    ok: true;
    paymentIds: string[];
    reason: string;
  }> {
    const tx = await this.prisma.bankTransaction.findUnique({
      where: { id: transactionId },
      include: { payments: true },
    });
    if (!tx) {
      const { NotFoundException } = await import("@nestjs/common");
      throw new NotFoundException("Transaction not found");
    }
    const result = await this.suggestions.getSuggestions(tx);
    if (!result.autoMatchEligible || !result.autoMatchPlan) {
      const { ConflictException } = await import("@nestjs/common");
      throw new ConflictException({
        message: "Transaction is not eligible for auto-match",
        reasons: result.suggestions[0]?.warnings ?? ["not_eligible"],
        parsedOrders: result.parsedOrders,
      });
    }
    const plan = result.autoMatchPlan;
    const paymentIds = await this.paymentsService.allocateSplitInternal({
      transactionId: tx.id,
      allocations: plan.allocations.map((a) => ({
        orderId: a.orderId,
        amount: a.amount,
      })),
      actorUserId: actorUserId ?? null,
      matchMeta: {
        decision: actorUserId ? PaymentMatchDecision.SUGGESTED : PaymentMatchDecision.AUTO,
        matchReason: plan.reason,
        reasons: {
          parsedOrders: result.parsedOrders,
          allocations: plan.allocations,
        },
        score: result.suggestions[0]?.score ?? 90,
      },
    });
    await this.prisma.bankTransaction.update({
      where: { id: tx.id },
      data: {
        matchStatus: BankTransactionMatchStatus.AUTO_MATCHED,
        matchScore: result.suggestions[0]?.score ?? 90,
        suggestedOrderId: plan.allocations[0]?.orderId ?? null,
      },
    });
    return { ok: true, paymentIds, reason: plan.reason };
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
    const docResolved = await resolveUniqueDocumentOrder(
      this.prisma,
      extractDocumentRefsFromDescription(tx.description),
    );

    const orderMap = new Map<string, OrderForMatch>();

    if (orderNumber) {
      const byNumber = await this.prisma.order.findMany({
        where: { orderNumber },
        select: ORDER_SELECT,
      });
      for (const o of byNumber) orderMap.set(o.id, o);
    } else if (docResolved.orderId && !docResolved.ambiguous) {
      const byDoc = await this.prisma.order.findMany({
        where: { id: docResolved.orderId },
        select: ORDER_SELECT,
      });
      for (const o of byDoc) orderMap.set(o.id, o);
    } else {
      // FX-aware amount discovery when no order/doc hint.
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
        documentMatch:
          docResolved.orderId === order.id && !docResolved.ambiguous
            ? docResolved.matchType
            : null,
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
      invoiceNumber: order.invoiceNumber ?? null,
      waybillNumber: order.waybillNumber ?? null,
      documentMatchType:
        best.matchReason?.includes("invoiceNumber")
          ? "invoice"
          : best.matchReason?.includes("waybillNumber")
            ? "waybill"
            : null,
    };
  }

  private scoreOrder(
    order: OrderForMatch,
    ctx: {
      amount: number;
      txCurrency: string;
      orderNumber: string | null;
      documentMatch: "invoice" | "waybill" | null;
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

    if (ctx.documentMatch === "invoice") {
      score += 75;
      reasons.push("invoiceNumber");
    } else if (ctx.documentMatch === "waybill") {
      score += 70;
      reasons.push("waybillNumber");
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
    if (expected != null && amountsMatchWithinTolerance(expected, ctx.amount)) {
      score += 30;
      reasons.push("amount");
    } else if (debt > 0 && Math.abs(debt - ctx.amount) < BANK_ALLOCATION_EPSILON) {
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
   * Never used alone for silent auto without amount/order confirmation (score still needs ≥90).
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

    const lastVariants = personNameQueryVariants(person.lastName);
    const firstVariants = firstNameVariants(person.firstName);
    let contacts = await this.prisma.contact.findMany({
      where: {
        OR: lastVariants.flatMap((ln) =>
          firstVariants.map((fn) => ({
            lastName: { equals: ln, mode: "insensitive" as const },
            firstName: { equals: fn, mode: "insensitive" as const },
          })),
        ),
      },
      select: { id: true, firstName: true, lastName: true, middleName: true },
      take: 40,
    });
    contacts = contacts.filter(
      (c) =>
        c.firstName == null ||
        c.lastName == null ||
        contactMatchesPerson(c, person),
    );

    if (contacts.length > 1 && person.middleName) {
      const mid = normalizePersonNameToken(person.middleName);
      const narrowed = contacts.filter(
        (c) => c.middleName && normalizePersonNameToken(c.middleName) === mid,
      );
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

  async createPaymentFromTransaction(
    bankTransactionId: string,
    orderId: string,
    matchReason = "order-number",
  ): Promise<void> {
    const created = await this.prisma.$transaction(async (tx) => {
      await lockBankTransactionForUpdate(tx, bankTransactionId);

      const bankTx = await tx.bankTransaction.findUnique({
        where: { id: bankTransactionId },
        include: { payments: true },
      });
      if (!bankTx) return false;

      if (bankTx.externalId) {
        const siblingWithPayments = await tx.bankTransaction.findFirst({
          where: {
            bankAccountId: bankTx.bankAccountId,
            externalId: bankTx.externalId,
            id: { not: bankTx.id },
            payments: { some: { status: "COMPLETED" } },
          },
        });
        if (siblingWithPayments) return false;
      }

      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) return false;

      const txAmount = Number(bankTx.amount);
      const allocated = sumBankTransactionAllocations(bankTx.payments);
      const remaining = txAmount - allocated;
      if (remaining <= BANK_ALLOCATION_EPSILON) return false;
      const amount = remaining;
      if (allocationExceedsTransaction(allocated, amount, txAmount)) return false;

      const payment = await tx.payment.create({
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
      return { paymentId: payment.id, order };
    });

    if (created) {
      await this.paymentsService.recalcOrder(orderId);
      await this.paymentsService.syncBankTransactionMatchStatus(bankTransactionId);
      await this.payerAliases.writeAudit({
        bankTransactionId,
        paymentIds: [created.paymentId],
        decision: PaymentMatchDecision.AUTO,
        matchReason,
        score: matchReason === "order-number" ? 90 : 88,
        reasons: { orderId, actor: "system" },
      });
      await this.payerAliases.learnFromAllocation({
        contactId: created.order.contactId ?? created.order.clientId,
        companyId: created.order.companyId,
        counterpartyIban: (
          await this.prisma.bankTransaction.findUnique({
            where: { id: bankTransactionId },
            select: { counterpartyIban: true, counterpartyName: true },
          })
        )?.counterpartyIban,
        counterpartyName: (
          await this.prisma.bankTransaction.findUnique({
            where: { id: bankTransactionId },
            select: { counterpartyName: true },
          })
        )?.counterpartyName,
      });
    }
  }
}
