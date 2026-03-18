import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { ReturnStatus } from "@prisma/client";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import {
  computeFinancialStatusFromOrder,
  orderStageToDeliveryStatus,
} from "../orders/order-status-sync.mapper";
import { PaymentsService } from "../payments/payments.service";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateOrderReturnDto } from "./dto/create-order-return.dto";
import type { ListOrderReturnsQueryDto } from "./dto/list-order-returns-query.dto";

const ALLOWED_TRANSITIONS: Record<ReturnStatus, ReturnStatus[]> = {
  REQUESTED: ["APPROVED"],
  APPROVED: ["IN_TRANSIT_BACK"],
  IN_TRANSIT_BACK: ["RECEIVED_BY_WAREHOUSE"],
  RECEIVED_BY_WAREHOUSE: ["INSPECTION"],
  INSPECTION: ["REFUND_OR_ADJUSTMENT"],
  REFUND_OR_ADJUSTMENT: ["CLOSED"],
  CLOSED: [],
};

@Injectable()
export class OrderReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
  ) {}

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

    const newStage = "RETURN_IN_PROGRESS";
    const deliveryStatus = orderStageToDeliveryStatus(newStage);
    const financialStatus = computeFinancialStatusFromOrder({
      paymentType: order.paymentType,
      totalAmount: Number(order.totalAmount),
      paidAmount: Number(order.paidAmount),
      debtAmount: Number(order.debtAmount),
      paymentDueDate: order.paymentDueDate ?? undefined,
      orderStage: newStage,
    });

    const [created] = await this.prisma.$transaction([
      this.prisma.orderReturn.create({
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
      }),
      this.prisma.order.update({
        where: { id: orderId },
        data: {
          orderStage: newStage,
          deliveryStatus,
          financialStatus,
        },
      }),
    ]);

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

  async updateStatus(id: string, status: ReturnStatus, actor?: AuthUser) {
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
    if (status === "CLOSED") updates.closedAt = new Date();

    const updated = await this.prisma.orderReturn.update({
      where: { id },
      data: updates,
      include: {
        order: true,
        items: { include: { orderItem: true } },
      },
    });

    if (status === "CLOSED") {
      const orderId = r.orderId;

      const allClosed = await this.prisma.orderReturn.findMany({
        where: { orderId, status: "CLOSED" },
        include: { items: { include: { orderItem: true } } },
      });
      const totalAdjustment = allClosed.reduce((sum, ret) => {
        return sum + ret.items.reduce((s, ri) => s + Number(ri.orderItem.price) * ri.qtyReturned, 0);
      }, 0);

      await this.prisma.order.update({
        where: { id: orderId },
        data: { returnAdjustmentAmount: totalAdjustment },
      });
      await this.payments.recalcOrder(orderId);

      const openCount = await this.prisma.orderReturn.count({
        where: { orderId, status: { not: "CLOSED" } },
      });
      if (openCount === 0) {
        const orderAfter = await this.prisma.order.findUnique({
          where: { id: orderId },
          select: {
            debtAmount: true,
            paymentType: true,
            totalAmount: true,
            paidAmount: true,
            returnAdjustmentAmount: true,
            paymentDueDate: true,
          },
        });
        const nextStage =
          orderAfter && Number(orderAfter.debtAmount ?? 0) <= 0 ? "COMPLETED" : "RECEIVED";
        const effectiveTotal = Math.max(
          0,
          Number(orderAfter?.totalAmount ?? 0) - Number(orderAfter?.returnAdjustmentAmount ?? 0),
        );
        const deliveryStatus = orderStageToDeliveryStatus(nextStage);
        const financialStatus = orderAfter
          ? computeFinancialStatusFromOrder({
              paymentType: orderAfter.paymentType,
              totalAmount: effectiveTotal,
              paidAmount: Number(orderAfter.paidAmount),
              debtAmount: Number(orderAfter.debtAmount),
              paymentDueDate: orderAfter.paymentDueDate ?? undefined,
              orderStage: nextStage,
            })
          : undefined;

        await this.prisma.order.update({
          where: { id: orderId },
          data: {
            orderStage: nextStage,
            deliveryStatus,
            ...(financialStatus != null && { financialStatus }),
          },
        });
      }
    }

    return updated;
  }
}
