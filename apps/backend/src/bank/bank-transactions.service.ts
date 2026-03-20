import { ForbiddenException, Injectable } from "@nestjs/common";
import { Prisma, UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { BankAccountsService } from "./bank-accounts.service";

type ListParams = {
  unmatched?: boolean;
  bankAccountId?: string;
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
  ) {}

  async list(params: ListParams, actor?: AuthUser) {
    const where: Prisma.BankTransactionWhereInput = {};
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
    const bookedAt: Prisma.DateTimeFilter = {};
    if (params.from) bookedAt.gte = new Date(params.from);
    if (params.to) bookedAt.lte = new Date(params.to);
    if (params.from || params.to) where.bookedAt = bookedAt;

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

    return {
      items: items.map((t) => ({
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
      })),
      total,
      page: params.page,
      pageSize: params.pageSize,
    };
  }
}
