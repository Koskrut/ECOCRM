import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { OrderStage } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { AuditService } from "../audit/audit.service";
import { IntegrationPortsService } from "../integration-ports/integration-ports.service";
import { PrismaService } from "../prisma/prisma.service";
import type { FxWriteOffDto } from "./dto/fx-write-off.dto";
import {
  computeFxVarianceSnapshot,
  FX_MAX_WRITE_OFF_USD,
  type FxVarianceSnapshot,
} from "./fx-variance.utils";
import { OrdersService } from "./orders.service";

export type FxVarianceQueueItem = {
  id: string;
  orderNumber: string;
  orderStage: OrderStage | null;
  currency: string;
  exchangeRate: number | null;
  totalAmount: number;
  returnAdjustmentAmount: number;
  paidAmount: number;
  debtAmount: number;
  fxWriteOffAmount: number;
  company: { id: string; name: string } | null;
  client: { id: string; firstName: string; lastName: string } | null;
  contact: { id: string; firstName: string; lastName: string } | null;
  fxVariance: FxVarianceSnapshot;
};

@Injectable()
export class FxVarianceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integrations: IntegrationPortsService,
    private readonly orders: OrdersService,
    private readonly audit: AuditService,
  ) {}

  private assertActor(actor?: AuthUser) {
    if (!actor) throw new ForbiddenException("Authentication required");
    if (
      actor.role !== UserRole.ADMIN &&
      actor.role !== UserRole.LEAD &&
      actor.role !== UserRole.MANAGER
    ) {
      throw new ForbiddenException("Insufficient permissions");
    }
  }

  private assertOrderOwner(orderOwnerId: string, actor: AuthUser) {
    if (actor.role === UserRole.MANAGER && orderOwnerId !== actor.id) {
      throw new ForbiddenException("You can only manage orders assigned to you");
    }
  }

  private async loadCandidateOrders(actor: AuthUser) {
    const where = {
      debtAmount: { gt: 0, lte: FX_MAX_WRITE_OFF_USD },
      currency: { in: ["USD", "EUR"] },
      exchangeRate: { gt: 0 },
      ...(actor.role === UserRole.MANAGER ? { ownerId: actor.id } : {}),
    };
    const orders = await this.prisma.order.findMany({
      where,
      include: {
        company: { select: { id: true, name: true } },
        client: { select: { id: true, firstName: true, lastName: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
        payments: {
          select: { amount: true, currency: true, status: true, sourceType: true },
        },
        returns: {
          where: { status: { not: "CLOSED" } },
          select: { id: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });
    const items: FxVarianceQueueItem[] = [];
    for (const o of orders) {
      const fxVariance = computeFxVarianceSnapshot(
        {
          currency: o.currency,
          exchangeRate: o.exchangeRate,
          totalAmount: o.totalAmount,
          returnAdjustmentAmount: o.returnAdjustmentAmount,
          paidAmount: o.paidAmount,
          debtAmount: o.debtAmount,
          fxWriteOffAmount: o.fxWriteOffAmount,
          orderStage: o.orderStage,
          openReturnCount: o.returns.length,
        },
        o.payments.map((p) => ({
          amount: Number(p.amount),
          currency: p.currency,
          status: p.status,
          sourceType: p.sourceType,
        })),
      );
      if (!fxVariance.isCandidate) continue;
      items.push({
        id: o.id,
        orderNumber: o.orderNumber,
        orderStage: o.orderStage,
        currency: o.currency,
        exchangeRate: o.exchangeRate,
        totalAmount: o.totalAmount,
        returnAdjustmentAmount: o.returnAdjustmentAmount,
        paidAmount: o.paidAmount,
        debtAmount: o.debtAmount,
        fxWriteOffAmount: o.fxWriteOffAmount,
        company: o.company,
        client: o.client,
        contact: o.contact,
        fxVariance,
      });
    }
    return items;
  }

  async listQueue(
    query: { page?: number; pageSize?: number },
    actor?: AuthUser,
  ): Promise<{ items: FxVarianceQueueItem[]; total: number; page: number; pageSize: number }> {
    this.assertActor(actor);
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 50)));
    const all = await this.loadCandidateOrders(actor!);
    const total = all.length;
    const skip = (page - 1) * pageSize;
    const items = all.slice(skip, skip + pageSize);
    return { items, total, page, pageSize };
  }

  async getSummary(actor?: AuthUser): Promise<{ count: number; totalResidualUsd: number }> {
    this.assertActor(actor);
    const all = await this.loadCandidateOrders(actor!);
    const totalResidualUsd = all.reduce((s, o) => s + o.fxVariance.suggestedWriteOffUsd, 0);
    return { count: all.length, totalResidualUsd };
  }

  async writeOff(orderId: string, dto: FxWriteOffDto, actor?: AuthUser) {
    this.assertActor(actor);
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        payments: {
          select: { amount: true, currency: true, status: true, sourceType: true },
        },
        returns: {
          where: { status: { not: "CLOSED" } },
          select: { id: true },
        },
      },
    });
    if (!order) throw new NotFoundException("Order not found");
    this.assertOrderOwner(order.ownerId, actor!);

    const payments = order.payments.map((p) => ({
      amount: Number(p.amount),
      currency: p.currency,
      status: p.status,
      sourceType: p.sourceType,
    }));

    const snapshot = computeFxVarianceSnapshot(
      {
        currency: order.currency,
        exchangeRate: order.exchangeRate,
        totalAmount: order.totalAmount,
        returnAdjustmentAmount: order.returnAdjustmentAmount,
        paidAmount: order.paidAmount,
        debtAmount: order.debtAmount,
        fxWriteOffAmount: order.fxWriteOffAmount,
        orderStage: order.orderStage,
        openReturnCount: order.returns.length,
      },
      payments,
    );

    if (!snapshot.isCandidate) {
      throw new BadRequestException("Order is not eligible for FX variance write-off");
    }

    const note = (dto.note ?? "").trim();
    if (note.length < 5) {
      throw new BadRequestException("Note is required (min 5 characters)");
    }

    const debtUsd = snapshot.suggestedWriteOffUsd;
    const amount =
      dto.amount != null ? Math.min(Number(dto.amount), debtUsd) : debtUsd;
    if (!(amount > 0)) {
      throw new BadRequestException("Write-off amount must be positive");
    }

    const before = {
      fxWriteOffAmount: order.fxWriteOffAmount,
      debtAmount: order.debtAmount,
      orderStage: order.orderStage,
    };

    const nextFxWriteOff = Number(order.fxWriteOffAmount ?? 0) + amount;
    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        fxWriteOffAmount: nextFxWriteOff,
        fxWriteOffNote: note,
        fxWriteOffAt: new Date(),
        fxWriteOffByUserId: actor!.id,
      },
    });

    await this.integrations.recalcOrderFinance(orderId);

    const afterOrder = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { fxWriteOffAmount: true, debtAmount: true, orderStage: true },
    });

    const autoComplete = dto.autoComplete !== false && snapshot.canAutoComplete;
    if (autoComplete && afterOrder?.orderStage === "RECEIVED") {
      await this.orders.setOrderStage(orderId, "COMPLETED", actor, note);
    }

    const finalOrder = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { fxWriteOffAmount: true, debtAmount: true, orderStage: true },
    });

    await this.audit.write(
      this.audit.buildUpdatePayload({
        entityType: "Order",
        entityId: orderId,
        changedBy: actor!.id,
        changedByRole: actor!.role,
        before,
        after: {
          fxWriteOffAmount: finalOrder?.fxWriteOffAmount,
          debtAmount: finalOrder?.debtAmount,
          orderStage: finalOrder?.orderStage,
        },
        context: {
          reason: "fx_write_off",
          note,
          amount,
          paidUah: snapshot.paidUah,
          expectedUah: snapshot.expectedUah,
          residualUah: snapshot.residualUah,
        },
      }),
    );

    return {
      ok: true,
      orderId,
      fxWriteOffAmount: finalOrder?.fxWriteOffAmount ?? nextFxWriteOff,
      debtAmount: finalOrder?.debtAmount ?? 0,
      orderStage: finalOrder?.orderStage ?? order.orderStage,
      autoCompleted: autoComplete && finalOrder?.orderStage === "COMPLETED",
    };
  }
}
