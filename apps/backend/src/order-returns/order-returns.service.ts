import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { OrderStage, Prisma } from "@prisma/client";
import type { ReturnStatus } from "@prisma/client";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { IntegrationPortsService } from "../integration-ports/integration-ports.service";
import {
  computeFinancialStatusFromOrder,
  orderStageToDeliveryStatus,
} from "../orders/order-status-sync.mapper";
import { getOrderCompletionBlockers } from "../orders/order-completion-guards";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateOrderReturnDto } from "./dto/create-order-return.dto";
import type { ListOrderReturnsQueryDto } from "./dto/list-order-returns-query.dto";
import type { SettleReturnDto } from "../client-balances/dto/settle-return.dto";
import { computeReturnAdjustmentAmount } from "./order-return-adjustment.utils";
import { computeReturnCoverage } from "./order-return-coverage.utils";

const ALLOWED_TRANSITIONS: Record<ReturnStatus, ReturnStatus[]> = {
  REQUESTED: ["APPROVED"],
  APPROVED: ["IN_TRANSIT_BACK"],
  IN_TRANSIT_BACK: ["RECEIVED_BY_WAREHOUSE"],
  RECEIVED_BY_WAREHOUSE: ["INSPECTION"],
  INSPECTION: ["REFUND_OR_ADJUSTMENT"],
  REFUND_OR_ADJUSTMENT: ["CLOSED"],
  CLOSED: [],
};

const CLOSED_RETURN_STATUS: ReturnStatus = "CLOSED";

