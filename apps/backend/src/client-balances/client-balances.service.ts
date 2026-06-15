import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ClientBalanceTransactionType,
  PaymentSourceType,
  PaymentStatus,
  Prisma,
  ReturnSettlementType,
  UserRole,
} from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { computeReturnAdjustmentAmount } from "../order-returns/order-return-adjustment.utils";
import { PaymentsService } from "../payments/payments.service";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService, type ExchangeRates } from "../settings/settings.service";
import { toUsd } from "../common/currency.util";
import { computeOrderOverpayment, resolveBalanceHolder } from "./balance-holder.utils";
import type { ApplyCreditDto } from "./dto/apply-credit.dto";
import type { SettleReturnDto } from "./dto/settle-return.dto";

function convertToUsd(amount: number, currency: string, rates: ExchangeRates): number {
  return toUsd(amount, currency, rates);
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

@Injectable()
export class ClientBalancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly payments: PaymentsService,
  ) {}

  private assertManagerOrderAccess(order: { ownerId: string }, actor?: AuthUser) {
    if (!actor) return;
    if (actor.role === UserRole.MANAGER && order.ownerId !== actor.id) {
      throw new ForbiddenException("You can only access balances for orders assigned to you");
    }
  }

  async getBalanceForHolder(
    holderKind: "CONTACT" | "COMPANY",
    holderId: string,
    currency?: string,
  ) {
    const where: Prisma.ClientBalanceWhereInput = { holderKind, holderId };
    if (currency) where.currency = currency.toUpperCase();
    const rows = await this.prisma.clientBalance.findMany({
      where,
      orderBy: { currency: "asc" },
    });
    return rows.map((r) => ({
      id: r.id,
      holderKind: r.holderKind,
      holderId: r.holderId,
      currency: r.currency,
      amount: Number(r.amount),
    }));
  }

  async getBalanceForOrder(orderId: string, actor?: AuthUser) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        ownerId: true,
        clientId: true,
        contactId: true,
        companyId: true,
        currency: true,
        totalAmount: true,
        paidAmount: true,
        returnAdjustmentAmount: true,
      },
    });
    if (!order) throw new NotFoundException("Order not found");
    this.assertManagerOrderAccess(order, actor);

    try {
      const holder = resolveBalanceHolder(order);
      const balances = await this.getBalanceForHolder(holder.holderKind, holder.holderId);
      return {
        orderId,
        currency: order.currency,
        overpayment: computeOrderOverpayment(order),
        holderKind: holder.holderKind,
        holderId: holder.holderId,
        balances,
      };
    } catch {
      return {
        orderId,
        currency: order.currency,
        overpayment: computeOrderOverpayment(order),
        balances: [] as Array<{ currency: string; amount: number }>,
      };
    }
  }

  async listTransactions(
    params: { holderKind: "CONTACT" | "COMPANY"; holderId: string; page?: number; pageSize?: number },
    actor?: AuthUser,
  ) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 30));
    const balances = await this.prisma.clientBalance.findMany({
      where: { holderKind: params.holderKind, holderId: params.holderId },
      select: { id: true },
    });
    if (balances.length === 0) return { items: [], total: 0, page, pageSize };

    const where = { balanceId: { in: balances.map((b) => b.id) } };
    const [items, total] = await Promise.all([
      this.prisma.clientBalanceTransaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          order: { select: { id: true, orderNumber: true } },
          orderReturn: { select: { id: true, status: true } },
          createdBy: { select: { id: true, fullName: true } },
        },
      }),
      this.prisma.clientBalanceTransaction.count({ where }),
    ]);

    return {
      items: items.map((t) => ({
        id: t.id,
        type: t.type,
        amount: Number(t.amount),
        currency: t.currency,
        orderId: t.orderId,
        orderNumber: t.order?.orderNumber ?? null,
        orderReturnId: t.orderReturnId,
        note: t.note,
        createdAt: t.createdAt,
        createdBy: t.createdBy,
      })),
      total,
      page,
      pageSize,
    };
  }

  async getReturnSettlementPreview(returnId: string, actor?: AuthUser) {
    const ret = await this.prisma.orderReturn.findUnique({
      where: { id: returnId },
      include: {
        items: { include: { orderItem: true } },
        order: {
          select: {
            id: true,
            ownerId: true,
            currency: true,
            totalAmount: true,
            subtotalAmount: true,
            paidAmount: true,
            returnAdjustmentAmount: true,
            clientId: true,
            contactId: true,
            companyId: true,
          },
        },
      },
    });
    if (!ret) throw new NotFoundException("Return not found");
    this.assertManagerOrderAccess(ret.order, actor);

    const closedOthers = await this.prisma.orderReturn.findMany({
      where: { orderId: ret.orderId, status: "CLOSED", id: { not: ret.id } },
      include: { items: { include: { orderItem: true } } },
    });
    const allClosedIncludingThis = [...closedOthers, { items: ret.items }];
    const adjustmentAfter = computeReturnAdjustmentAmount(allClosedIncludingThis, {
      subtotalAmount: ret.order.subtotalAmount ?? 0,
      totalAmount: ret.order.totalAmount ?? 0,
    });
    const thisReturnAmount = computeReturnAdjustmentAmount([{ items: ret.items }], {
      subtotalAmount: ret.order.subtotalAmount ?? 0,
      totalAmount: ret.order.totalAmount ?? 0,
    });
    const overpaymentAfter = computeOrderOverpayment({
      totalAmount: Number(ret.order.totalAmount ?? 0),
      returnAdjustmentAmount: adjustmentAfter,
      paidAmount: Number(ret.order.paidAmount ?? 0),
    });
    const maxSettle = roundMoney(Math.min(thisReturnAmount, overpaymentAfter));

    return {
      returnId,
      orderId: ret.orderId,
      currency: ret.order.currency,
      returnAmount: roundMoney(thisReturnAmount),
      overpaymentAfterClose: roundMoney(overpaymentAfter),
      maxSettleAmount: maxSettle,
      requiresSettlement: maxSettle > 0.009,
      alreadySettled: Boolean(ret.settledAt),
    };
  }

  private normalizeSettlement(dto: SettleReturnDto): {
    type: ReturnSettlementType;
    creditAmount: number;
    refundAmount: number;
  } {
    const credit = roundMoney(Number(dto.creditAmount ?? 0));
    const refund = roundMoney(Number(dto.refundAmount ?? 0));
    if (dto.type === "CREDIT") {
      if (credit <= 0) throw new BadRequestException("creditAmount must be positive for CREDIT settlement");
      if (refund > 0) throw new BadRequestException("refundAmount must be 0 for CREDIT settlement");
      return { type: "CREDIT", creditAmount: credit, refundAmount: 0 };
    }
    if (dto.type === "REFUND") {
      if (refund <= 0) throw new BadRequestException("refundAmount must be positive for REFUND settlement");
      if (credit > 0) throw new BadRequestException("creditAmount must be 0 for REFUND settlement");
      return { type: "REFUND", creditAmount: 0, refundAmount: refund };
    }
    if (credit <= 0 && refund <= 0) {
      throw new BadRequestException("SPLIT settlement requires creditAmount and/or refundAmount");
    }
    return { type: "SPLIT", creditAmount: credit, refundAmount: refund };
  }

  async settleReturn(returnId: string, dto: SettleReturnDto, actor?: AuthUser) {
    const settlement = this.normalizeSettlement(dto);
    const totalSettle = roundMoney(settlement.creditAmount + settlement.refundAmount);

    const preview = await this.getReturnSettlementPreview(returnId, actor);
    if (preview.alreadySettled) throw new BadRequestException("Return is already settled");
    if (totalSettle > preview.maxSettleAmount + 0.009) {
      throw new BadRequestException(
        `Settlement total ${totalSettle} exceeds max ${preview.maxSettleAmount}`,
      );
    }

    const ret = await this.prisma.orderReturn.findUnique({
      where: { id: returnId },
      include: {
        order: {
          select: {
            id: true,
            ownerId: true,
            orderNumber: true,
            currency: true,
            clientId: true,
            contactId: true,
            companyId: true,
          },
        },
      },
    });
    if (!ret) throw new NotFoundException("Return not found");

    const holder = resolveBalanceHolder(ret.order);
    const currency = (ret.order.currency || "UAH").toUpperCase();

    await this.prisma.$transaction(async (tx) => {
      const balance = await this.ensureBalanceTx(tx, holder, currency);

      if (settlement.creditAmount > 0) {
        await this.postTransactionTx(tx, {
          balanceId: balance.id,
          type: "CREDIT_FROM_RETURN",
          amount: settlement.creditAmount,
          affectsBalance: true,
          currency,
          holder,
          orderId: ret.orderId,
          orderReturnId: returnId,
          note: dto.note ?? `Залік з повернення по замовленню ${ret.order.orderNumber ?? ret.orderId}`,
          actorId: actor?.id,
        });
      }

      if (settlement.refundAmount > 0) {
        await this.postTransactionTx(tx, {
          balanceId: balance.id,
          type: "REFUND_OUT",
          amount: settlement.refundAmount,
          affectsBalance: false,
          currency,
          holder,
          orderId: ret.orderId,
          orderReturnId: returnId,
          note:
            dto.note ??
            `Повернення коштів ${settlement.refundAmount} ${currency} по замовленню ${ret.order.orderNumber ?? ret.orderId}`,
          actorId: actor?.id,
        });
      }

      await tx.orderReturn.update({
        where: { id: returnId },
        data: {
          settlementType: settlement.type,
          creditAmount: settlement.creditAmount || null,
          refundAmount: settlement.refundAmount || null,
          settledAt: new Date(),
          settledByUserId: actor?.id ?? null,
        },
      });
    });

    return this.getReturnSettlementPreview(returnId, actor);
  }

  async applyCreditToOrder(orderId: string, dto: ApplyCreditDto, actor?: AuthUser) {
    const amount = roundMoney(Number(dto.amount));
    if (amount <= 0) throw new BadRequestException("Amount must be positive");

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        ownerId: true,
        orderNumber: true,
        currency: true,
        totalAmount: true,
        paidAmount: true,
        returnAdjustmentAmount: true,
        clientId: true,
        contactId: true,
        companyId: true,
      },
    });
    if (!order) throw new NotFoundException("Order not found");
    this.assertManagerOrderAccess(order, actor);

    const effectiveDebt = Math.max(
      0,
      Number(order.totalAmount ?? 0) -
        Number(order.returnAdjustmentAmount ?? 0) -
        Number(order.paidAmount ?? 0),
    );
    if (effectiveDebt <= 0.009) {
      throw new BadRequestException("Order has no debt to apply credit to");
    }
    if (amount > effectiveDebt + 0.009) {
      throw new BadRequestException(`Amount exceeds order debt (${roundMoney(effectiveDebt)})`);
    }

    const holder = resolveBalanceHolder(order);
    const currency = (order.currency || "UAH").toUpperCase();
    const balance = await this.prisma.clientBalance.findUnique({
      where: {
        holderKind_holderId_currency: {
          holderKind: holder.holderKind,
          holderId: holder.holderId,
          currency,
        },
      },
    });
    const available = Number(balance?.amount ?? 0);
    if (!balance || amount > available + 0.009) {
      throw new BadRequestException(`Insufficient balance (${roundMoney(available)} ${currency})`);
    }

    const rates = await this.settings.getExchangeRates();
    const amountUsd = convertToUsd(amount, currency, rates);

    const payment = await this.prisma.$transaction(async (tx) => {
      const txRow = await this.postTransactionTx(tx, {
        balanceId: balance.id,
        type: "APPLY_TO_ORDER",
        amount: -amount,
        affectsBalance: true,
        currency,
        holder,
        orderId,
        note: dto.note ?? `Залік на замовлення ${order.orderNumber ?? orderId}`,
        actorId: actor?.id,
      });

      const createdPayment = await tx.payment.create({
        data: {
          orderId,
          contactId: holder.contactId,
          companyId: holder.companyId,
          sourceType: PaymentSourceType.CREDIT,
          amount,
          currency,
          amountUsd,
          paidAt: new Date(),
          status: PaymentStatus.COMPLETED,
          createdByUserId: actor?.id ?? null,
          note: dto.note ?? "Залік з балансу клієнта",
        },
      });

      await tx.clientBalanceTransaction.update({
        where: { id: txRow.id },
        data: { paymentId: createdPayment.id },
      });

      return createdPayment;
    });

    await this.payments.recalcOrder(orderId);

    return {
      paymentId: payment.id,
      orderId,
      amount,
      currency,
      balance: await this.getBalanceForOrder(orderId, actor),
    };
  }

  private async ensureBalanceTx(
    tx: Prisma.TransactionClient,
    holder: ReturnType<typeof resolveBalanceHolder>,
    currency: string,
  ) {
    const existing = await tx.clientBalance.findUnique({
      where: {
        holderKind_holderId_currency: {
          holderKind: holder.holderKind,
          holderId: holder.holderId,
          currency,
        },
      },
    });
    if (existing) return existing;
    return tx.clientBalance.create({
      data: {
        holderKind: holder.holderKind,
        holderId: holder.holderId,
        currency,
        contactId: holder.contactId,
        companyId: holder.companyId,
      },
    });
  }

  private async postTransactionTx(
    tx: Prisma.TransactionClient,
    params: {
      balanceId: string;
      type: ClientBalanceTransactionType;
      amount: number;
      affectsBalance: boolean;
      currency: string;
      holder: ReturnType<typeof resolveBalanceHolder>;
      orderId?: string;
      orderReturnId?: string;
      note?: string;
      actorId?: string;
    },
  ) {
    const signedDelta = params.affectsBalance
      ? params.type === "REFUND_OUT"
        ? 0
        : roundMoney(params.type === "APPLY_TO_ORDER" ? -Math.abs(params.amount) : Math.abs(params.amount))
      : 0;

    if (params.affectsBalance) {
      const balance = await tx.clientBalance.update({
        where: { id: params.balanceId },
        data: { amount: { increment: signedDelta } },
      });
      if (Number(balance.amount) < -0.009) {
        throw new BadRequestException("Insufficient client balance");
      }
    }

    return tx.clientBalanceTransaction.create({
      data: {
        balanceId: params.balanceId,
        type: params.type,
        amount: roundMoney(params.amount),
        currency: params.currency,
        contactId: params.holder.contactId,
        companyId: params.holder.companyId,
        orderId: params.orderId ?? null,
        orderReturnId: params.orderReturnId ?? null,
        note: params.note ?? null,
        createdByUserId: params.actorId ?? null,
      },
    });
  }
}
