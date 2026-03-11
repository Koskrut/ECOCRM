import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PaymentSourceType, PaymentStatus, UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import type { AllocatePaymentDto } from "./dto/allocate-payment.dto";
import type { AllocateSplitDto } from "./dto/allocate-split.dto";
import type { CreateCashPaymentDto } from "./dto/create-cash-payment.dto";
import type { UpdatePaymentDto } from "./dto/update-payment.dto";
import type { SplitPaymentDto } from "./dto/split-payment.dto";
import type { ExchangeRates } from "../settings/settings.service";
import { SettingsService } from "../settings/settings.service";

function getRateToUsd(currency: string, rates: ExchangeRates): number {
  const c = (currency || "USD").toUpperCase();
  if (c === "USD") return 1;
  if (c === "UAH") return rates.UAH_TO_USD;
  if (c === "EUR") return rates.EUR_TO_USD;
  return 1;
}

function convertToUsd(amount: number, currency: string, rates: ExchangeRates): number {
  return amount * getRateToUsd(currency, rates);
}

type ListPaymentsParams = {
  bankAccountId?: string;
  page: number;
  pageSize: number;
  offset: number;
  limit: number;
};

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async list(params: ListPaymentsParams) {
    let rates: ExchangeRates;
    try {
      rates = await this.settings.getExchangeRates();
    } catch (e) {
      this.logger.warn(`getExchangeRates failed, using defaults: ${e}`);
      rates = { UAH_TO_USD: 0.024, EUR_TO_USD: 1.05 };
    }
    const where: { bankTransaction?: { bankAccountId?: string } } = {};
    if (params.bankAccountId) {
      where.bankTransaction = { bankAccountId: params.bankAccountId };
    }

    try {
      const [items, total] = await Promise.all([
        this.prisma.payment.findMany({
          where,
          orderBy: { paidAt: "desc" },
          skip: params.offset,
          take: params.limit,
          include: {
            order: { select: { id: true, orderNumber: true } },
            bankTransaction: {
              select: {
                id: true,
                bankAccountId: true,
                bookedAt: true,
                description: true,
                counterpartyName: true,
                bankAccount: { select: { id: true, name: true, currency: true } },
              },
            },
            createdBy: { select: { id: true, fullName: true } },
          },
        }),
        this.prisma.payment.count({ where }),
      ]);

      const txIds = [...new Set(items.map((p) => p.bankTransactionId).filter(Boolean))] as string[];
    const ordersByTx =
      txIds.length > 0
        ? await this.prisma.payment.findMany({
            where: { bankTransactionId: { in: txIds } },
            select: {
              bankTransactionId: true,
              orderId: true,
              order: { select: { orderNumber: true } },
            },
          })
        : [];
    const txOrderNumbers = new Map<string, string[]>();
    for (const row of ordersByTx) {
      if (!row.bankTransactionId) continue;
      const list = txOrderNumbers.get(row.bankTransactionId) ?? [];
      const num = row.order?.orderNumber ?? row.orderId;
      if (!list.includes(num)) list.push(num);
      txOrderNumbers.set(row.bankTransactionId, list);
    }

    return {
      items: items.map((p) => {
        const amount = Number(p.amount);
        const currency = p.currency || "USD";
        const amountUsd =
          p.amountUsd != null ? Number(p.amountUsd) : convertToUsd(amount, currency, rates);
        const sameTransactionOrderNumbers = p.bankTransactionId
          ? txOrderNumbers.get(p.bankTransactionId) ?? []
          : null;
        return {
          id: p.id,
          orderId: p.orderId,
          orderNumber: p.order?.orderNumber ?? null,
          sameTransactionOrderNumbers,
          sourceType: p.sourceType,
          amount,
          currency,
          amountUsd,
          paidAt: p.paidAt,
          status: p.status,
          note: p.note,
          bankTransaction: p.bankTransaction
            ? {
              id: p.bankTransaction.id,
              bankAccountId: p.bankTransaction.bankAccountId,
              bankAccount: p.bankTransaction.bankAccount,
              bookedAt: p.bankTransaction.bookedAt,
              description: p.bankTransaction.description,
              counterpartyName: p.bankTransaction.counterpartyName,
            }
            : null,
          createdBy: p.createdBy,
        };
      }),
      total,
      page: params.page,
      pageSize: params.pageSize,
    };
    } catch (e) {
      this.logger.error(`payments.list failed: ${e}`);
      return {
        items: [],
        total: 0,
        page: params.page,
        pageSize: params.pageSize,
      };
    }
  }

  async listByOrderId(orderId: string, actor?: AuthUser) {
    const [order, rates] = await Promise.all([
      this.prisma.order.findUnique({
        where: { id: orderId },
        select: { id: true, ownerId: true },
      }),
      this.settings.getExchangeRates(),
    ]);
    if (!order) throw new NotFoundException("Order not found");
    if (actor?.role === UserRole.MANAGER && order.ownerId !== actor.id) {
      throw new ForbiddenException("You can only access orders assigned to you");
    }
    const payments = await this.prisma.payment.findMany({
      where: { orderId },
      orderBy: { paidAt: "desc" },
      include: {
        bankTransaction: {
          select: { id: true, bookedAt: true, description: true, counterpartyName: true },
        },
        createdBy: { select: { id: true, fullName: true } },
      },
    });
    const txIds = [...new Set(payments.map((p) => p.bankTransactionId).filter(Boolean))] as string[];
    const ordersByTx =
      txIds.length > 0
        ? await this.prisma.payment.findMany({
            where: { bankTransactionId: { in: txIds } },
            select: {
              bankTransactionId: true,
              orderId: true,
              order: { select: { orderNumber: true } },
            },
          })
        : [];
    const txOrderNumbers = new Map<string, string[]>();
    for (const row of ordersByTx) {
      if (!row.bankTransactionId) continue;
      const list = txOrderNumbers.get(row.bankTransactionId) ?? [];
      const num = row.order?.orderNumber ?? row.orderId;
      if (!list.includes(num)) list.push(num);
      txOrderNumbers.set(row.bankTransactionId, list);
    }
    return payments.map((p) => {
      const amount = Number(p.amount);
      const currency = p.currency || "USD";
      const amountUsd =
        p.amountUsd != null ? Number(p.amountUsd) : convertToUsd(amount, currency, rates);
      const sameTransactionOrderNumbers = p.bankTransactionId
        ? txOrderNumbers.get(p.bankTransactionId) ?? []
        : null;
      return {
        id: p.id,
        orderId: p.orderId,
        sourceType: p.sourceType,
        amount,
        currency,
        amountUsd,
        sameTransactionOrderNumbers,
        paidAt: p.paidAt,
        status: p.status,
        note: p.note,
        bankTransaction: p.bankTransaction,
        createdBy: p.createdBy,
      };
    });
  }

  async allocate(dto: AllocatePaymentDto, actor?: AuthUser) {
    if (actor?.role !== UserRole.ADMIN) {
      throw new ForbiddenException("Only ADMIN can allocate bank transactions");
    }
    const tx = await this.prisma.bankTransaction.findUnique({
      where: { id: dto.transactionId },
      include: { payments: true },
    });
    if (!tx) throw new NotFoundException("Transaction not found");
    if ((tx.payments ?? []).length > 0) {
      throw new BadRequestException("Transaction already allocated (use split or edit)");
    }

    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
    });
    if (!order) throw new NotFoundException("Order not found");

    const amount = dto.amount != null ? dto.amount : Number(tx.amount);
    if (amount <= 0) throw new BadRequestException("Amount must be positive");

    const rates = await this.settings.getExchangeRates();
    const amountUsd = convertToUsd(amount, tx.currency, rates);

    await this.prisma.payment.create({
      data: {
        orderId: dto.orderId,
        sourceType: PaymentSourceType.BANK,
        amount,
        currency: tx.currency,
        amountUsd,
        paidAt: tx.bookedAt,
        status: PaymentStatus.COMPLETED,
        bankTransactionId: tx.id,
        createdByUserId: actor?.id ?? null,
      },
    });

    await this.recalcOrder(dto.orderId);
    return this.listByOrderId(dto.orderId, actor);
  }

  async allocateSplit(dto: AllocateSplitDto, actor?: AuthUser) {
    if (actor?.role !== UserRole.ADMIN) {
      throw new ForbiddenException("Only ADMIN can allocate bank transactions");
    }
    if (!dto.allocations?.length) {
      throw new BadRequestException("At least one allocation required");
    }
    const tx = await this.prisma.bankTransaction.findUnique({
      where: { id: dto.transactionId },
      include: { payments: true },
    });
    if (!tx) throw new NotFoundException("Transaction not found");
    const allocatedTotal = (tx.payments ?? []).reduce((s, p) => s + Number(p.amount), 0);
    if (allocatedTotal > 0) {
      throw new BadRequestException("Transaction already has allocations");
    }
    const txAmount = Number(tx.amount);
    const totalAlloc = dto.allocations.reduce((s, a) => s + Number(a.amount), 0);
    if (Math.abs(totalAlloc - txAmount) > 0.01) {
      throw new BadRequestException(
        `Total allocated ${totalAlloc} must equal transaction amount ${txAmount}`,
      );
    }
    for (const a of dto.allocations) {
      const amount = Number(a.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new BadRequestException("Each allocation amount must be positive");
      }
      const order = await this.prisma.order.findUnique({ where: { id: a.orderId } });
      if (!order) throw new NotFoundException(`Order not found: ${a.orderId}`);
    }
    const rates = await this.settings.getExchangeRates();
    for (const a of dto.allocations) {
      const amt = Number(a.amount);
      const amountUsd = convertToUsd(amt, tx.currency, rates);
      await this.prisma.payment.create({
        data: {
          orderId: a.orderId,
          sourceType: PaymentSourceType.BANK,
          amount: amt,
          currency: tx.currency,
          amountUsd,
          paidAt: tx.bookedAt,
          status: PaymentStatus.COMPLETED,
          bankTransactionId: tx.id,
          createdByUserId: actor?.id ?? null,
        },
      });
      await this.recalcOrder(a.orderId);
    }
    return this.list({ page: 1, pageSize: 50, offset: 0, limit: 50 });
  }

  async createCash(dto: CreateCashPaymentDto, actor?: AuthUser) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      select: { id: true, ownerId: true, currency: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (actor?.role === UserRole.MANAGER && order.ownerId !== actor.id) {
      throw new ForbiddenException("You can only add payments to orders assigned to you");
    }
    const amount = Number(dto.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException("Amount must be a positive number");
    }
    const paidAt = new Date(dto.paidAt);
    if (Number.isNaN(paidAt.getTime())) {
      throw new BadRequestException("Invalid paidAt date");
    }

    const currency = (dto.currency && dto.currency.trim()) || order.currency;
    const rates = await this.settings.getExchangeRates();
    const amountUsd = convertToUsd(amount, currency, rates);
    await this.prisma.payment.create({
      data: {
        orderId: dto.orderId,
        contactId: dto.contactId ?? null,
        companyId: dto.companyId ?? null,
        sourceType: PaymentSourceType.CASH,
        amount,
        currency,
        amountUsd,
        paidAt,
        status: PaymentStatus.COMPLETED,
        createdByUserId: actor?.id ?? null,
        note: dto.note ?? null,
      },
    });

    await this.recalcOrder(dto.orderId);
    return this.listByOrderId(dto.orderId, actor);
  }

  async update(id: string, dto: UpdatePaymentDto, actor?: AuthUser) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: { order: { select: { id: true, ownerId: true } } },
    });
    if (!payment) throw new NotFoundException("Payment not found");
    if (actor?.role === UserRole.MANAGER && payment.order?.ownerId !== actor.id) {
      throw new ForbiddenException("You can only edit payments for orders assigned to you");
    }
    const data: {
      amount?: number;
      amountUsd?: number;
      paidAt?: Date;
      note?: string | null;
      orderId?: string;
    } = {};
    if (dto.note !== undefined) data.note = dto.note || null;
    if (dto.amountUsd !== undefined) {
      if (actor?.role !== UserRole.ADMIN) {
        throw new ForbiddenException("Only ADMIN can change fixed USD amount");
      }
      const amountUsd = Number(dto.amountUsd);
      if (!Number.isFinite(amountUsd) || amountUsd < 0)
        throw new BadRequestException("Amount USD must be a non-negative number");
      data.amountUsd = amountUsd;
    }
    if (payment.sourceType === PaymentSourceType.CASH) {
      if (dto.amount != null) {
        if (actor?.role !== UserRole.ADMIN) {
          throw new ForbiddenException("Only ADMIN can change payment amount");
        }
        const amount = Number(dto.amount);
        if (!Number.isFinite(amount) || amount <= 0)
          throw new BadRequestException("Amount must be a positive number");
        data.amount = amount;
      }
      if (dto.paidAt != null) {
        const paidAt = new Date(dto.paidAt);
        if (Number.isNaN(paidAt.getTime())) throw new BadRequestException("Invalid paidAt date");
        data.paidAt = paidAt;
      }
    }
    if (dto.orderId != null && dto.orderId !== payment.orderId) {
      const newOrder = await this.prisma.order.findUnique({
        where: { id: dto.orderId },
        select: { id: true, ownerId: true },
      });
      if (!newOrder) throw new NotFoundException("Order not found");
      if (actor?.role === UserRole.MANAGER && newOrder.ownerId !== actor.id) {
        throw new ForbiddenException("You can only assign payments to orders assigned to you");
      }
      data.orderId = dto.orderId;
    }
    if (Object.keys(data).length === 0) return this.listByOrderId(payment.orderId, actor);
    const oldOrderId = payment.orderId;
    const newOrderId = data.orderId ?? payment.orderId;
    await this.prisma.payment.update({
      where: { id },
      data,
    });
    await this.recalcOrder(oldOrderId);
    if (newOrderId !== oldOrderId) await this.recalcOrder(newOrderId);
    return this.listByOrderId(newOrderId, actor);
  }

  async splitPayment(id: string, dto: SplitPaymentDto, actor?: AuthUser) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: { order: { select: { id: true, ownerId: true } } },
    });
    if (!payment) throw new NotFoundException("Payment not found");
    if (payment.sourceType !== PaymentSourceType.BANK || !payment.bankTransactionId) {
      throw new BadRequestException("Only bank payments can be split");
    }
    if (actor?.role === UserRole.MANAGER && payment.order?.ownerId !== actor.id) {
      throw new ForbiddenException("You can only split payments for orders assigned to you");
    }
    if (!dto.allocations?.length) {
      throw new BadRequestException("At least one allocation required");
    }
    const totalAmount = Number(payment.amount);
    const totalAlloc = dto.allocations.reduce((s, a) => s + Number(a.amount), 0);
    if (Math.abs(totalAlloc - totalAmount) > 0.01) {
      throw new BadRequestException(
        `Total allocated ${totalAlloc} must equal payment amount ${totalAmount}`,
      );
    }
    const paymentAmountUsd = payment.amountUsd != null ? Number(payment.amountUsd) : null;
    const currency = payment.currency || "USD";
    const paidAt = payment.paidAt;

    for (const a of dto.allocations) {
      const amount = Number(a.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new BadRequestException("Each allocation amount must be positive");
      }
      const order = await this.prisma.order.findUnique({ where: { id: a.orderId } });
      if (!order) throw new NotFoundException(`Order not found: ${a.orderId}`);
      if (actor?.role === UserRole.MANAGER && order.ownerId !== actor.id) {
        throw new ForbiddenException("You can only assign to orders assigned to you");
      }
    }

    const orderIds = new Set<string>([payment.orderId, ...dto.allocations.map((a) => a.orderId)]);

    await this.prisma.payment.delete({ where: { id } });

    for (const a of dto.allocations) {
      const amount = Number(a.amount);
      const amountUsd =
        paymentAmountUsd != null && totalAmount > 0
          ? (amount / totalAmount) * paymentAmountUsd
          : undefined;
      await this.prisma.payment.create({
        data: {
          orderId: a.orderId,
          sourceType: PaymentSourceType.BANK,
          amount,
          currency,
          amountUsd: amountUsd != null ? amountUsd : undefined,
          paidAt,
          status: PaymentStatus.COMPLETED,
          bankTransactionId: payment.bankTransactionId,
          createdByUserId: actor?.id ?? null,
        },
      });
    }

    for (const oid of orderIds) {
      await this.recalcOrder(oid);
    }

    return this.list({ page: 1, pageSize: 50, offset: 0, limit: 50 });
  }

  async recalcOrder(orderId: string): Promise<void> {
    const [payments, rates] = await Promise.all([
      this.prisma.payment.findMany({
        where: { orderId, status: PaymentStatus.COMPLETED },
        select: { amount: true, currency: true, amountUsd: true },
      }),
      this.settings.getExchangeRates(),
    ]);
    const paidAmount = payments.reduce((sum, p) => {
      const usd =
        p.amountUsd != null
          ? Number(p.amountUsd)
          : convertToUsd(Number(p.amount), p.currency || "USD", rates);
      return sum + usd;
    }, 0);
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) return;
    const total = Number(order.totalAmount);
    const debtAmount = Math.max(0, total - paidAmount);
    await this.prisma.order.update({
      where: { id: orderId },
      data: { paidAmount, debtAmount },
    });
  }
}
