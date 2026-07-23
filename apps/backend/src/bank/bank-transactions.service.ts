import { ForbiddenException, Injectable } from "@nestjs/common";
import { Prisma, UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { buildBankTransactionSearchWhere } from "../payments/payment-search.util";
import { BankAccountsService } from "./bank-accounts.service";
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
    if (params.unmatched) where.payments = { none: {} };
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

    const [items, total] = await Promise.all([
      this.prisma.bankTransaction.findMany({
        where,
        orderBy: { bookedAt: "desc" },
        skip: params.offset,
        take: params.limit,
        include: {
          bankAccount: { select: { id: true, name: true, currency: true } },
          payments: { select: { id: true, orderId: true } },
        },
      }),
      this.prisma.bankTransaction.count({ where }),
    ]);

    const suggestions = params.suggest
      ? await Promise.all(
          items.map(async (t) => {
            if ((t.payments ?? []).length > 0) return null;
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

    return {
      items: items.map((t, i) => ({
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
        suggestion: suggestions ? (suggestions[i] as MatchSuggestion | null) : undefined,
      })),
      total,
      page: params.page,
      pageSize: params.pageSize,
    };
  }
}
