import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

type ListParams = {
  unmatched?: boolean;
  bankAccountId?: string;
  page: number;
  pageSize: number;
  offset: number;
  limit: number;
};

@Injectable()
export class BankTransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: ListParams) {
    const where: { bankAccountId?: string; payments?: { none: {} } | undefined } = {};
    if (params.bankAccountId) where.bankAccountId = params.bankAccountId;
    if (params.unmatched) where.payments = { none: {} };

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