@Injectable()
export class OrderReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integrations: IntegrationPortsService,
  ) {}

  private async syncOrderStateFromReturns(orderId: string) {
    const [openCount, allReturns, orderSnapshot] = await Promise.all([
      this.prisma.orderReturn.count({
        where: { orderId, status: { not: CLOSED_RETURN_STATUS } },
      }),
      this.prisma.orderReturn.findMany({
        where: { orderId },
        include: { items: { include: { orderItem: true } } },
      }),
      this.prisma.order.findUnique({
        where: { id: orderId },
        select: {
          subtotalAmount: true,
          totalAmount: true,
          orderStage: true,
          items: { select: { id: true, qty: true } },
        },
      }),
    ]);
    if (!orderSnapshot) throw new NotFoundException("Order not found");

    const coverage = computeReturnCoverage(
      orderSnapshot.items,
      allReturns.flatMap((r) =>
        r.items.map((ri) => ({
          orderItemId: ri.orderItemId,
          qtyReturned: ri.qtyReturned,
        })),
      ),
    );

    const totalAdjustment = computeReturnAdjustmentAmount(allReturns, {
      subtotalAmount: orderSnapshot.subtotalAmount ?? 0,
      totalAmount: orderSnapshot.totalAmount ?? 0,
    });

    await this.prisma.order.update({
      where: { id: orderId },
      data: { returnAdjustmentAmount: totalAdjustment },
    });
    await this.integrations.recalcOrderFinance(orderId);

    const orderAfter = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        debtAmount: true,
        paymentType: true,
        totalAmount: true,
        paidAmount: true,
        returnAdjustmentAmount: true,
        paymentDueDate: true,
        subtotalAmount: true,
      },
    });
    if (!orderAfter) throw new NotFoundException("Order not found");

    const stageByDebt = (): OrderStage =>
      Number(orderAfter.debtAmount) <= 0.00001 ? "COMPLETED" : "RECEIVED";

    let nextStage: OrderStage;
    if (openCount > 0) {
      if (coverage === "FULL") {
        // Full return in flight — only these go to «Повернення».
        nextStage = "RETURN_IN_PROGRESS";
      } else {
        // Partial open return: keep RECEIVED/COMPLETED; migrate legacy RETURN_IN_PROGRESS away.
        const current = orderSnapshot.orderStage;
        nextStage =
          current === "RECEIVED" || current === "COMPLETED" ? current : stageByDebt();
      }
    } else if (coverage === "FULL") {
      nextStage = "FULLY_RETURNED";
    } else {
      const completionBlockers = await getOrderCompletionBlockers(this.prisma, orderId, {
        paymentType: orderAfter.paymentType,
        paidAmount: orderAfter.paidAmount,
        totalAmount: orderAfter.totalAmount,
        subtotalAmount: orderAfter.subtotalAmount ?? 0,
        debtAmount: orderAfter.debtAmount,
        returnAdjustmentAmount: orderAfter.returnAdjustmentAmount,
        paymentDueDate: orderAfter.paymentDueDate,
      });
      nextStage = completionBlockers.length === 0 ? "COMPLETED" : "RECEIVED";
    }

    const effectiveTotal = Math.max(
      0,
      Number(orderAfter.totalAmount ?? 0) - Number(orderAfter.returnAdjustmentAmount ?? 0),
    );
    const deliveryStatus = orderStageToDeliveryStatus(nextStage);
    const financialStatus = computeFinancialStatusFromOrder({
      paymentType: orderAfter.paymentType,
      totalAmount: effectiveTotal,
      paidAmount: Number(orderAfter.paidAmount),
      debtAmount: Number(orderAfter.debtAmount),
      paymentDueDate: orderAfter.paymentDueDate ?? undefined,
      orderStage: nextStage,
    });

    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        orderStage: nextStage,
        deliveryStatus,
        financialStatus,
      },
    });
  }

  private assertAccess(order: { ownerId: string | null }, actor?: AuthUser) {
    if (!actor) return;
    if (actor.role === UserRole.MANAGER && order.ownerId !== actor.id) {
      throw new ForbiddenException("You can only access returns for orders assigned to you");
    }
  }

  async create(orderId: string, dto: CreateOrderReturnDto, actor?: AuthUser) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        company: true,
        client: true,
      },
    });
    if (!order) throw new NotFoundException("Order not found");
    this.assertAccess(order, actor);

    const currentStage = order.orderStage ?? undefined;
    const canCreateReturn =
      currentStage === "RECEIVED" ||
      currentStage === "COMPLETED" ||
      currentStage === "RETURN_IN_PROGRESS";
    if (!canCreateReturn) {
      throw new BadRequestException(
        "Return can only be created for orders in RECEIVED, COMPLETED or RETURN_IN_PROGRESS stage",
      );
    }

    if (!dto.items?.length) {
      throw new BadRequestException("At least one item is required");
    }

    const orderItemIds = new Map(order.items.map((i) => [i.id, i]));
    const merged = new Map<string, number>();
    for (const it of dto.items) {
      const oi = orderItemIds.get(it.orderItemId);
      if (!oi) {
        throw new BadRequestException(`Order item ${it.orderItemId} not found in order`);
      }
      const qty = Math.min(Math.max(1, Math.floor(it.qtyReturned)), oi.qty);
      merged.set(oi.id, Math.min((merged.get(oi.id) ?? 0) + qty, oi.qty));
    }
    const returnItems = Array.from(merged.entries()).map(([orderItemId, qtyReturned]) => ({
      orderItemId,
      qtyReturned,
    }));

    const alreadyReturned = await this.prisma.orderReturnItem.groupBy({
      by: ["orderItemId"],
      where: {
        orderItemId: { in: returnItems.map((it) => it.orderItemId) },
        orderReturn: { orderId },
      },
      _sum: { qtyReturned: true },
    });
    const returnedByItem = new Map<string, number>(
      alreadyReturned.map((row) => [row.orderItemId, row._sum.qtyReturned ?? 0]),
    );
    for (const item of returnItems) {
      const orderItem = orderItemIds.get(item.orderItemId)!;
      const totalReturned = (returnedByItem.get(item.orderItemId) ?? 0) + item.qtyReturned;
      if (totalReturned > orderItem.qty) {
        throw new BadRequestException(
          `Return quantity exceeds purchased quantity for item ${item.orderItemId}: ${totalReturned} > ${orderItem.qty}`,
        );
      }
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const createdReturn = await tx.orderReturn.create({
        data: {
          orderId,
          status: "REQUESTED",
          items: {
            create: returnItems.map((r) => ({
              orderItemId: r.orderItemId,
              qtyReturned: r.qtyReturned,
            })),
          },
        },
        include: {
          items: { include: { orderItem: true } },
          order: { select: { id: true, orderNumber: true } },
        },
      });
      return createdReturn;
    });

    await this.syncOrderStateFromReturns(orderId);

    return created;
  }

  async list(q: ListOrderReturnsQueryDto, actor?: AuthUser) {
    const page = Math.max(1, q?.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, q?.pageSize ?? 50));
    const where: Prisma.OrderReturnWhereInput = {};
    if (q?.orderId) where.orderId = q.orderId;
    if (q?.status) where.status = q.status;
    if (actor?.role === UserRole.MANAGER) {
      where.order = { ownerId: actor.id };
    }

    const [items, total] = await Promise.all([
      this.prisma.orderReturn.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              orderStage: true,
              totalAmount: true,
              debtAmount: true,
              paidAmount: true,
              currency: true,
              company: { select: { id: true, name: true } },
              client: { select: { id: true, firstName: true, lastName: true } },
            },
          },
          items: { include: { orderItem: { select: { id: true, qty: true, price: true, lineTotal: true, productNameSnapshot: true } } } },
        },
      }),
      this.prisma.orderReturn.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async listByOrderId(orderId: string, actor?: AuthUser) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, ownerId: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    this.assertAccess(order, actor);

    const items = await this.prisma.orderReturn.findMany({
      where: { orderId },
      orderBy: { createdAt: "desc" },
      include: {
        items: { include: { orderItem: { select: { id: true, qty: true, price: true, lineTotal: true, productNameSnapshot: true } } } },
      },
    });
    return { items };
  }

  async getById(id: string, actor?: AuthUser) {
    const r = await this.prisma.orderReturn.findUnique({
      where: { id },
      include: {
        order: {
          include: {
            company: { select: { id: true, name: true } },
            client: { select: { id: true, firstName: true, lastName: true } },
          },
        },
        items: { include: { orderItem: { include: { product: { select: { id: true, name: true, sku: true } } } } } },
      },
    });
    if (!r) throw new NotFoundException("Return not found");
    this.assertAccess(r.order, actor);
    return r;
  }

  async updateStatus(
    id: string,
    status: ReturnStatus,
    actor?: AuthUser,
    settlement?: SettleReturnDto,
  ) {
    const r = await this.prisma.orderReturn.findUnique({
      where: { id },
      include: {
        order: true,
        items: { include: { orderItem: true } },
      },
    });
    if (!r) throw new NotFoundException("Return not found");
    this.assertAccess(r.order, actor);

    const allowed = ALLOWED_TRANSITIONS[r.status];
    if (!allowed?.includes(status)) {
      throw new BadRequestException(
        `Transition from ${r.status} to ${status} is not allowed`,
      );
    }

    const updates: { status: ReturnStatus; closedAt?: Date } = { status };
    if (status === CLOSED_RETURN_STATUS) updates.closedAt = new Date();

    const updated = await this.prisma.orderReturn.update({
      where: { id },
      data: updates,
      include: {
        order: true,
        items: { include: { orderItem: true } },
      },
    });

    await this.syncOrderStateFromReturns(r.orderId);

    if (status === CLOSED_RETURN_STATUS) {
      let preview: { requiresSettlement?: boolean; maxSettleAmount?: number; alreadySettled?: boolean };
      try {
        preview = (await this.integrations.getReturnSettlementPreview(id, actor)) as typeof preview;
      } catch {
        preview = { requiresSettlement: false };
      }

      if (preview.requiresSettlement && !preview.alreadySettled) {
        if (!settlement) {
          throw new BadRequestException(
            `Return closure created overpayment (max ${preview.maxSettleAmount ?? 0}). Provide settlement (credit/refund).`,
          );
        }
        await this.integrations.settleReturn(id, settlement, actor);
      } else if (settlement) {
        await this.integrations.settleReturn(id, settlement, actor);
      }
    }

    return this.prisma.orderReturn.findUnique({
      where: { id },
      include: {
        order: true,
        items: { include: { orderItem: true } },
      },
    }) ?? updated;
  }

  getSettlementPreview(id: string, actor?: AuthUser) {
    return this.integrations.getReturnSettlementPreview(id, actor);
  }
}
