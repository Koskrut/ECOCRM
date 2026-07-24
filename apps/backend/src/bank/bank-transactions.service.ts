import { ForbiddenException, Injectable } from "@nestjs/common";
import { Prisma, UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { buildBankTransactionSearchWhere } from "../payments/payment-search.util";
import {
  BANK_ALLOCATION_EPSILON,
  remainingBankTransactionAmount,
  sumBankTransactionAllocations,
} from "./bank-allocation.util";
import { BankAccountsService } from "./bank-accounts.service";
import { MatchSuggestionService } from "./match-suggestion.service";
import { PaymentMatchingService, type MatchSuggestion } from "./payment-matching.service";

type ListParams = {
  unmatched?: boolean;
  bankAccountId?: string;
  q?: string;
  suggest?: boolean;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
  offset: number;
  limit: number;
};

@Injectable()
export class BankTransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bankAccounts: BankAccountsService,
    private readonly matching: PaymentMatchingService,
    private readonly matchSuggestions: MatchSuggestionService,
  ) {}

  async list(params: ListParams, actor?: AuthUser) {
    let where: Prisma.BankTransactionWhereInput = {};
    if (actor && actor.role !== UserRole.ADMIN) {
      const visibleIds = await this.bankAccounts.getVisibleBankAccountIds(actor.id);
      if (params.bankAccountId) {
        if (!visibleIds.includes(params.bankAccountId)) {
          throw new ForbiddenException("You do not have access to this bank account");
        }
        where.bankAccountId = params.bankAccountId;
      } else {
        where.bankAccountId = visibleIds.length > 0 ? { in: visibleIds } : { in: [] };
      }
    } else if (params.bankAccountId) {
      where.bankAccountId = params.bankAccountId;
    }
    if (params.from || params.to) {
      const bookedAt: Prisma.DateTimeFilter = {};
      if (params.from) {
        const from = new Date(params.from);
        if (!Number.isNaN(from.getTime())) bookedAt.gte = from;
      }
      if (params.to) {
        const to = new Date(params.to);
        if (!Number.isNaN(to.getTime())) {
          const hasTime = params.to.includes("T");
          if (!hasTime) to.setHours(23, 59, 59, 999);
          bookedAt.lte = to;
        }
      }
      if (bookedAt.gte || bookedAt.lte) where.bookedAt = bookedAt;
    }

    const searchQ = params.q?.trim();
    if (searchQ) {
      const searchWhere = buildBankTransactionSearchWhere(searchQ);
      where =
        Object.keys(where).length === 0 ? searchWhere : { AND: [where, searchWhere] };
    }

    if (params.unmatched) {
      return this.listNeedsAllocation(where, params);
    }

    const [items, total] = await Promise.all([
      this.prisma.bankTransaction.findMany({
        where,
        orderBy: { bookedAt: "desc" },
        skip: params.offset,
        take: params.limit,
        include: {
          bankAccount: { select: { id: true, name: true, currency: true } },
          payments: { select: { id: true, orderId: true, amount: true, status: true } },
        },
      }),
      this.prisma.bankTransaction.count({ where }),
    ]);

    return {
      items: await this.mapItems(items, params.suggest === true),
      total,
      page: params.page,
      pageSize: params.pageSize,
    };
  }

  /**
   * Needs allocation: no payments OR sum(COMPLETED payments) < amount (residual).
   * Residual set comes from SQL (no scan cap); then intersected with visibility/search filters.
   */
  private async listNeedsAllocation(
    baseWhere: Prisma.BankTransactionWhereInput,
    params: ListParams,
  ) {
    const residualRows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT bt.id
      FROM "BankTransaction" bt
      LEFT JOIN "Payment" p
        ON p."bankTransactionId" = bt.id AND p.status = 'COMPLETED'
      GROUP BY bt.id, bt.amount
      HAVING COALESCE(SUM(p.amount), 0) < bt.amount - ${BANK_ALLOCATION_EPSILON}
    `;
    const residualIds = residualRows.map((r) => r.id);
    if (residualIds.length === 0) {
      return {
        items: [],
        total: 0,
        page: params.page,
        pageSize: params.pageSize,
      };
    }

    const where: Prisma.BankTransactionWhereInput = {
      AND: [baseWhere, { id: { in: residualIds } }],
    };

    const [items, total] = await Promise.all([
      this.prisma.bankTransaction.findMany({
        where,
        orderBy: { bookedAt: "desc" },
        skip: params.offset,
        take: params.limit,
        include: {
          bankAccount: { select: { id: true, name: true, currency: true } },
          payments: { select: { id: true, orderId: true, amount: true, status: true } },
        },
      }),
      this.prisma.bankTransaction.count({ where }),
    ]);

    return {
      items: await this.mapItems(items, params.suggest === true),
      total,
      page: params.page,
      pageSize: params.pageSize,
    };
  }

  private async mapItems(
    items: Array<{
      id: string;
      bankAccountId: string;
      bankAccount: { id: string; name: string; currency: string };
      externalId: string | null;
      bookedAt: Date;
      amount: { toString(): string } | number;
      currency: string;
      direction: string;
      description: string | null;
      counterpartyName: string | null;
      counterpartyIban: string | null;
      matchStatus: string;
      matchScore: number | null;
      suggestedOrderId: string | null;
      payments: Array<{
        id: string;
        orderId: string;
        amount: { toString(): string } | number;
        status?: string;
      }>;
    }>,
    suggest: boolean,
  ) {
    const rich = suggest
      ? await Promise.all(
          items.map(async (t) => {
            const remaining = remainingBankTransactionAmount(Number(t.amount), t.payments);
            if (remaining <= BANK_ALLOCATION_EPSILON) return null;
            return this.matchSuggestions.getSuggestions(t);
          }),
        )
      : null;

    // Legacy single suggestion for backward-compatible UI.
    const legacy = suggest
      ? await Promise.all(
          items.map(async (t, i) => {
            if ((t.payments ?? []).length > 0) return null;
            const top = rich?.[i]?.suggestions[0];
            if (top?.ordersWithDebt[0]) {
              const o = top.ordersWithDebt[0];
              return {
                orderId: o.orderId,
                orderNumber: o.orderNumber,
                contactLabel: top.label,
                debtAmount: o.debtAmount,
                currency: o.currency,
                expectedAmountUah: o.suggestedAmount,
                score: top.score,
              } satisfies MatchSuggestion;
            }
            return this.matching.getSuggestion({
              id: t.id,
              description: t.description,
              amount: t.amount,
              currency: t.currency,
              bookedAt: t.bookedAt,
              counterpartyName: t.counterpartyName,
            });
          }),
        )
      : null;

    return items.map((t, i) => {
      const allocatedAmount = sumBankTransactionAllocations(t.payments);
      const remainingAmount = remainingBankTransactionAmount(Number(t.amount), t.payments);
      const matchBundle = rich ? rich[i] : null;
      return {
        id: t.id,
        bankAccountId: t.bankAccountId,
        bankAccount: t.bankAccount,
        externalId: t.externalId,
        bookedAt: t.bookedAt,
        amount: Number(t.amount),
        currency: t.currency,
        direction: t.direction,
        description: t.description,
        counterpartyName: t.counterpartyName,
        counterpartyIban: t.counterpartyIban,
        paymentId: t.payments?.[0]?.id ?? null,
        orderId: t.payments?.length === 1 ? t.payments[0]!.orderId : null,
        matchStatus: t.matchStatus,
        matchScore: t.matchScore,
        suggestedOrderId: t.suggestedOrderId,
        allocatedAmount,
        remainingAmount,
        suggestion: legacy ? (legacy[i] as MatchSuggestion | null) : undefined,
        suggestions: matchBundle?.suggestions,
        parsedOrders: matchBundle?.parsedOrders,
        autoMatchEligible: matchBundle?.autoMatchEligible,
        autoMatchPlan: matchBundle?.autoMatchPlan,
      };
    });
  }

  async getMatchSuggestions(transactionId: string, actor?: AuthUser) {
    const tx = await this.prisma.bankTransaction.findUnique({
      where: { id: transactionId },
      include: { payments: true },
    });
    if (!tx) {
      const { NotFoundException } = await import("@nestjs/common");
      throw new NotFoundException("Transaction not found");
    }
    await this.ensureVisible(tx.bankAccountId, actor);
    return this.matchSuggestions.getSuggestions(tx);
  }

  async applyAutoMatch(transactionId: string, actor?: AuthUser) {
    const tx = await this.prisma.bankTransaction.findUnique({
      where: { id: transactionId },
      select: { bankAccountId: true },
    });
    if (!tx) {
      const { NotFoundException } = await import("@nestjs/common");
      throw new NotFoundException("Transaction not found");
    }
    await this.ensureVisible(tx.bankAccountId, actor);
    return this.matching.applyAutoMatchPlan(transactionId, actor?.id ?? null);
  }

  private async ensureVisible(bankAccountId: string, actor?: AuthUser) {
    if (!actor || actor.role === UserRole.ADMIN) return;
    const visibleIds = await this.bankAccounts.getVisibleBankAccountIds(actor.id);
    if (!visibleIds.includes(bankAccountId)) {
      throw new ForbiddenException("You do not have access to this bank account");
    }
  }
}
